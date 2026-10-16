// americawhat-boss: the owner's administration Worker on boss.americawhat.com.
//
// Every request is authenticated (Access JWT verified here, fail closed);
// every POST additionally passes Origin + CSRF checks. Publishing goes through
// one atomic Git Data API commit; GitHub stays the source of truth. Nothing is
// ever published, rejected or deleted without an explicit owner submission.

import { authenticate } from './auth.mjs';
import { checkCsrf, csrfToken } from './csrf.mjs';
import { addManual, deletePublished, editPublished, EditorialError, publishedItems, serialize } from './editorial.mjs';
import { CONTENT_PATHS, createGitHub, githubConfig } from './github.mjs';
import { errorPage, flashFrom, htmlResponse, redirect, envBar, PENDING_MARKER, pendingBadge } from './html.mjs';
import { deleteBefore, operatorLog, parseFilters, previewDelete, retentionStatus, summary, top, daily, pagination, numberedStream, newerCount, ipActivity } from './analytics-db.mjs';
import {ipActivityParams} from './analytics-links.mjs';
import {renderIpActivity} from './pages/ip-activity.mjs';
import { exportResponse } from './export.mjs';
import { ANALYTICS_SCRIPT } from './analytics-client.mjs';
import { describeResults, parseReviewForm, renderReview, reviewCompute, reviewSummary } from './pages/review.mjs';
import { fieldsFromForm, overridesFromForm, renderEdit, renderNew, renderPublishedList } from './pages/published.mjs';
import { renderAnalytics, renderImport, renderRetentionPreview } from './pages/analytics.mjs';
import { renderAudit, renderHealth, renderReactions } from './pages/misc.mjs';
import { buildReview } from '../../shared/editorial-signals.mjs';
import { applyPlan, planCorpus } from '../../shared/legacy-import.mjs';
import { applyReactionImport, exportVotesJson, planReactionImport } from '../../shared/reaction-import.mjs';
import { isDay, laMidnight } from '../../shared/time.mjs';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

async function audit(env, entry) {
  try {
    await env.APP_DB.prepare(
      'INSERT INTO boss_audit (at, actor, action, target, outcome, commit_sha, detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(entry.at, entry.actor, entry.action, entry.target || '', entry.outcome, entry.commitSha || null, String(entry.detail || '').slice(0, 2000)).run();
  } catch (error) {
    console.error(`boss: audit write failed (${error instanceof Error ? error.message : String(error)})`);
  }
}

async function readForm(request) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_UPLOAD_BYTES) return null;
  try { return await request.formData(); } catch { return null; }
}

async function uploadedText(form) {
  const file = form.get('file');
  if (!file || typeof file === 'string' || typeof file.text !== 'function') return null;
  if (file.size > MAX_UPLOAD_BYTES) return null;
  return file.text();
}

/** Outside production every HTML page carries a visible environment banner. */
async function environmentBanner(response, env) {
  if (env.ENVIRONMENT === 'production') return response;
  if (!(response.headers.get('Content-Type') || '').startsWith('text/html')) return response;
  const label = env.ENVIRONMENT === 'local' ? 'LOCAL PREVIEW — synthetic data and an in-memory GitHub on this computer; nothing here reaches production GitHub, D1 or the live site' : `${String(env.ENVIRONMENT || 'unknown').toUpperCase()} — not production`;
  const html = (await response.text()).replace('<body>', `<body>${envBar(label)}`);
  return new Response(html, response);
}

const PENDING_COUNT_TTL_MS = 60 * 1000;

export function createBoss({ fetchImpl = (...a) => fetch(...a), clock = () => Date.now() } = {}) {
  const nowSec = () => Math.floor(clock() / 1000);

  // Pending candidates for the navigation badge: every record in pending.json
  // (not story clusters). Cached per isolate for a minute and keyed by the
  // branch head, so a fetch run or a review commit shows up on the next check.
  let pendingCache = { sha: '', count: null, at: 0 };
  function rememberPending(sha, count) { pendingCache = { sha, count, at: clock() }; }
  async function pendingCount(env) {
    if (pendingCache.count != null && clock() - pendingCache.at < PENDING_COUNT_TTL_MS) return pendingCache.count;
    const gh = createGitHub(env, { fetchImpl, now: () => new Date(clock()) });
    const head = await gh.readHead();
    if (head.commitSha !== pendingCache.sha || pendingCache.count == null) {
      const snap = await gh.snapshot([CONTENT_PATHS.pending]);
      const pending = JSON.parse(snap.files[CONTENT_PATHS.pending]);
      rememberPending(snap.head.commitSha, Array.isArray(pending) ? pending.length : null);
    } else {
      rememberPending(head.commitSha, pendingCache.count);
    }
    return pendingCache.count;
  }

  /** Replaces the navigation marker with the pending count; never fails the page. */
  async function withPendingBadge(response, env) {
    if (!(response.headers.get('Content-Type') || '').startsWith('text/html')) return response;
    const html = await response.text();
    let badge = '';
    if (html.includes(PENDING_MARKER)) {
      try { badge = pendingBadge(await pendingCount(env)); } catch (error) {
        console.error(`boss: pending count unavailable (${error instanceof Error ? error.message : String(error)})`);
      }
    }
    return new Response(html.replace(PENDING_MARKER, badge), response);
  }

  async function handle(request, env) {
    const url = new URL(request.url);
    const auth = await authenticate(request, env, { fetchImpl, now: nowSec });
    if (!auth.ok) return errorPage(auth.status, auth.error);
    const identity = auth.identity;
    const flash = flashFrom(url);
    const now = nowSec();
    const csrf = env.BOSS_CSRF_SECRET ? await csrfToken(env, identity, now) : '';
    const gh = createGitHub(env, { fetchImpl, now: () => new Date(clock()) });
    const method = request.method;
    const path = url.pathname.replace(/\/+$/, '') || '/';

    let form = null;
    if (method === 'POST') {
      form = await readForm(request);
      if (!form) return errorPage(400, 'Unreadable or too large request.');
      const check = await checkCsrf(request, env, identity, String(form.get('csrf') || ''), now);
      if (!check.ok) return errorPage(check.status, check.error);
      pendingCache.at = 0; // a write may change pending.json
    } else if (method !== 'GET' && method !== 'HEAD') {
      return errorPage(405, 'Method not allowed.');
    }

    if (path === '/assets/analytics.js' && method === 'GET') return new Response(ANALYTICS_SCRIPT, { headers: {
      'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    } });

    // ---- Weekly review ---------------------------------------------------
    if (path === '/' && method === 'GET') return redirect('/review');
    if (path === '/review' && method === 'GET') {
      try {
        const snap = await gh.snapshot([CONTENT_PATHS.published, CONTENT_PATHS.pending, CONTENT_PATHS.fetchStatus]);
        const published = publishedItems(JSON.parse(snap.files[CONTENT_PATHS.published]));
        const pending = JSON.parse(snap.files[CONTENT_PATHS.pending]);
        if (Array.isArray(pending)) rememberPending(snap.head.commitSha, pending.length);
        const fetchStatus = JSON.parse(snap.files[CONTENT_PATHS.fetchStatus]);
        return htmlResponse(renderReview({ identity, flash, review: buildReview(pending, published), fetchStatus, csrf }));
      } catch (error) {
        return htmlResponse(renderReview({ identity, flash, error: `Could not read content from GitHub: ${error.message}` }), 502);
      }
    }
    if (path === '/review/apply' && method === 'POST') {
      const { approvals, rejections, errors } = parseReviewForm(form);
      if (errors.length) return redirect('/review', { type: 'err', message: errors.join(' · ') });
      if (!approvals.length && !rejections.length) return redirect('/review', { type: 'err', message: 'No story was marked approve or reject.' });
      const s = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
      try {
        const out = await gh.transact({
          message: `content: weekly review (${s(approvals.length, 'approval')}, ${s(rejections.length, 'rejection')})`,
          compute: reviewCompute(approvals, rejections),
        });
        const sum = reviewSummary(out.result);
        const statements = out.result.filter((r) => r.outcome === 'approved' || r.outcome === 'rejected').map((r) => env.APP_DB.prepare(
          `INSERT INTO editorial_decisions (decided_at, actor, decision, reason_code, note, pending_id, seen_id, published_id, title, source_domain, commit_sha)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(now, identity.email, r.outcome, r.reason || null, (rejections.find((x) => x.pendingId === r.pendingId)?.note) || '', r.pendingId, r.seen_id || null, r.id || null, r.title || '', r.source_domain || '', out.commitSha));
        if (statements.length && out.commitSha) await env.APP_DB.batch(statements);
        await audit(env, { at: now, actor: identity.email, action: 'review_apply', outcome: out.commitSha ? 'committed' : 'no_change', commitSha: out.commitSha, detail: JSON.stringify(sum) });
        const invalid = describeResults(out.result);
        const message = `${sum.approved} approved, ${sum.rejected} rejected${sum.alreadyPublished ? `, ${sum.alreadyPublished} already published` : ''}${sum.missing ? `, ${sum.missing} no longer pending` : ''}${out.commitSha ? ` — commit ${out.commitSha.slice(0, 10)}` : ''}${invalid ? ` · not applied: ${invalid}` : ''}`;
        return redirect('/review', { type: invalid ? 'err' : 'ok', message });
      } catch (error) {
        await audit(env, { at: now, actor: identity.email, action: 'review_apply', outcome: 'error', detail: error.message });
        return redirect('/review', { type: 'err', message: `Nothing was committed: ${error.message}` });
      }
    }

    // ---- Published -------------------------------------------------------
    if (path === '/published' && method === 'GET') {
      try {
        const snap = await gh.snapshot([CONTENT_PATHS.published]);
        return htmlResponse(renderPublishedList({ identity, flash, items: publishedItems(JSON.parse(snap.files[CONTENT_PATHS.published])), query: url.searchParams.get('q'), cat: url.searchParams.get('cat') || '', pageNo: url.searchParams.get('p') || 1 }));
      } catch (error) { return errorPage(502, `Could not read content from GitHub: ${error.message}`); }
    }
    if (path === '/published/new' && method === 'GET') return htmlResponse(renderNew({ identity, flash, csrf }));
    if (path === '/published/edit' && method === 'GET') {
      try {
        const snap = await gh.snapshot([CONTENT_PATHS.published]);
        const item = publishedItems(JSON.parse(snap.files[CONTENT_PATHS.published])).find((it) => it.id === url.searchParams.get('id'));
        if (!item) return errorPage(404, 'No such item.');
        return htmlResponse(renderEdit({ identity, flash, item, csrf }));
      } catch (error) { return errorPage(502, `Could not read content from GitHub: ${error.message}`); }
    }
    if ((path === '/published/new' || path === '/published/edit' || path === '/published/delete') && method === 'POST') {
      const id = String(form.get('id') || '');
      if (path === '/published/delete' && String(form.get('confirm') || '') !== id) {
        return redirect(`/published/edit?id=${encodeURIComponent(id)}`, { type: 'err', message: 'Type the item id to confirm the deletion.' });
      }
      const action = path.split('/').pop();
      try {
        const out = await gh.transact({
          message: action === 'new' ? 'content: add a story' : action === 'edit' ? `content: edit ${id}` : `content: remove ${id}`,
          paths: [CONTENT_PATHS.published, CONTENT_PATHS.pending],
          compute: (files) => {
            const state = { published: JSON.parse(files[CONTENT_PATHS.published]), pending: JSON.parse(files[CONTENT_PATHS.pending]) };
            const next = action === 'new' ? addManual(state, fieldsFromForm(form), overridesFromForm(form))
              : action === 'edit' ? editPublished(state, id, fieldsFromForm(form), overridesFromForm(form))
                : deletePublished(state, id);
            return { files: { [CONTENT_PATHS.published]: serialize(next.published) }, result: next.results };
          },
        });
        const target = out.result[0]?.id || id;
        await audit(env, { at: now, actor: identity.email, action: `published_${action}`, target, outcome: out.commitSha ? 'committed' : 'no_change', commitSha: out.commitSha });
        return redirect(action === 'delete' ? '/published' : `/published/edit?id=${encodeURIComponent(target)}`, { type: 'ok', message: `${action === 'new' ? 'Added' : action === 'edit' ? 'Saved' : 'Removed'} ${target}${out.commitSha ? ` — commit ${out.commitSha.slice(0, 10)}` : ' (no change)'}` });
      } catch (error) {
        const message = error instanceof EditorialError ? `Not saved: ${error.message}` : `Nothing was committed: ${error.message}`;
        return redirect(action === 'new' ? '/published/new' : `/published/edit?id=${encodeURIComponent(id)}`, { type: 'err', message });
      }
    }

    // ---- Analytics -------------------------------------------------------
    const adb = env.ANALYTICS_DB;
    if (path === '/analytics/ip' && method === 'GET') {
      const params=ipActivityParams(url.searchParams);
      if (!params) return errorPage(400,'Choose a valid IPv4 or IPv6 address and valid pagination parameters.');
      const activity=await ipActivity(adb,params);
      if (activity.changed) return errorPage(409,'The retained log changed while loading. Reload to refresh this view.');
      return htmlResponse(renderIpActivity({identity,flash,activity,back:params.back,limit:params.limit}));
    }
    if (path === '/analytics' && method === 'GET') {
      const f = parseFilters(url.searchParams, now);
      // A URL without snapshot is the live view: it always shows the newest records
      // and keeps its clean address. Only paging links pin an upper ALL #.
      const pinned = f.snapshot != null;
      const plan = await pagination(adb, f);
      f.snapshot = plan.snapshot;
      f.p = plan.current;
      const [sum, days, page, country, referrer, agent, streamPage, retention, coverage, corpora, outbox] = await Promise.all([
        summary(adb, f), daily(adb, f), top(adb, f, 'page'), top(adb, f, 'country'), top(adb, f, 'referrer'), top(adb, f, 'agent'), numberedStream(adb, f, plan), retentionStatus(adb, now),
        adb.prepare('SELECT * FROM analytics_coverage ORDER BY id').all().then((r) => r.results),
        adb.prepare('SELECT corpus_id, content_sha256, line_count, summary_json FROM analytics_import_corpora ORDER BY imported_at').all().then((r) => r.results),
        adb.prepare('SELECT state, COUNT(*) AS n FROM dndr_outbox GROUP BY state').all().then((r) => r.results),
      ]);
      const newer = pinned ? await newerCount(adb, f, plan.snapshot) : 0;
      if (streamPage.changed || sum.view.events !== plan.total) return errorPage(409, 'The retained log changed while loading. Reload to refresh this view.');
      return htmlResponse(renderAnalytics({ identity, flash, f, sum, days, tops: { page, country, referrer, agent }, streamPage, retention, coverage, corpora, outbox, pinned, newer }), 200, { analyticsScript: true });
    }
    if (path === '/analytics/export' && method === 'GET') {
      const format = url.searchParams.get('format') === 'ndjson' ? 'ndjson' : 'csv';
      const cutoff = url.searchParams.get('cutoff');
      const stamp = new Date(clock()).toISOString().slice(0, 10);
      // The audit names the filters used, never their values (an IP filter is personal data).
      const filterNames = [...new Set([...url.searchParams.keys()].filter((k) => k !== 'format' && k !== 'cutoff'))].sort().join(',');
      await audit(env, { at: now, actor: identity.email, action: 'analytics_export', outcome: 'started', detail: `${format} ${cutoff ? `before ${cutoff}` : `filters: ${filterNames || 'none'}`}` });
      if (cutoff) {
        if (!isDay(cutoff)) return errorPage(400, 'Bad date.');
        return exportResponse(adb, format, { cutoffAt: laMidnight(cutoff) }, `americawhat-analytics-before-${cutoff}.${format === 'csv' ? 'csv' : 'ndjson'}`);
      }
      return exportResponse(adb, format, { filters: parseFilters(url.searchParams, now) }, `americawhat-analytics-${stamp}.${format === 'csv' ? 'csv' : 'ndjson'}`);
    }
    if (path === '/analytics/retention' && method === 'GET') {
      const preview = await previewDelete(adb, String(url.searchParams.get('before') || ''));
      if (!preview.ok) return redirect('/analytics', { type: 'err', message: 'Choose a valid day (YYYY-MM-DD).' });
      return htmlResponse(renderRetentionPreview({ identity, flash, preview, csrf, opId: `op_${crypto.randomUUID()}` }));
    }
    if (path === '/analytics/retention/delete' && method === 'POST') {
      const cutoffDay = String(form.get('cutoff') || '');
      if (String(form.get('confirm') || '') !== cutoffDay) {
        return redirect(`/analytics/retention?before=${encodeURIComponent(cutoffDay)}`, { type: 'err', message: 'Type the date exactly to confirm. Nothing was deleted.' });
      }
      const result = await deleteBefore(adb, { cutoffDay, expectedCount: Number(form.get('expected')), actor: identity.email, opId: String(form.get('op') || ''), now });
      await audit(env, { at: now, actor: identity.email, action: 'analytics_delete_before', target: cutoffDay, outcome: result.ok ? 'deleted' : result.error, detail: result.ok ? `${result.deleted} records` : '' });
      if (!result.ok) {
        const message = result.error === 'stale_preview' ? 'The records changed since the preview. Nothing was deleted; review the new preview.' : `Nothing was deleted (${result.error}).`;
        return redirect(`/analytics/retention?before=${encodeURIComponent(cutoffDay)}`, { type: 'err', message });
      }
      return redirect('/analytics', { type: 'ok', message: `Deleted ${result.deleted} records before ${cutoffDay}. ${result.remaining} remain.` });
    }
    if (path === '/analytics/import' && method === 'GET') return htmlResponse(renderImport({ identity, flash, csrf }));
    if (path === '/analytics/import' && method === 'POST') {
      const text = await uploadedText(form);
      if (text == null) return redirect('/analytics/import', { type: 'err', message: 'Choose a log file (at most 8 MB).' });
      const plan = await planCorpus(text);
      const confirm = String(form.get('confirm') || '').trim().toLowerCase();
      if (!confirm) return htmlResponse(renderImport({ identity, flash, csrf, plan }));
      if (confirm.length < 12 || !plan.sha256.startsWith(confirm)) return htmlResponse(renderImport({ identity, flash: { type: 'err', message: 'The SHA-256 prefix does not match this file. Nothing was imported.' }, csrf, plan }));
      const report = await applyPlan(adb, plan, { actor: identity.email, now });
      await audit(env, { at: now, actor: identity.email, action: 'legacy_import', target: report.corpusId, outcome: Object.values(report.checks).every(Boolean) ? 'reconciled' : 'check_failed', detail: JSON.stringify({ ledger: report.ledger, checks: report.checks }) });
      return redirect('/analytics', { type: Object.values(report.checks).every(Boolean) ? 'ok' : 'err', message: `Import ${report.corpusId}: ${Object.entries(report.ledger).map(([k, n]) => `${k} ${n}`).join(', ')} · checks ${JSON.stringify(report.checks)}` });
    }

    // ---- Reactions -------------------------------------------------------
    if (path === '/reactions/export.json' && method === 'GET') {
      await audit(env, { at: now, actor: identity.email, action: 'reactions_export', outcome: 'ok' });
      return new Response(`${JSON.stringify(await exportVotesJson(env.APP_DB), null, 4)}\n`, {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="aw_votes.json"', 'Cache-Control': 'no-store' },
      });
    }
    if (path === '/reactions' || path === '/reactions/import') {
      let plan = null;
      let pageFlash = flash;
      if (path === '/reactions/import' && method === 'POST') {
        const text = await uploadedText(form);
        if (text == null) return redirect('/reactions', { type: 'err', message: 'Choose aw_votes.json.' });
        plan = await planReactionImport(env.APP_DB, text);
        const confirm = String(form.get('confirm') || '').trim().toLowerCase();
        if (confirm && plan.ok) {
          if (confirm.length < 12 || !plan.sha256.startsWith(confirm)) pageFlash = { type: 'err', message: 'The SHA-256 prefix does not match. Nothing was imported.' };
          else {
            const done = await applyReactionImport(env.APP_DB, plan, { actor: identity.email, now });
            await audit(env, { at: now, actor: identity.email, action: 'reactions_import', target: done.importId, outcome: done.kind, detail: `+${done.votesAdded}` });
            return redirect('/reactions', { type: 'ok', message: `${done.kind} import applied: +${done.votesAdded} votes.` });
          }
        }
      } else if (method !== 'GET') return errorPage(405, 'Method not allowed.');
      const { results } = await env.APP_DB.prepare(
        `SELECT item_id, SUM(CASE WHEN reaction = 'wat' THEN count ELSE 0 END) AS wat, SUM(CASE WHEN reaction = 'lol' THEN count ELSE 0 END) AS lol,
                SUM(CASE WHEN reaction = 'same' THEN count ELSE 0 END) AS same, SUM(CASE WHEN reaction = 'dead' THEN count ELSE 0 END) AS dead, SUM(count) AS total
           FROM reaction_counts GROUP BY item_id ORDER BY total DESC, item_id`,
      ).all();
      const imports = (await env.APP_DB.prepare('SELECT * FROM reaction_imports ORDER BY imported_at DESC').all()).results;
      let titles = new Map();
      try {
        const snap = await gh.snapshot([CONTENT_PATHS.published]);
        titles = new Map(publishedItems(JSON.parse(snap.files[CONTENT_PATHS.published])).map((it) => [it.id, it.title]));
      } catch { /* titles are optional */ }
      const rows = results.map((r) => ({ item_id: r.item_id, wat: Number(r.wat), lol: Number(r.lol), same: Number(r.same), dead: Number(r.dead), total: Number(r.total) }));
      return htmlResponse(renderReactions({ identity, flash: pageFlash, rows, imports, csrf, plan, titles }));
    }

    // ---- Audit and health ------------------------------------------------
    if (path === '/audit' && method === 'GET') {
      const boss = (await env.APP_DB.prepare('SELECT * FROM boss_audit ORDER BY id DESC LIMIT 100').all()).results;
      const decisions = (await env.APP_DB.prepare('SELECT * FROM editorial_decisions ORDER BY id DESC LIMIT 100').all()).results;
      return htmlResponse(renderAudit({ identity, flash, boss, decisions, operator: await operatorLog(adb) }));
    }
    if (path === '/health' && method === 'GET') {
      const checks = [];
      for (const [name, db] of [['APP_DB', env.APP_DB], ['ANALYTICS_DB', adb]]) {
        try { await db.prepare('SELECT 1').first(); checks.push({ name, ok: true }); } catch (e) { checks.push({ name, ok: false, detail: e.message }); }
      }
      checks.push({ name: 'CSRF secret', ok: Boolean(env.BOSS_CSRF_SECRET) });
      const cfg = githubConfig(env);
      checks.push({ name: 'GitHub configuration', ok: cfg.ok, detail: cfg.ok ? `${cfg.repo} @ ${cfg.branch}, author ${cfg.author.email}` : cfg.errors.join('; ') });
      if (cfg.ok) {
        try {
          const head = await gh.readHead();
          const exp = gh.state.tokenExpiration;
          const days = exp ? Math.floor((Date.parse(exp.replace(' UTC', 'Z').replace(' ', 'T')) - clock()) / 86400000) : null;
          checks.push({ name: 'GitHub access', ok: true, detail: `head ${head.commitSha.slice(0, 10)}` });
          checks.push({ name: 'GitHub token expiry', ok: days == null || days > 14, warn: days != null && days <= 14 && days > 0, detail: exp ? `${exp} (${days} days)` : 'no expiry reported' });
        } catch (e) { checks.push({ name: 'GitHub access', ok: false, detail: e.message }); }
      }
      const pendingForwards = await adb.prepare("SELECT COUNT(*) AS n FROM dndr_outbox WHERE state != 'sent'").first();
      checks.push({ name: 'DNDR copies not yet delivered', ok: Number(pendingForwards.n) === 0, warn: Number(pendingForwards.n) > 0, detail: String(pendingForwards.n) });
      const retention = await retentionStatus(adb, now);
      checks.push({ name: 'Analytics retention', ok: !retention.overdue, warn: retention.overdue, detail: retention.overdue ? `${retention.overdueRecords} raw records older than ${retention.targetDays} days` : 'within target' });
      return htmlResponse(renderHealth({ identity, checks }));
    }

    return errorPage(404, 'Not found.');
  }

  return {
    async fetch(request, env) {
      try {
        const response = await handle(request, env);
        return environmentBanner(await withPendingBadge(response, env), env);
      } catch (error) {
        console.error(`boss: unhandled ${error instanceof Error ? error.message : String(error)}`);
        return errorPage(500, 'Internal error. Nothing was changed unless a success message was shown.');
      }
    },
  };
}

export default createBoss();
