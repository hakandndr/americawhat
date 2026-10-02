# americawhat — Operations

The content loop, the deploy chain, and every failure mode that has actually
happened. Read §4 before touching git.

---

## 1. The content loop

```
1. fetch.yml runs (02:00 / 14:00 / 20:00 UTC) and commits candidates to pending.json
2. You curate: cut pending.json down to the keepers, fill comment/city/state/status
3. You commit and push that pending.json
4. Panel at /boss/ now shows only the keepers, fields pre-filled
5. You click Approve → panel commits the item into published.json via GitHub API
   and removes it from pending.json
6. That commit triggers deploy.yml → site rebuilds and goes live in a few minutes
```

Step 3 is the one people forget: **the panel reads `origin/main` through the
GitHub API, not your working tree.** Edits that are not pushed are invisible to
the panel.

## 2. Curating a batch

Work from `origin/main`, not the local working copy, which drifts:

```bash
git fetch origin main
git show origin/main:src/data/pending.json > /tmp/p.json
```

Group by title to collapse syndication (see `EDITORIAL-GUIDE.md` §6), read the
sources for the survivors, then rewrite `src/data/pending.json` containing only
the keepers with `comment`, `city`, `state`, `status: "REAL"`, corrected
`category`, and `source_url` copied from `external_url`.

Everything dropped from the file is effectively declined — the panel will simply
not show it. Items stay out permanently because `seen_ids.json` prevents the
fetcher re-adding them.

## 3. Push sequence (Windows / PowerShell)

Run from the repo root. The order matters.

```powershell
cd D:\IT\AmericaWhat\americawhat
Remove-Item .git\index.lock,.git\HEAD.lock -Force -ErrorAction SilentlyContinue
git add src/data/pending.json
git commit -m "content(pending): curated items + comments, city/state, status"
git pull --no-edit -X ours origin main
git push origin main
```

Why each line:
- **Remove-Item** clears stale lock files (see §4.1).
- **commit before pull.** With uncommitted changes to `pending.json`, git refuses
  the merge: *"Your local changes to the following files would be overwritten by
  merge."*
- **`-X ours`** keeps our curated `pending.json` when the fetch bot has rewritten
  it, while still accepting the bot's other changes (`seen_ids.json`,
  `fetch-status.json`) and the panel's `published.json` updates.
- Confirm the `git commit` line printed a SHA. If it printed an error, stop —
  everything after it is meaningless.

## 4. Failure modes we have actually hit

### 4.1 `fatal: cannot lock ref 'HEAD'` / `Unable to create index.lock: File exists`
Stale lock files from an interrupted git process. There are **two** of them and
removing only `index.lock` is not enough:

```powershell
Remove-Item .git\index.lock,.git\HEAD.lock -Force -ErrorAction SilentlyContinue
```

### 4.2 `out-file : FileStream was asked to open a device that was not a file`
You used CMD redirection in PowerShell. `2>NUL` is Command Prompt syntax; in
PowerShell the null device is `$null`. Don't redirect at all — use
`-ErrorAction SilentlyContinue`.

### 4.3 `fatal: pathspec 'src/data/pending.json' did not match any files`
You are in the wrong repository. This has happened with `D:\IT\oc-ca`, a
different project that has `src/data/events.json` and no `pending.json`. Always
`cd D:\IT\AmericaWhat\americawhat` first.

### 4.4 `! [rejected] main -> main (fetch first / non-fast-forward)`
`origin/main` moved while you were working — either the fetch cron or the panel
committing an approval. Commit first, then `git pull --no-edit -X ours origin main`,
then push.

### 4.5 Cards render "Source: X · unverified"
`source_url` is empty. The fetcher stores the link in `external_url`; copy it.

### 4.6 `ENOSPC: no space left on device` / workspace fails to start
The local development tool's workspace ran out of disk space. Not a repository
problem. Free several GB on `C:` and restart the tool; if the workspace stays
broken, clear the tool's cached workspace from its own settings or data folder
(an in-app reinstall that keeps the cached files often does not help).

## 5. Deploy chain

`deploy.yml` on push to `main`:

```
actions/checkout → setup-node 22 → npm ci
  → python scripts/gen-og.py     (Pillow, one OG image per item)
  → astro build                  (static output to dist/)
  → FTP deploy dist/ → Hostinger
```

FTP credentials are GitHub Secrets. Never in the repo. A content-only commit is
enough to trigger a full rebuild; there is no incremental path.

## 6. Local development

```bash
npm install
npm run dev     # http://localhost:4321
npm run build   # writes dist/
```

## 7. Secrets and safety

- `public/studio/config.php` — GitHub token + panel password. Git-ignored, lives
  only on the server. Template: `config.sample.php`.
- FTP credentials — GitHub Secrets only.
- The panel sits behind a server-side password with a constant-time comparison.
- If you reuse this project, rename `public/studio/` to a path of your own; the
  live panel is served from `/boss/`.
