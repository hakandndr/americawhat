<?php
/**
 * americawhat — curation panel
 * Location (live): americawhat.com/admin/panel.php
 * What it does: reads pending.json + published.json via the GitHub API; commits approved items
 * to published.json (which triggers a deploy). Manual add, edit, delete.
 *
 * Secrets live in admin/config.php (NOT in the repo, uploaded to the server manually).
 */

session_start();
mb_internal_encoding('UTF-8');

$cfg = __DIR__ . '/config.php';
if (!file_exists($cfg)) {
  http_response_code(500);
  exit('config.php not found. Upload admin/config.php to the server via FTP.');
}
require $cfg; // GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, PANEL_PASSWORD

// Categories — keep in sync with categories.js.
$CATS = [
  'bureaucracy'     => 'Bureaucracy',
  'florida-man'     => 'Florida Man',
  'hoa-housing'     => 'HOA & Housing',
  'fine-print'      => 'Fine Print',
  'only-in-america' => 'Only in America',
  'food-crime'      => 'Food Crime',
  'crime-weird'     => 'Crime & Weird',
];
$STATUSES = ['REAL', 'SUBMITTED', 'UNVERIFIED'];
$DEFAULT_CAT = 'bureaucracy';
$VOTES_PATH = __DIR__ . '/../analytics/aw_votes.json';

const PUB_PATH = 'src/data/published.json';
const PEND_PATH = 'src/data/pending.json';

// ---------- CSRF ----------
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
function csrf_field() { return '<input type="hidden" name="csrf" value="' . htmlspecialchars($_SESSION['csrf']) . '">'; }
function check_csrf() {
  if (!hash_equals($_SESSION['csrf'] ?? '', $_POST['csrf'] ?? '')) { http_response_code(400); exit('CSRF error'); }
}
function h($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
function flash($msg, $type = 'ok') { $_SESSION['flash'] = ['msg' => $msg, 'type' => $type]; }
function redirect_self() { header('Location: panel.php'); exit; }

// ---------- GitHub API ----------
function gh_request($method, $path, $body = null) {
  $url = 'https://api.github.com/repos/' . GITHUB_OWNER . '/' . GITHUB_REPO . $path;
  $ch = curl_init($url);
  $headers = [
    'Authorization: Bearer ' . GITHUB_TOKEN,
    'Accept: application/vnd.github+json',
    'User-Agent: americawhat-panel',
    'X-GitHub-Api-Version: 2022-11-28',
  ];
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST  => $method,
    CURLOPT_HTTPHEADER     => $headers,
    CURLOPT_TIMEOUT        => 30,
  ]);
  if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
  $res  = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err  = curl_error($ch);
  curl_close($ch);
  return [$code, $res, $err];
}

// 2-space indented JSON (matches repo style, avoids noisy diffs)
function json_2space($data) {
  $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  $json = preg_replace_callback('/^(?: {4})+/m', function ($m) { return str_repeat(' ', strlen($m[0]) / 2); }, $json);
  return $json . "\n";
}

// Fetch file: [decodedData, sha, httpCode]
function gh_get_file($path) {
  [$code, $res] = gh_request('GET', '/contents/' . $path . '?ref=' . GITHUB_BRANCH);
  if ($code !== 200) return [null, null, $code];
  $j = json_decode($res, true);
  $content = base64_decode(str_replace("\n", '', $j['content'] ?? ''));
  return [json_decode($content, true), $j['sha'] ?? null, 200];
}

// Write file (commit): [httpCode, responseBody, curlErr]
function gh_put_file($path, $dataArray, $message, $sha) {
  $body = [
    'message' => $message,
    'content' => base64_encode(json_2space($dataArray)),
    'branch'  => GITHUB_BRANCH,
  ];
  if ($sha) $body['sha'] = $sha;
  return gh_request('PUT', '/contents/' . $path, $body);
}

// published.json -> items array (expects {items:[]} object but flexible)
function pub_items($pub) {
  if (is_array($pub) && isset($pub['items']) && is_array($pub['items'])) return $pub['items'];
  if (is_array($pub)) return $pub;
  return [];
}
// pending.json -> array (our seed is [] but flexible)
function pend_items($pend) {
  if (is_array($pend) && isset($pend['items']) && is_array($pend['items'])) return $pend['items'];
  if (is_array($pend)) return $pend;
  return [];
}
function next_id($items) {
  $max = 0;
  foreach ($items as $it) {
    if (preg_match('/^aw-(\d+)$/', $it['id'] ?? '', $m)) $max = max($max, (int)$m[1]);
  }
  return sprintf('aw-%04d', $max + 1);
}

// Build a clean published item from the form (shared by manual add + pending approval)
function item_from_post($id) {
  $item = [
    'id'          => $id,
    'title'       => trim($_POST['title'] ?? ''),
    'comment'     => trim($_POST['comment'] ?? ''),
    'category'    => $_POST['category'] ?? 'bureaucracy',
    'source_url'  => trim($_POST['source_url'] ?? ''),
    'source_name' => trim($_POST['source_name'] ?? ''),
    'date'        => trim($_POST['date'] ?? date('Y-m-d')),
  ];
  // status: derive from source if not valid
  $status = $_POST['status'] ?? '';
  if (!in_array($status, ['REAL', 'SUBMITTED', 'UNVERIFIED'], true)) {
    $status = $item['source_url'] !== '' ? 'REAL' : 'UNVERIFIED';
  }
  $item['status'] = $status;
  // optional fields (omitted if empty)
  $body = trim($_POST['body'] ?? '');
  if ($body !== '') $item['body'] = $body;
  $why = trim($_POST['whyAmericaWhat'] ?? '');
  if ($why !== '') $item['whyAmericaWhat'] = $why;
  $city = trim($_POST['city'] ?? '');
  if ($city !== '') $item['city'] = $city;
  $state = trim($_POST['state'] ?? '');
  if ($state !== '') $item['state'] = $state;
  return $item;
}

// ---------- Auth ----------
$action = $_POST['action'] ?? $_GET['action'] ?? '';
if ($action === 'logout') { $_SESSION = []; session_destroy(); header('Location: panel.php'); exit; }
$loginError = '';
if ($action === 'login') {
  $userOk = !defined('PANEL_USER') || hash_equals(PANEL_USER, (string)($_POST['username'] ?? ''));
  $passOk = hash_equals(PANEL_PASSWORD, (string)($_POST['password'] ?? ''));
  if ($userOk && $passOk) { $_SESSION['auth'] = true; redirect_self(); }
  else { $loginError = 'Wrong username or password.'; }
}
$authed = !empty($_SESSION['auth']);

// ---------- Actions (yalnızca giriş yapılmışsa) ----------
if ($authed && $_SERVER['REQUEST_METHOD'] === 'POST' && in_array($action, ['approve','reject','add','edit','delete'], true)) {
  check_csrf();

  if ($action === 'add') {
    [$pub, $sha] = gh_get_file(PUB_PATH);
    if ($sha === null) { flash('Could not read published.json (GitHub). Check token/permissions.', 'err'); redirect_self(); }
    $items = pub_items($pub);
    $item  = item_from_post(next_id($items));
    if ($item['title'] === '') { flash('Title cannot be empty.', 'err'); redirect_self(); }
    array_unshift($items, $item);
    $pub['items'] = $items;
    [$code, $res] = gh_put_file(PUB_PATH, $pub, 'panel: new item ' . $item['id'], $sha);
    if ($code >= 200 && $code < 300) flash('Added: ' . $item['id'] . ' — deploy triggered.');
    else flash('GitHub commit error (' . $code . '). ' . substr((string)$res, 0, 200), 'err');
    redirect_self();
  }

  if ($action === 'edit') {
    $id = $_POST['id'] ?? '';
    [$pub, $sha] = gh_get_file(PUB_PATH);
    if ($sha === null) { flash('Could not read published.json.', 'err'); redirect_self(); }
    $items = pub_items($pub);
    $found = false;
    foreach ($items as &$it) {
      if (($it['id'] ?? '') === $id) {
        $new = item_from_post($id);
        // remove empty optional fields entirely
        foreach (['body', 'whyAmericaWhat', 'city', 'state'] as $opt) {
          if (!isset($new[$opt])) unset($it[$opt]);
        }
        $it = array_merge($it, $new);
        $found = true;
        break;
      }
    }
    unset($it);
    if (!$found) { flash('Item not found: ' . h($id), 'err'); redirect_self(); }
    $pub['items'] = $items;
    [$code, $res] = gh_put_file(PUB_PATH, $pub, 'panel: edit ' . $id, $sha);
    if ($code >= 200 && $code < 300) flash('Updated: ' . $id . ' — deploy triggered.');
    else flash('GitHub commit error (' . $code . '). ' . substr((string)$res, 0, 200), 'err');
    redirect_self();
  }

  if ($action === 'delete') {
    $id = $_POST['id'] ?? '';
    [$pub, $sha] = gh_get_file(PUB_PATH);
    if ($sha === null) { flash('Could not read published.json.', 'err'); redirect_self(); }
    $items = array_values(array_filter(pub_items($pub), fn($it) => ($it['id'] ?? '') !== $id));
    $pub['items'] = $items;
    [$code, $res] = gh_put_file(PUB_PATH, $pub, 'panel: delete ' . $id, $sha);
    if ($code >= 200 && $code < 300) flash('Deleted: ' . $id . ' — deploy triggered.');
    else flash('GitHub commit error (' . $code . '). ' . substr((string)$res, 0, 200), 'err');
    redirect_self();
  }

  if ($action === 'approve' || $action === 'reject') {
    $id = $_POST['id'] ?? '';
    // pending'i çek
    [$pend, $psha] = gh_get_file(PEND_PATH);
    if ($psha === null) { flash('Could not read pending.json.', 'err'); redirect_self(); }
    $plist = pend_items($pend);

    if ($action === 'approve') {
      // published'a ekle
      [$pub, $usha] = gh_get_file(PUB_PATH);
      if ($usha === null) { flash('Could not read published.json.', 'err'); redirect_self(); }
      $items = pub_items($pub);
      $item  = item_from_post(next_id($items));
      if ($item['title'] === '') { flash('Title cannot be empty.', 'err'); redirect_self(); }
      array_unshift($items, $item);
      $pub['items'] = $items;
      [$c1, $r1] = gh_put_file(PUB_PATH, $pub, 'panel: approve ' . $item['id'], $usha);
      if (!($c1 >= 200 && $c1 < 300)) { flash('published commit error (' . $c1 . '). ' . substr((string)$r1, 0, 200), 'err'); redirect_self(); }
    }

    // her iki durumda da pending'den çıkar
    $newPlist = array_values(array_filter($plist, fn($it) => ($it['id'] ?? '') !== $id));
    if (is_array($pend) && isset($pend['items'])) $pend['items'] = $newPlist; else $pend = $newPlist;
    [$c2, $r2] = gh_put_file(PEND_PATH, $pend, 'panel: clear pending ' . $id, $psha);
    if (!($c2 >= 200 && $c2 < 300)) { flash('pending commit error (' . $c2 . '). ' . substr((string)$r2, 0, 200), 'err'); redirect_self(); }

    flash($action === 'approve' ? ('Approved — deploy triggered.') : ('Rejected (removed from pending).'));
    redirect_self();
  }
}

// ---------- Görüntüleme verisi ----------
$flash = $_SESSION['flash'] ?? null; unset($_SESSION['flash']);
$loadErr = '';
$pubItems = [];
$pendItems = [];
if ($authed) {
  [$pub, $s1, $code1] = gh_get_file(PUB_PATH);
  if ($code1 === 200) $pubItems = pub_items($pub);
  else $loadErr .= "published.json cekilemedi (HTTP $code1). ";
  [$pend, $s2, $code2] = gh_get_file(PEND_PATH);
  if ($code2 === 200) $pendItems = pend_items($pend);
  else $loadErr .= "pending.json cekilemedi (HTTP $code2). ";
}

function cat_options($cats, $selected) {
  $out = '';
  foreach ($cats as $k => $label) {
    $out .= '<option value="' . h($k) . '"' . ($k === $selected ? ' selected' : '') . '>' . h($label) . '</option>';
  }
  return $out;
}
function status_options($statuses, $selected) {
  $out = '<option value=""' . ($selected === '' ? ' selected' : '') . '>— auto —</option>';
  foreach ($statuses as $st) {
    $out .= '<option value="' . h($st) . '"' . ($st === $selected ? ' selected' : '') . '>' . h($st) . '</option>';
  }
  return $out;
}
?>
<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>americawhat — panel</title>
<style>
  :root{ --bg:#0a0e1a; --panel:#111726; --panel2:#0d1320; --line:#1e293b; --txt:#e2e8f0; --muted:#94a3b8; --red:#ff5468; --red2:#e23e52; --blue:#4a9eff; --green:#22c55e; --warn:#facc15; }
  *{ box-sizing:border-box; margin:0; padding:0; }
  html{ scroll-behavior:smooth; }
  body{ background:var(--bg); color:var(--txt); font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif; }
  a{ color:var(--red); text-decoration:none; }

  /* ── Login ── */
  .login{ max-width:360px; margin:12vh auto; }
  .card{ background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px; margin-bottom:14px; }

  /* ── Admin shell ── */
  .admin{ display:flex; min-height:100vh; }
  .side{ width:212px; flex:none; background:var(--panel2); border-right:1px solid var(--line);
         display:flex; flex-direction:column; position:sticky; top:0; height:100vh; overflow-y:auto; transition:width .16s ease; }
  .admin.nav-collapsed .side{ width:0; border-right:0; overflow:hidden; }
  .side-top{ display:flex; align-items:center; justify-content:space-between; padding:16px 16px 12px; }
  .brand{ font-weight:800; letter-spacing:-.5px; color:var(--txt); font-size:16px; white-space:nowrap; }
  .brand b{ color:var(--red); }
  .collapse-btn{ background:transparent; border:1px solid var(--line); color:var(--muted); border-radius:6px;
                 width:26px; height:26px; cursor:pointer; font-size:14px; line-height:1; }
  .collapse-btn:hover{ color:var(--txt); border-color:var(--red); }
  .side-nav{ display:flex; flex-direction:column; padding:6px 10px; gap:2px; flex:1; }
  .side-group{ font-size:10px; letter-spacing:2px; text-transform:uppercase; color:#3a4a6a; padding:16px 8px 6px; }
  .nav-item{ display:flex; align-items:center; justify-content:space-between; gap:8px;
             padding:9px 12px; border-radius:8px; color:var(--muted); cursor:pointer; font-size:14px; white-space:nowrap; }
  .nav-item:hover{ background:#141e34; color:var(--txt); }
  .nav-item.active{ background:var(--blue); color:#fff; font-weight:600; }
  .badge-n{ font-size:11px; background:#00000033; padding:1px 7px; border-radius:10px; min-width:20px; text-align:center; }
  .nav-item.active .badge-n{ background:#ffffff2e; }
  .badge-n.hot{ background:#ff54681f; color:var(--red); font-weight:800; }
  .nav-item.active .badge-n.hot{ background:#ffffff2e; color:#fff; }
  .side-foot{ display:flex; flex-direction:column; gap:8px; padding:14px 18px 18px; border-top:1px solid var(--line); }
  .side-foot a{ font-size:12.5px; color:var(--muted); letter-spacing:.02em; }
  .side-foot a:hover{ color:var(--red); }

  /* ── Main ── */
  .main{ flex:1; min-width:0; }
  .main-top{ position:sticky; top:0; z-index:5; display:flex; align-items:center; gap:14px;
             padding:14px 22px; background:rgba(10,14,26,.9); backdrop-filter:blur(8px); border-bottom:1px solid var(--line); }
  .menu-btn{ background:transparent; border:1px solid var(--line); color:var(--muted); border-radius:6px;
             width:34px; height:32px; cursor:pointer; font-size:16px; }
  .menu-btn:hover{ color:var(--txt); border-color:var(--red); }
  .main-title{ font-size:13px; letter-spacing:2px; text-transform:uppercase; color:var(--muted); font-weight:700; }
  .main-body{ max-width:100%; padding:22px 26px; }

  .sec{ display:none; }
  .sec.active{ display:block; }
  h2{ font-size:14px; text-transform:uppercase; letter-spacing:2px; color:var(--muted); margin:4px 0 16px; }

  label{ display:block; font-size:12px; text-transform:uppercase; letter-spacing:1px; color:var(--muted); margin:10px 0 4px; }
  input[type=text], input[type=password], textarea, select{ width:100%; background:var(--panel2); border:1px solid var(--line);
      border-radius:8px; color:var(--txt); padding:10px 12px; font:inherit; }
  textarea{ resize:vertical; min-height:60px; }
  .row{ display:flex; gap:12px; flex-wrap:wrap; }
  .row > div{ flex:1; min-width:170px; }
  button{ border:0; border-radius:8px; padding:10px 16px; font:inherit; font-weight:700; cursor:pointer; }
  .btn-red{ background:var(--red); color:#fff; } .btn-red:hover{ background:var(--red2); }
  .btn-ghost{ background:transparent; color:var(--muted); border:1px solid var(--line); }
  .btn-ghost:hover{ color:var(--txt); }
  .actions{ display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }
  .flash{ padding:12px 16px; border-radius:10px; margin-bottom:16px; }
  .flash.ok{ background:#0e2a1a; border:1px solid #14532d; color:#86efac; }
  .flash.err{ background:#2a0e12; border:1px solid #7f1d1d; color:#fca5a5; }
  .tag{ display:inline-block; font-size:11px; font-weight:800; letter-spacing:1px; text-transform:uppercase; padding:3px 8px; border-radius:6px; background:#1e293b; color:var(--muted); }
  .pub-row summary{ cursor:pointer; list-style:none; display:flex; justify-content:space-between; gap:12px; align-items:center; }
  .pub-row summary::-webkit-details-marker{ display:none; }
  .pub-row .t{ font-weight:700; }
  .meta{ color:var(--muted); font-size:12px; }
  .empty{ color:var(--muted); font-style:italic; padding:8px 0; }
  table.votes{ width:100%; border-collapse:collapse; font-size:14px; }
  table.votes th, table.votes td{ text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); }
  table.votes th{ font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--muted); }
  table.votes td:not(:first-child), table.votes th:not(:first-child){ text-align:center; width:64px; }
  table.votes tbody tr:hover{ background:var(--panel2); }

  /* ── Tracker embed ── */
  .trk-stats{ display:flex; gap:1px; background:var(--line); border-radius:10px; overflow:hidden; margin-bottom:14px; flex-wrap:wrap; }
  .trk-stat{ flex:1; min-width:120px; padding:14px 18px; background:var(--panel2); text-align:center; }
  .trk-num{ font-size:22px; font-weight:800; color:var(--red); line-height:1; }
  .trk-num.blue{ color:var(--blue); } .trk-num.green{ color:var(--green); } .trk-num.warn{ color:var(--warn); }
  .trk-lbl{ font-size:10px; color:var(--muted); letter-spacing:1px; margin-top:5px; text-transform:uppercase; }
  .trk-pages{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:12px; }
  .trk-pages b{ font-size:10px; color:var(--muted); letter-spacing:1px; text-transform:uppercase; font-weight:700; }
  .trk-pill{ font-size:11px; background:#141e34; border:1px solid var(--line); color:var(--blue); padding:4px 10px; border-radius:6px; }
  .trk-pill span{ color:var(--muted); margin-left:6px; }
  .trk-filters{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:12px; }
  .trk-filters input, .trk-filters select{ width:auto; min-width:120px; flex:1; max-width:170px; padding:7px 10px; font-size:12px; }
  .trk-wrap{ width:100%; overflow-x:auto; border:1px solid var(--line); border-radius:10px; }
  table.trk{ width:100%; border-collapse:collapse; min-width:0; font-size:12px; font-family:'Courier New',monospace; }
  table.trk th{ background:var(--panel2); color:var(--red); font-size:10px; letter-spacing:1px; text-transform:uppercase;
                padding:8px 10px; border-bottom:2px solid #ff546822; text-align:left; white-space:nowrap; position:sticky; top:0; }
  table.trk td{ padding:7px 10px; border-bottom:1px solid #141e34; white-space:nowrap; }
  table.trk tbody tr:hover{ background:#141e34; }
  .t-ip{ color:#fff; font-weight:700; white-space:nowrap; }
  .t-date{ color:var(--green); } .t-city{ color:#d946ef; font-weight:700; } .t-path{ color:var(--blue); max-width:160px; overflow:hidden; text-overflow:ellipsis; }
  .t-ref{ color:#f59e0b; } .t-dev{ color:var(--muted); max-width:170px; overflow:hidden; text-overflow:ellipsis; }
  .flag{ display:inline-block; padding:2px 8px; font-size:10px; font-weight:700; border-radius:4px; }
  .flag-OK{ color:#3a4a6a; } .flag-BOT{ color:var(--red); border:1px solid #ff546833; }
  .flag-HIGH{ color:var(--warn); border:1px solid #facc1533; } .flag-REPEAT{ color:var(--muted); border:1px solid #33445588; }
  @media (max-width:640px){ .side{ position:fixed; z-index:20; box-shadow:0 0 40px #000a; } .main-body{ padding:16px; } }
</style>
</head>
<body>

<?php if (!$authed): ?>
  <div class="login card">
    <div class="brand" style="font-size:20px;margin-bottom:12px;">america<b>what</b> · panel</div>
    <?php if ($loginError): ?><div class="flash err"><?= h($loginError) ?></div><?php endif; ?>
    <form method="post">
      <input type="hidden" name="action" value="login">
      <label>Username</label>
      <input type="text" name="username" autocomplete="username" autofocus>
      <label>Password</label>
      <input type="password" name="password" autocomplete="current-password">
      <div class="actions"><button class="btn-red" type="submit">Sign in</button></div>
    </form>
  </div>
<?php else: ?>

<?php
  // ── Visitor tracker data: aw_panel_log.txt (same server, behind the panel password) ──
  $LOG_PATH = __DIR__ . '/../analytics/aw_panel_log.txt';
  $trkRows = []; $trkTop = [];
  $trkStats = ['total'=>0,'today'=>0,'uniq'=>0,'human'=>0,'bot'=>0];
  if (is_readable($LOG_PATH)) {
    date_default_timezone_set('America/Los_Angeles');
    $tz = new DateTimeZone('America/Los_Angeles');
    $now = new DateTime('now', $tz);
    $todayKey = $now->format('Y-m-d');
    $recentTs = $now->getTimestamp() - 600;
    $entries = [];
    foreach (file($LOG_PATH, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
      $e = json_decode(trim($line), true);
      if (is_array($e)) $entries[] = $e;
    }
    $ipmap = [];
    foreach ($entries as $i => $e) {
      $dt = DateTime::createFromFormat('Y-m-d h:i:s A', $e['date'] ?? '', $tz);
      $ts = $dt ? $dt->getTimestamp() : 0;
      $dk = $dt ? $dt->format('Y-m-d') : substr($e['date'] ?? '', 0, 10);
      $entries[$i]['ts'] = $ts; $entries[$i]['dk'] = $dk;
      $ip = $e['ip'] ?? '-';
      if (!isset($ipmap[$ip])) $ipmap[$ip] = ['total'=>0,'recent'=>0,'today'=>0];
      $ipmap[$ip]['total']++;
      if ($ts >= $recentTs) $ipmap[$ip]['recent']++;
      if ($dk === $todayKey) $ipmap[$ip]['today']++;
    }
    $pc = [];
    foreach ($entries as $e) { $p = $e['path'] ?? '-'; $pc[$p] = ($pc[$p] ?? 0) + 1; }
    arsort($pc); $trkTop = array_slice($pc, 0, 6, true);
    $daily = []; $built = [];
    foreach ($entries as $i => $e) {
      $dk = $e['dk']; $daily[$dk] = ($daily[$dk] ?? 0) + 1;
      $ip = $e['ip'] ?? '-'; $s = $ipmap[$ip] ?? ['total'=>0,'recent'=>0,'today'=>0];
      $flag = $s['recent']>=5 ? 'BOT-LIKE' : ($s['today']>=10 ? 'HIGH REPEAT' : ($s['total']>=20 ? 'REPEAT' : 'OK'));
      $built[] = [
        'g'=>$i+1,'d'=>$daily[$dk],'ip'=>$e['ip']??'-','date'=>$e['date']??'-','country'=>$e['country']??'-',
        'city'=>$e['city']??'-','source'=>$e['source']??'Unknown','device'=>$e['device']??'-','ua'=>$e['ua_full']??'-',
        'ref'=>$e['referrer']??'Direct','path'=>$e['path']??'-','flag'=>$flag,
      ];
    }
    $trkRows = array_reverse($built);
    $trkStats['total'] = count($trkRows);
    $trkStats['today'] = count(array_filter($trkRows, fn($r)=>substr($r['date'],0,10)===$todayKey));
    $trkStats['uniq']  = count($ipmap);
    $trkStats['bot']   = count(array_filter($trkRows, fn($r)=>$r['flag']==='BOT-LIKE'));
    $trkStats['human'] = count(array_filter($trkRows, fn($r)=>$r['source']==='Unknown'));
  }
?>

<div class="admin" id="admin">
  <aside class="side" id="side">
    <div class="side-top">
      <span class="brand">america<b>what</b></span>
      <button class="collapse-btn" id="collapseBtn" title="Daralt">&#171;</button>
    </div>
    <nav class="side-nav">
      <div class="side-group">Content</div>
      <a class="nav-item active" data-panel="pending">Pending <span class="badge-n<?= count($pendItems) > 0 ? ' hot' : '' ?>"><?= count($pendItems) ?></span></a>
      <a class="nav-item" data-panel="add">Add manually</a>
      <a class="nav-item" data-panel="published">Published <span class="badge-n"><?= count($pubItems) ?></span></a>
      <a class="nav-item" data-panel="votes">Votes</a>
      <div class="side-group">Analytics</div>
      <a class="nav-item" data-panel="tracker">Tracker <span class="badge-n"><?= (int)$trkStats['total'] ?></span></a>
    </nav>
    <div class="side-foot">
      <a href="https://americawhat.com" target="_blank">site &#8599;</a>
      <a href="https://github.com/<?= h(GITHUB_OWNER) ?>/<?= h(GITHUB_REPO) ?>/actions" target="_blank">actions &#8599;</a>
      <a href="?action=logout">Sign out</a>
    </div>
  </aside>

  <main class="main">
    <div class="main-top">
      <button class="menu-btn" id="menuBtn" title="Menü">&#9776;</button>
      <span class="main-title" id="mainTitle">Pending</span>
    </div>
    <div class="main-body">
      <?php if ($flash): ?><div class="flash <?= h($flash['type']) ?>"><?= h($flash['msg']) ?></div><?php endif; ?>
      <?php if ($loadErr): ?><div class="flash err"><?= h($loadErr) ?></div><?php endif; ?>

      <!-- PENDING -->
      <section class="sec active" data-sec="pending">
        <h2>Pending (<?= count($pendItems) ?>)</h2>
        <?php if (!$pendItems): ?>
          <div class="empty">No pending candidates. (They appear here after the fetch workflow runs.)</div>
        <?php else: foreach ($pendItems as $it): $pid = $it['id'] ?? ''; ?>
          <div class="card">
            <div class="meta">
              <?= h($it['source_name'] ?? '') ?> · score <?= h($it['score'] ?? '?') ?>
              <?php if (!empty($it['source_url'])): ?> · <a href="<?= h($it['source_url']) ?>" target="_blank">source</a><?php endif; ?>
              <?php if (!empty($it['external_url'])): ?> · <a href="<?= h($it['external_url']) ?>" target="_blank">original</a><?php endif; ?>
            </div>
            <form method="post">
              <?= csrf_field() ?>
              <input type="hidden" name="id" value="<?= h($pid) ?>">
              <label>Title</label>
              <input type="text" name="title" value="<?= h($it['title'] ?? '') ?>">
              <label>Comment (americawhat voice)</label>
              <textarea name="comment" placeholder="Short, dry, ironic — one or two sentences..."><?= h($it['comment'] ?? '') ?></textarea>
              <label>Body (optional, long text)</label>
              <textarea name="body"><?= h($it['body'] ?? '') ?></textarea>
              <div class="row">
                <div><label>Category</label><select name="category"><?= cat_options($CATS, $it['category'] ?? 'bureaucracy') ?></select></div>
                <div><label>Source name</label><input type="text" name="source_name" value="<?= h($it['source_name'] ?? '') ?>"></div>
              </div>
              <div class="row">
                <div><label>Source URL</label><input type="text" name="source_url" value="<?= h($it['source_url'] ?? '') ?>"></div>
                <div><label>Date</label><input type="text" name="date" value="<?= h($it['date'] ?? date('Y-m-d')) ?>"></div>
              </div>
              <div class="row">
                <div><label>Status</label><select name="status"><?= status_options($STATUSES, $it['status'] ?? '') ?></select></div>
                <div><label>City</label><input type="text" name="city" value="<?= h($it['city'] ?? '') ?>"></div>
                <div><label>State</label><input type="text" name="state" value="<?= h($it['state'] ?? '') ?>"></div>
              </div>
              <label>Why it's americawhat? (optional)</label>
              <textarea name="whyAmericaWhat"><?= h($it['whyAmericaWhat'] ?? '') ?></textarea>
              <div class="actions">
                <button class="btn-red" type="submit" name="action" value="approve">Approve → publish</button>
                <button class="btn-ghost" type="submit" name="action" value="reject" onclick="return confirm('Reject this candidate?')">Reject</button>
              </div>
            </form>
          </div>
        <?php endforeach; endif; ?>
      </section>

      <!-- ELLE EKLE -->
      <section class="sec" data-sec="add">
        <h2>Add content manually</h2>
        <div class="card">
          <form method="post">
            <?= csrf_field() ?>
            <input type="hidden" name="action" value="add">
            <label>Title</label>
            <input type="text" name="title" required>
            <label>Comment (americawhat voice)</label>
            <textarea name="comment"></textarea>
            <label>Body (optional)</label>
            <textarea name="body"></textarea>
            <div class="row">
              <div><label>Category</label><select name="category"><?= cat_options($CATS, 'bureaucracy') ?></select></div>
              <div><label>Source name</label><input type="text" name="source_name"></div>
            </div>
            <div class="row">
              <div><label>Source URL</label><input type="text" name="source_url"></div>
              <div><label>Date</label><input type="text" name="date" value="<?= date('Y-m-d') ?>"></div>
            </div>
            <div class="row">
              <div><label>Status</label><select name="status"><?= status_options($STATUSES, '') ?></select></div>
              <div><label>City</label><input type="text" name="city"></div>
              <div><label>State</label><input type="text" name="state"></div>
            </div>
            <label>Why it's americawhat? (optional)</label>
            <textarea name="whyAmericaWhat"></textarea>
            <div class="actions"><button class="btn-red" type="submit">Add → publish</button></div>
          </form>
        </div>
      </section>

      <!-- YAYINDAKILER -->
      <section class="sec" data-sec="published">
        <h2>Published (<?= count($pubItems) ?>)</h2>
        <?php if (!$pubItems): ?>
          <div class="empty">No content yet.</div>
        <?php else: foreach ($pubItems as $it): $id = $it['id'] ?? ''; ?>
          <details class="card pub-row">
            <summary>
              <span><span class="tag"><?= h($CATS[$it['category'] ?? ''] ?? ($it['category'] ?? '?')) ?></span> &nbsp; <span class="t"><?= h($it['title'] ?? '') ?></span></span>
              <span class="meta"><?= h($id) ?> · <?= h($it['date'] ?? '') ?></span>
            </summary>
            <form method="post" style="margin-top:14px;">
              <?= csrf_field() ?>
              <input type="hidden" name="id" value="<?= h($id) ?>">
              <label>Title</label>
              <input type="text" name="title" value="<?= h($it['title'] ?? '') ?>">
              <label>Comment</label>
              <textarea name="comment"><?= h($it['comment'] ?? '') ?></textarea>
              <label>Body (optional)</label>
              <textarea name="body"><?= h($it['body'] ?? '') ?></textarea>
              <div class="row">
                <div><label>Category</label><select name="category"><?= cat_options($CATS, $it['category'] ?? 'bureaucracy') ?></select></div>
                <div><label>Source name</label><input type="text" name="source_name" value="<?= h($it['source_name'] ?? '') ?>"></div>
              </div>
              <div class="row">
                <div><label>Source URL</label><input type="text" name="source_url" value="<?= h($it['source_url'] ?? '') ?>"></div>
                <div><label>Date</label><input type="text" name="date" value="<?= h($it['date'] ?? '') ?>"></div>
              </div>
              <div class="row">
                <div><label>Status</label><select name="status"><?= status_options($STATUSES, $it['status'] ?? '') ?></select></div>
                <div><label>City</label><input type="text" name="city" value="<?= h($it['city'] ?? '') ?>"></div>
                <div><label>State</label><input type="text" name="state" value="<?= h($it['state'] ?? '') ?>"></div>
              </div>
              <label>Why it's americawhat? (optional)</label>
              <textarea name="whyAmericaWhat"><?= h($it['whyAmericaWhat'] ?? '') ?></textarea>
              <div class="actions">
                <button class="btn-red" type="submit" name="action" value="edit">Save</button>
                <button class="btn-ghost" type="submit" name="action" value="delete" onclick="return confirm('Delete <?= h($id) ?>')">Delete</button>
              </div>
            </form>
          </details>
        <?php endforeach; endif; ?>
      </section>

      <!-- TRACKER (gomulu ziyaretci analitigi) -->
      <section class="sec" data-sec="tracker">
        <h2>Visitor Tracker</h2>
        <?php if (!is_readable($LOG_PATH)): ?>
          <div class="empty">Log file not readable (aw_panel_log.txt). It must be under /analytics/ on the server.</div>
        <?php elseif (!$trkRows): ?>
          <div class="empty">No visits logged yet. Tracker is live — waiting for the first visitor.</div>
        <?php else: ?>
          <div class="trk-stats">
            <div class="trk-stat"><div class="trk-num"><?= (int)$trkStats['total'] ?></div><div class="trk-lbl">All-time visits</div></div>
            <div class="trk-stat"><div class="trk-num blue"><?= (int)$trkStats['today'] ?></div><div class="trk-lbl">Today</div></div>
            <div class="trk-stat"><div class="trk-num green"><?= (int)$trkStats['uniq'] ?></div><div class="trk-lbl">Unique IPs</div></div>
            <div class="trk-stat"><div class="trk-num"><?= (int)$trkStats['human'] ?></div><div class="trk-lbl">Human</div></div>
            <div class="trk-stat"><div class="trk-num warn"><?= (int)$trkStats['bot'] ?></div><div class="trk-lbl">Bot-like</div></div>
          </div>
          <?php if ($trkTop): ?>
          <div class="trk-pages">
            <b>Top pages:</b>
            <?php foreach ($trkTop as $pg => $cnt): ?><span class="trk-pill"><?= h($pg) ?><span><?= (int)$cnt ?></span></span><?php endforeach; ?>
          </div>
          <?php endif; ?>
          <div class="trk-filters">
            <input type="text" id="tf-ip" placeholder="IP…">
            <input type="text" id="tf-country" placeholder="Country…">
            <input type="text" id="tf-city" placeholder="City…">
            <input type="text" id="tf-path" placeholder="Path…">
            <select id="tf-flag">
              <option value="">All Flags</option><option>OK</option><option>BOT-LIKE</option><option>HIGH REPEAT</option><option>REPEAT</option>
            </select>
            <label style="margin:0;display:flex;align-items:center;gap:5px;text-transform:none;letter-spacing:0;cursor:pointer;color:var(--muted)">
              <input type="checkbox" id="tf-human" style="width:auto;accent-color:var(--green)"> Humans only
            </label>
            <span class="meta" id="tf-count"></span>
          </div>
          <div class="trk-wrap">
            <table class="trk" id="trk-table">
              <thead><tr>
                <th>#</th><th>Day</th><th>IP</th><th>Flag</th><th>Source</th><th>Date (PST)</th>
                <th>Country</th><th>City</th><th>Path</th><th>Referrer</th><th>Device</th>
              </tr></thead>
              <tbody id="trk-body">
              <?php foreach ($trkRows as $r):
                $fc = ($r['flag']==='BOT-LIKE')?'flag-BOT':(($r['flag']==='HIGH REPEAT')?'flag-HIGH':(($r['flag']==='REPEAT')?'flag-REPEAT':'flag-OK'));
                $isHuman = ($r['source']==='Unknown') ? 'true' : 'false';
              ?>
                <tr data-ip="<?= strtolower(h($r['ip'])) ?>" data-country="<?= strtolower(h($r['country'])) ?>"
                    data-city="<?= strtolower(h($r['city'])) ?>" data-path="<?= strtolower(h($r['path'])) ?>"
                    data-flag="<?= h($r['flag']) ?>" data-human="<?= $isHuman ?>">
                  <td style="color:#3a4a6a;text-align:center"><?= (int)$r['g'] ?></td>
                  <td style="color:var(--warn);text-align:center;font-weight:700"><?= (int)$r['d'] ?></td>
                  <td class="t-ip" title="<?= h($r['ua']) ?>"><?= h($r['ip']) ?></td>
                  <td><span class="flag <?= $fc ?>"><?= h($r['flag']) ?></span></td>
                  <td title="<?= h($r['ua']) ?>"><?= $r['source']==='Unknown' ? '<span style="color:#22c55e">Human</span>' : h($r['source']) ?></td>
                  <td class="t-date"><?= h($r['date']) ?></td>
                  <td style="color:#889"><?= h($r['country']) ?></td>
                  <td class="t-city"><?= h($r['city']) ?></td>
                  <td class="t-path" title="<?= h($r['path']) ?>"><?= h($r['path']) ?></td>
                  <td class="t-ref"><?= h($r['ref']) ?></td>
                  <td class="t-dev" title="<?= h($r['device']) ?>"><?= h($r['device']) ?></td>
                </tr>
              <?php endforeach; ?>
              </tbody>
            </table>
          </div>
          <div class="meta" style="margin-top:10px"><?= count($trkRows) ?> rows · <?= (int)$trkStats['uniq'] ?> unique IPs · data: aw_panel_log.txt</div>
        <?php endif; ?>
      </section>

      <!-- OYLAR -->
      <section class="sec" data-sec="votes">
        <h2>Votes — per item</h2>
        <?php
          $votes = [];
          if (is_readable($VOTES_PATH)) $votes = json_decode((string)file_get_contents($VOTES_PATH), true) ?: [];
          $voteRows = []; $usedIds = [];
          foreach ($pubItems as $__it) {
            $vid = $__it['id'] ?? ''; $v = $votes[$vid] ?? [];
            $w=(int)($v['wat']??0);$l=(int)($v['lol']??0);$sm=(int)($v['same']??0);$d=(int)($v['dead']??0);
            $voteRows[]=['id'=>$vid,'title'=>$__it['title']??$vid,'wat'=>$w,'lol'=>$l,'same'=>$sm,'dead'=>$d,'total'=>$w+$l+$sm+$d];
            $usedIds[$vid]=true;
          }
          foreach ($votes as $vid=>$v){ if(isset($usedIds[$vid]))continue;
            $w=(int)($v['wat']??0);$l=(int)($v['lol']??0);$sm=(int)($v['same']??0);$d=(int)($v['dead']??0);
            $voteRows[]=['id'=>$vid,'title'=>$vid,'wat'=>$w,'lol'=>$l,'same'=>$sm,'dead'=>$d,'total'=>$w+$l+$sm+$d]; }
          usort($voteRows, fn($a,$b)=>$b['total']<=>$a['total']);
          $voteTotal = array_sum(array_map(fn($r)=>$r['total'], $voteRows));
        ?>
        <?php if (!$voteRows): ?>
          <div class="empty">No content/votes yet.</div>
        <?php else: ?>
          <div class="card">
            <table class="votes">
              <thead><tr><th>Item</th><th>WAT</th><th>LOL</th><th>SAME</th><th>DEAD</th><th>Total</th></tr></thead>
              <tbody>
              <?php foreach ($voteRows as $r): ?>
                <tr>
                  <td><?= h($r['title']) ?><div class="meta"><?= h($r['id']) ?></div></td>
                  <td><?= (int)$r['wat'] ?></td><td><?= (int)$r['lol'] ?></td><td><?= (int)$r['same'] ?></td>
                  <td><?= (int)$r['dead'] ?></td><td><strong><?= (int)$r['total'] ?></strong></td>
                </tr>
              <?php endforeach; ?>
              </tbody>
            </table>
            <div class="meta" style="margin-top:10px">Total votes: <?= (int)$voteTotal ?> &middot; <?= count($voteRows) ?> items</div>
          </div>
        <?php endif; ?>
      </section>

    </div>
  </main>
</div>

<script>
  (function(){
    var admin = document.getElementById('admin');
    var items = Array.from(document.querySelectorAll('.nav-item'));
    var secs  = Array.from(document.querySelectorAll('.sec'));
    var title = document.getElementById('mainTitle');

    function show(name){
      items.forEach(function(a){ a.classList.toggle('active', a.dataset.panel===name); });
      secs.forEach(function(s){ s.classList.toggle('active', s.dataset.sec===name); });
      var active = items.find(function(a){ return a.dataset.panel===name; });
      if (active) title.textContent = active.textContent.trim().replace(/\s+\d+$/,'');
      try{ localStorage.setItem('aw_panel_sec', name); }catch(e){}
      if (window.innerWidth <= 640) admin.classList.add('nav-collapsed');
    }
    items.forEach(function(a){ a.addEventListener('click', function(){ show(a.dataset.panel); }); });

    var saved = 'pending';
    try{ saved = localStorage.getItem('aw_panel_sec') || 'pending'; }catch(e){}
    if (!items.some(function(a){ return a.dataset.panel===saved; })) saved='pending';
    show(saved);

    function toggleNav(){
      admin.classList.toggle('nav-collapsed');
      try{ localStorage.setItem('aw_panel_collapsed', admin.classList.contains('nav-collapsed')?'1':'0'); }catch(e){}
    }
    document.getElementById('collapseBtn').addEventListener('click', toggleNav);
    document.getElementById('menuBtn').addEventListener('click', toggleNav);
    try{ if (localStorage.getItem('aw_panel_collapsed')==='1') admin.classList.add('nav-collapsed'); }catch(e){}

    // Tracker filtreleri
    var body = document.getElementById('trk-body');
    if (body){
      var rows = Array.from(body.querySelectorAll('tr'));
      var f = {ip:'',country:'',city:'',path:'',flag:'',human:false};
      var cnt = document.getElementById('tf-count');
      function apply(){
        var vis=0;
        rows.forEach(function(r){
          var ok = (!f.ip||r.dataset.ip.indexOf(f.ip)>=0) && (!f.country||r.dataset.country.indexOf(f.country)>=0)
                && (!f.city||r.dataset.city.indexOf(f.city)>=0) && (!f.path||r.dataset.path.indexOf(f.path)>=0)
                && (!f.flag||r.dataset.flag===f.flag) && (!f.human||r.dataset.human==='true');
          r.style.display = ok?'':'none'; if(ok)vis++;
        });
        if(cnt) cnt.textContent = vis+' / '+rows.length+' rows';
      }
      function bind(id,key){ var el=document.getElementById(id); if(el) el.addEventListener('input',function(e){ f[key]=e.target.value.toLowerCase().trim(); apply(); }); }
      bind('tf-ip','ip'); bind('tf-country','country'); bind('tf-city','city'); bind('tf-path','path');
      var fl=document.getElementById('tf-flag'); if(fl) fl.addEventListener('change',function(e){ f.flag=e.target.value; apply(); });
      var hu=document.getElementById('tf-human'); if(hu) hu.addEventListener('change',function(e){ f.human=e.target.checked; apply(); });
      apply();
    }
  })();
</script>
<?php endif; ?>
</body>
</html>
