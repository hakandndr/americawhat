// GitHub Git Data API transaction: read the content files at the branch head,
// let a pure function compute the new contents, and publish them as ONE commit
// that fast-forwards the branch. If the branch moved in between (the fetch
// workflow or another approval committed), the ref update is refused by
// GitHub and the whole transaction is recomputed on the new head. A partial
// approval (published updated, pending not) cannot happen.
//
// The token lives only in this Worker's secret GITHUB_TOKEN. It is never
// logged or returned.

export const CONTENT_PATHS = Object.freeze({
  published: 'src/data/published.json',
  pending: 'src/data/pending.json',
  fetchStatus: 'src/data/fetch-status.json',
});

export class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function githubConfig(env) {
  const repo = String(env.BOSS_GITHUB_REPOSITORY || '');
  const branch = String(env.BOSS_GITHUB_BRANCH || '');
  const environment = String(env.ENVIRONMENT || '');
  const errors = [];
  if (!env.GITHUB_TOKEN) errors.push('GITHUB_TOKEN missing');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) errors.push('BOSS_GITHUB_REPOSITORY missing');
  if (!/^[\w./-]+$/.test(branch)) errors.push('BOSS_GITHUB_BRANCH missing');
  // Only the production Boss may write the production branch.
  if (environment !== 'production' && (branch === 'main' || branch === 'master')) errors.push(`a ${environment || 'non-production'} Boss must not write ${branch}`);
  if (!env.BOSS_COMMIT_AUTHOR_NAME || !env.BOSS_COMMIT_AUTHOR_EMAIL) errors.push('commit author not configured');
  return {
    ok: errors.length === 0,
    errors,
    repo,
    branch,
    author: { name: String(env.BOSS_COMMIT_AUTHOR_NAME || ''), email: String(env.BOSS_COMMIT_AUTHOR_EMAIL || '') },
  };
}

/** The real API, except for a local preview pointed at a loopback mock (ENVIRONMENT=local only). */
export function apiBase(env) {
  const base = String(env.BOSS_GITHUB_API_BASE || '');
  if (env.ENVIRONMENT === 'local' && /^http:\/\/127\.0\.0\.1:\d+$/.test(base)) return base;
  return 'https://api.github.com';
}

export function createGitHub(env, { fetchImpl = fetch, now = () => new Date() } = {}) {
  const config = githubConfig(env);
  const state = { tokenExpiration: null, rateRemaining: null };

  async function api(method, path, body) {
    if (!config.ok) throw new GitHubError(503, `GitHub not configured: ${config.errors.join('; ')}`);
    const res = await fetchImpl(`${apiBase(env)}/repos/${config.repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'americawhat-boss',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const exp = res.headers.get('github-authentication-token-expiration');
    if (exp) state.tokenExpiration = exp;
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining) state.rateRemaining = Number(remaining);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) throw new GitHubError(res.status, (data && data.message) || `GitHub ${method} ${path} failed (${res.status})`);
    return data;
  }

  async function readHead() {
    const ref = await api('GET', `/git/ref/heads/${encodeURIComponent(config.branch).replace(/%2F/g, '/')}`);
    const commitSha = ref.object.sha;
    const commit = await api('GET', `/git/commits/${commitSha}`);
    return { commitSha, treeSha: commit.tree.sha };
  }

  async function readFile(path, commitSha) {
    const data = await api('GET', `/contents/${path}?ref=${commitSha}`);
    if (!data || data.encoding !== 'base64' || typeof data.content !== 'string') {
      // Files above 1 MB come back without inline content; read the blob instead.
      const blob = await api('GET', `/git/blobs/${data.sha}`);
      return decodeBase64(blob.content);
    }
    return decodeBase64(data.content);
  }

  /** Reads the content files at the branch head. */
  async function snapshot(paths = [CONTENT_PATHS.published, CONTENT_PATHS.pending]) {
    const head = await readHead();
    const files = {};
    for (const p of paths) files[p] = await readFile(p, head.commitSha);
    return { head, files };
  }

  /**
   * transact({ message, compute, paths }) — compute(files) returns
   * { files: { path: newText }, result } or { files: {}, result } for a no-op.
   * Returns { commitSha | null, result, attempts }.
   */
  async function transact({ message, compute, paths, maxAttempts = 3 }) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { head, files } = await snapshot(paths);
      const { files: changed, result } = await compute(files);
      const entries = Object.entries(changed || {}).filter(([p, text]) => text !== files[p]);
      if (!entries.length) return { commitSha: null, result, attempts: attempt };
      const tree = [];
      for (const [path, text] of entries) {
        const blob = await api('POST', '/git/blobs', { content: text, encoding: 'utf-8' });
        tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
      }
      const newTree = await api('POST', '/git/trees', { base_tree: head.treeSha, tree });
      const stamp = now().toISOString();
      const commit = await api('POST', '/git/commits', {
        message,
        tree: newTree.sha,
        parents: [head.commitSha],
        author: { ...config.author, date: stamp },
        committer: { ...config.author, date: stamp },
      });
      try {
        await api('PATCH', `/git/refs/heads/${config.branch}`, { sha: commit.sha, force: false });
        return { commitSha: commit.sha, result, attempts: attempt };
      } catch (error) {
        // 422 = not a fast-forward: the branch moved. Recompute on the new head.
        if (error instanceof GitHubError && (error.status === 422 || error.status === 409) && attempt < maxAttempts) continue;
        throw error;
      }
    }
    throw new GitHubError(409, 'the branch kept moving; nothing was committed');
  }

  return { config, state, snapshot, transact, readHead };
}

export function decodeBase64(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
