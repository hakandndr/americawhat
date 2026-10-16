# americawhat — documentation index

Read in this order at the start of a session:

1. [HANDOFF.md](HANDOFF.md) — the project in five minutes and where to start.
2. [CURRENT-STATE.md](CURRENT-STATE.md) — the single source for what is live
   now (versions, data, open items). Update it in place; do not append dated
   status paragraphs.
3. [POST-CUTOVER.md](POST-CUTOVER.md) — the remaining migration duties
   (S2 reconciliation, 30-day observation, Hostinger rollback, retirement).

## Current documents

| File | Use it for |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Components, routing, publishing flow, data ownership |
| [DECISIONS.md](DECISIONS.md) | Why things are built the way they are |
| [SECURITY.md](SECURITY.md) | Boss access model, secrets, public surface, repository hygiene |
| [EDITORIAL-GUIDE.md](EDITORIAL-GUIDE.md) | What gets published and how stories are written |
| [ANALYTICS.md](ANALYTICS.md) | Page-view collection, Boss Analytics semantics, legacy import, retention |
| [OPERATIONS.md](OPERATIONS.md) | Day-to-day work: content loop, local development, Boss locally, imports |
| [DEPLOYMENT.md](DEPLOYMENT.md) | GitHub Actions → Cloudflare: gates, approvals, rollback, staging |
| [STAGING-DEPLOYMENT.md](STAGING-DEPLOYMENT.md) | Manual frozen-package staging release (when not using CI) |
| [PRODUCTION-PROVISIONING.md](PRODUCTION-PROVISIONING.md) | Production resources, identifiers, secrets and credential rotation |
| [DNS-READINESS.md](DNS-READINESS.md) | The americawhat.com DNS zone, e-mail records and DNS tooling |
| [OG-IMAGES.md](OG-IMAGES.md) | Open Graph images: frozen archive and the pinned renderer |
| [dns/](dns/) | Hostinger zone exports and the Cloudflare import file (tested inputs) |

## Historical documents — `archive/`

Kept for history and audit; **not instructions**. See [archive/README.md](archive/README.md).
`archive/migration/` (the Hostinger → Cloudflare migration plans and runbooks),
`archive/staging/` (staging release reports), `archive/sprints/` (sprint and
audit reports), `archive/status/` (the long-form status logs these documents
replaced).
