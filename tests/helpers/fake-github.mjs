// An in-memory GitHub REST subset (refs, commits, trees, blobs, contents) for
// testing the Boss transaction logic, including a branch that moves between
// the read and the ref update. Not a production code path.
import { createHash } from 'node:crypto';

const sha = (s) => createHash('sha1').update(s).digest('hex');

export class FakeGitHub {
  constructor(files, { branch = 'content-staging' } = {}) {
    this.blobs = new Map();
    this.trees = new Map();
    this.commits = new Map();
    this.branch = branch;
    this.requests = [];
    this.beforeRefUpdate = null; // hook: runs once before the next PATCH ref
    this.failNext = null; // { method, pathIncludes, status }
    const treeSha = this.writeTree(files);
    const commitSha = this.writeCommit({ tree: treeSha, parents: [], message: 'init', author: { name: 'init', email: 'init@example.com' } });
    this.refs = new Map([[branch, commitSha]]);
  }

  writeBlob(content) {
    const s = sha(`blob:${content}`);
    this.blobs.set(s, content);
    return s;
  }

  writeTree(files) {
    const entries = {};
    for (const [path, content] of Object.entries(files)) entries[path] = this.writeBlob(content);
    const s = sha(`tree:${JSON.stringify(entries)}`);
    this.trees.set(s, entries);
    return s;
  }

  writeCommit(c) {
    const s = sha(`commit:${JSON.stringify(c)}:${this.commits.size}`);
    this.commits.set(s, c);
    return s;
  }

  filesAt(commitSha) {
    const entries = this.trees.get(this.commits.get(commitSha).tree);
    return Object.fromEntries(Object.entries(entries).map(([p, b]) => [p, this.blobs.get(b)]));
  }

  head() { return this.refs.get(this.branch); }
  headFiles() { return this.filesAt(this.head()); }

  /** Simulates another writer (the fetch workflow) committing to the branch. */
  externalCommit(mutate, message = 'chore(fetch): status + candidates') {
    const files = { ...this.headFiles() };
    mutate(files);
    const tree = this.writeTree(files);
    const c = this.writeCommit({ tree, parents: [this.head()], message, author: { name: 'aw-bot', email: 'actions@users.noreply.github.com' } });
    this.refs.set(this.branch, c);
  }

  commitCount() {
    let n = 0;
    let cur = this.head();
    while (cur) { n++; cur = this.commits.get(cur).parents[0]; }
    return n;
  }

  fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    const u = new URL(url);
    const path = u.pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '');
    this.requests.push({ method, path, auth: init.headers?.Authorization });
    const body = init.body ? JSON.parse(init.body) : null;
    const reply = (status, data) => new Response(JSON.stringify(data), {
      status, headers: { 'Content-Type': 'application/json', 'github-authentication-token-expiration': '2027-01-01 00:00:00 UTC' },
    });
    if (this.failNext && this.failNext.method === method && path.includes(this.failNext.pathIncludes)) {
      const { status } = this.failNext;
      this.failNext = null;
      return reply(status, { message: 'injected failure' });
    }
    let m;
    if (method === 'GET' && (m = /^\/git\/ref\/heads\/(.+)$/.exec(path))) {
      const s = this.refs.get(decodeURIComponent(m[1]));
      return s ? reply(200, { object: { sha: s } }) : reply(404, { message: 'Not Found' });
    }
    if (method === 'GET' && (m = /^\/git\/commits\/(\w+)$/.exec(path))) {
      const c = this.commits.get(m[1]);
      return c ? reply(200, { sha: m[1], tree: { sha: c.tree } }) : reply(404, { message: 'Not Found' });
    }
    if (method === 'GET' && (m = /^\/contents\/(.+)$/.exec(path))) {
      const files = this.filesAt(u.searchParams.get('ref'));
      const content = files[m[1]];
      if (content === undefined) return reply(404, { message: 'Not Found' });
      return reply(200, { encoding: 'base64', content: Buffer.from(content, 'utf8').toString('base64'), sha: sha(`blob:${content}`) });
    }
    if (method === 'POST' && path === '/git/blobs') return reply(201, { sha: this.writeBlob(body.content) });
    if (method === 'POST' && path === '/git/trees') {
      const base = { ...this.trees.get(body.base_tree) };
      for (const e of body.tree) base[e.path] = e.sha;
      const s = sha(`tree:${JSON.stringify(base)}`);
      this.trees.set(s, base);
      return reply(201, { sha: s });
    }
    if (method === 'POST' && path === '/git/commits') {
      return reply(201, { sha: this.writeCommit({ tree: body.tree, parents: body.parents, message: body.message, author: body.author, committer: body.committer }) });
    }
    if (method === 'PATCH' && (m = /^\/git\/refs\/heads\/(.+)$/.exec(path))) {
      if (this.beforeRefUpdate) { const hook = this.beforeRefUpdate; this.beforeRefUpdate = null; hook(); }
      const current = this.refs.get(m[1]);
      const parent = this.commits.get(body.sha)?.parents[0];
      if (!body.force && parent !== current) return reply(422, { message: 'Update is not a fast forward' });
      this.refs.set(m[1], body.sha);
      return reply(200, { object: { sha: body.sha } });
    }
    return reply(404, { message: `unhandled ${method} ${path}` });
  };
}
