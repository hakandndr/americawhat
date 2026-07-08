<?php
/**
 * americawhat — kürasyon paneli
 * Konum (canlı): americawhat.com/admin/panel.php
 * Ne yapar: pending.json + published.json'ı GitHub API ile okur; onayladıklarını
 * published.json'a commit'ler (bu deploy'u tetikler). Elle içerik ekleme, düzenleme, silme.
 *
 * Gizli ayarlar admin/config.php içinde (repoda YOK, sunucuya elle yüklenir).
 */

session_start();
mb_internal_encoding('UTF-8');

$cfg = __DIR__ . '/config.php';
if (!file_exists($cfg)) {
  http_response_code(500);
  exit('config.php bulunamadi. admin/config.php dosyasini FTP ile sunucuya yukleyin.');
}
require $cfg; // GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, PANEL_PASSWORD

// Kategoriler — categories.js ile aynı tutun.
$CATS = [
  'florida-man'     => 'Florida Man',
  'bureaucracy'     => 'Bureaucracy',
  'only-in-america' => 'Only in America',
  'late-stage'      => 'Late Stage',
  'wait-what'       => 'Wait, What',
  'crime-weird'     => 'Crime & Weird',
];

const PUB_PATH = 'src/data/published.json';
const PEND_PATH = 'src/data/pending.json';

// ---------- CSRF ----------
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
function csrf_field() { return '<input type="hidden" name="csrf" value="' . htmlspecialchars($_SESSION['csrf']) . '">'; }
function check_csrf() {
  if (!hash_equals($_SESSION['csrf'] ?? '', $_POST['csrf'] ?? '')) { http_response_code(400); exit('CSRF hatasi'); }
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

// 2 boşluk girintili JSON (repo stiliyle uyumlu, gereksiz diff olmasın)
function json_2space($data) {
  $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  $json = preg_replace_callback('/^(?: {4})+/m', function ($m) { return str_repeat(' ', strlen($m[0]) / 2); }, $json);
  return $json . "\n";
}

// Dosyayı çek: [decodedData, sha, httpCode]
function gh_get_file($path) {
  [$code, $res] = gh_request('GET', '/contents/' . $path . '?ref=' . GITHUB_BRANCH);
  if ($code !== 200) return [null, null, $code];
  $j = json_decode($res, true);
  $content = base64_decode(str_replace("\n", '', $j['content'] ?? ''));
  return [json_decode($content, true), $j['sha'] ?? null, 200];
}

// Dosyayı yaz (commit): [httpCode, responseBody, curlErr]
function gh_put_file($path, $dataArray, $message, $sha) {
  $body = [
    'message' => $message,
    'content' => base64_encode(json_2space($dataArray)),
    'branch'  => GITHUB_BRANCH,
  ];
  if ($sha) $body['sha'] = $sha;
  return gh_request('PUT', '/contents/' . $path, $body);
}

// published.json -> items dizisi (obje {items:[]} bekleniyor ama esnek)
function pub_items($pub) {
  if (is_array($pub) && isset($pub['items']) && is_array($pub['items'])) return $pub['items'];
  if (is_array($pub)) return $pub;
  return [];
}
// pending.json -> dizi (bizim seed [] ama esnek)
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

// Formdan temiz published item kur (elle ekleme + pending onayı ortak kullanır)
function item_from_post($id) {
  $item = [
    'id'          => $id,
    'title'       => trim($_POST['title'] ?? ''),
    'comment'     => trim($_POST['comment'] ?? ''),
    'category'    => $_POST['category'] ?? 'wait-what',
    'source_url'  => trim($_POST['source_url'] ?? ''),
    'source_name' => trim($_POST['source_name'] ?? ''),
    'date'        => trim($_POST['date'] ?? date('Y-m-d')),
  ];
  $body = trim($_POST['body'] ?? '');
  if ($body !== '') $item['body'] = $body;
  return $item;
}

// ---------- Auth ----------
$action = $_POST['action'] ?? $_GET['action'] ?? '';
if ($action === 'logout') { $_SESSION = []; session_destroy(); header('Location: panel.php'); exit; }
$loginError = '';
if ($action === 'login') {
  if (hash_equals(PANEL_PASSWORD, $_POST['password'] ?? '')) { $_SESSION['auth'] = true; redirect_self(); }
  else { $loginError = 'Yanlis sifre.'; }
}
$authed = !empty($_SESSION['auth']);

// ---------- Actions (yalnızca giriş yapılmışsa) ----------
if ($authed && $_SERVER['REQUEST_METHOD'] === 'POST' && in_array($action, ['approve','reject','add','edit','delete'], true)) {
  check_csrf();

  if ($action === 'add') {
    [$pub, $sha] = gh_get_file(PUB_PATH);
    if ($sha === null) { flash('published.json okunamadi (GitHub). Token/izin kontrol edin.', 'err'); redirect_self(); }
    $items = pub_items($pub);
    $item  = item_from_post(next_id($items));
    if ($item['title'] === '') { flash('Baslik bos olamaz.', 'err'); redirect_self(); }
    array_unshift($items, $item);
    $pub['items'] = $items;
    [$code, $res] = gh_put_file(PUB_PATH, $pub, 'panel: yeni icerik ' . $item['id'], $sha);
    if ($code >= 200 && $code < 300) flash('Eklendi: ' . $item['id'] . ' — deploy tetiklendi.');
    else flash('GitHub commit hatasi (' . $code . '). ' . substr((string)$res, 0, 200), 'err');
    redirect_self();
  }

  if ($action === 'edit') {
    $id = $_POST['id'] ?? '';
    [$pub, $sha] = gh_get_file(PUB_PATH);
    if ($sha === null) { flash('published.json okunamadi.', 'err'); redirect_self(); }
    $items = pub_items($pub);
    $found = false;
    foreach ($items as &$it) {
      if (($it['id'] ?? '') === $id) {
        $new = item_from_post($id);
        // body boşsa alanı tamamen kaldır
        if (!isset($new['body'])) unset($it['body']);
        $it = array_merge($it, $new);
        $found = true;
        break;
      }
    }
    unset($it);
    if (!$found) { flash('Item bulunamadi: ' . h($id), 'err'); redirect_self(); }
    $pub['items'] = $items;
    [$code, $res] = gh_put_file(PUB_PATH, $pub, 'panel: duzenle ' . $id, $sha);
    if ($code >= 200 && $code < 300) flash('Guncellendi: ' . $id . ' — deploy tetiklendi.');
    else flash('GitHub commit hatasi (' . $code . '). ' . substr((string)$res, 0, 200), 'err');
    redirect_self();
  }

  if ($action === 'delete') {
    $id = $_POST['id'] ?? '';
    [$pub, $sha] = gh_get_file(PUB_PATH);
    if ($sha === null) { flash('published.json okunamadi.', 'err'); redirect_self(); }
    $items = array_values(array_filter(pub_items($pub), fn($it) => ($it['id'] ?? '') !== $id));
    $pub['items'] = $items;
    [$code, $res] = gh_put_file(PUB_PATH, $pub, 'panel: sil ' . $id, $sha);
    if ($code >= 200 && $code < 300) flash('Silindi: ' . $id . ' — deploy tetiklendi.');
    else flash('GitHub commit hatasi (' . $code . '). ' . substr((string)$res, 0, 200), 'err');
    redirect_self();
  }

  if ($action === 'approve' || $action === 'reject') {
    $id = $_POST['id'] ?? '';
    // pending'i çek
    [$pend, $psha] = gh_get_file(PEND_PATH);
    if ($psha === null) { flash('pending.json okunamadi.', 'err'); redirect_self(); }
    $plist = pend_items($pend);

    if ($action === 'approve') {
      // published'a ekle
      [$pub, $usha] = gh_get_file(PUB_PATH);
      if ($usha === null) { flash('published.json okunamadi.', 'err'); redirect_self(); }
      $items = pub_items($pub);
      $item  = item_from_post(next_id($items));
      if ($item['title'] === '') { flash('Baslik bos olamaz.', 'err'); redirect_self(); }
      array_unshift($items, $item);
      $pub['items'] = $items;
      [$c1, $r1] = gh_put_file(PUB_PATH, $pub, 'panel: onay ' . $item['id'], $usha);
      if (!($c1 >= 200 && $c1 < 300)) { flash('published commit hatasi (' . $c1 . '). ' . substr((string)$r1, 0, 200), 'err'); redirect_self(); }
    }

    // her iki durumda da pending'den çıkar
    $newPlist = array_values(array_filter($plist, fn($it) => ($it['id'] ?? '') !== $id));
    if (is_array($pend) && isset($pend['items'])) $pend['items'] = $newPlist; else $pend = $newPlist;
    [$c2, $r2] = gh_put_file(PEND_PATH, $pend, 'panel: pending temizle ' . $id, $psha);
    if (!($c2 >= 200 && $c2 < 300)) { flash('pending commit hatasi (' . $c2 . '). ' . substr((string)$r2, 0, 200), 'err'); redirect_self(); }

    flash($action === 'approve' ? ('Onaylandi — deploy tetiklendi.') : ('Reddedildi (pending temizlendi).'));
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
?>
<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>americawhat — panel</title>
<style>
  :root{ --bg:#0a0e1a; --panel:#111726; --panel2:#0d1320; --line:#1e293b; --txt:#e2e8f0; --muted:#94a3b8; --red:#ff5468; --red2:#e23e52; }
  *{ box-sizing:border-box; }
  body{ margin:0; background:var(--bg); color:var(--txt); font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif; }
  a{ color:var(--red); }
  header{ display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid var(--line); position:sticky; top:0; background:var(--bg); z-index:5; }
  header .brand{ font-weight:800; letter-spacing:-.5px; }
  header .brand span{ color:var(--red); }
  .wrap{ max-width:900px; margin:0 auto; padding:20px; }
  h2{ font-size:14px; text-transform:uppercase; letter-spacing:2px; color:var(--muted); margin:28px 0 12px; }
  .card{ background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px; margin-bottom:14px; }
  label{ display:block; font-size:12px; text-transform:uppercase; letter-spacing:1px; color:var(--muted); margin:10px 0 4px; }
  input[type=text], textarea, select{ width:100%; background:var(--panel2); border:1px solid var(--line); border-radius:8px; color:var(--txt); padding:10px 12px; font:inherit; }
  textarea{ resize:vertical; min-height:60px; }
  .row{ display:flex; gap:12px; flex-wrap:wrap; }
  .row > div{ flex:1; min-width:180px; }
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
  .login{ max-width:360px; margin:12vh auto; }
</style>
</head>
<body>

<?php if (!$authed): ?>
  <div class="login card">
    <div class="brand" style="font-weight:800;font-size:20px;margin-bottom:12px;">america<span style="color:var(--red)">what</span> · panel</div>
    <?php if ($loginError): ?><div class="flash err"><?= h($loginError) ?></div><?php endif; ?>
    <form method="post">
      <input type="hidden" name="action" value="login">
      <label>Sifre</label>
      <input type="password" name="password" autofocus>
      <div class="actions"><button class="btn-red" type="submit">Giris</button></div>
    </form>
  </div>
<?php else: ?>

<header>
  <div class="brand">america<span>what</span> · panel</div>
  <div class="meta">
    <a href="https://americawhat.com" target="_blank">site</a> &nbsp;·&nbsp;
    <a href="https://github.com/<?= h(GITHUB_OWNER) ?>/<?= h(GITHUB_REPO) ?>/actions" target="_blank">actions</a> &nbsp;·&nbsp;
    <a href="?action=logout">cikis</a>
  </div>
</header>

<div class="wrap">
  <?php if ($flash): ?><div class="flash <?= h($flash['type']) ?>"><?= h($flash['msg']) ?></div><?php endif; ?>
  <?php if ($loadErr): ?><div class="flash err"><?= h($loadErr) ?></div><?php endif; ?>

  <!-- PENDING KUYRUĞU -->
  <h2>Pending (<?= count($pendItems) ?>)</h2>
  <?php if (!$pendItems): ?>
    <div class="empty">Bekleyen aday yok. (Besleme kaynağı bağlanınca burada belirir.)</div>
  <?php else: foreach ($pendItems as $it): $pid = $it['id'] ?? ''; ?>
    <div class="card">
      <div class="meta">
        <?= h($it['source_name'] ?? '') ?> · skor <?= h($it['score'] ?? '?') ?>
        <?php if (!empty($it['source_url'])): ?> · <a href="<?= h($it['source_url']) ?>" target="_blank">kaynak</a><?php endif; ?>
        <?php if (!empty($it['external_url'])): ?> · <a href="<?= h($it['external_url']) ?>" target="_blank">orijinal</a><?php endif; ?>
      </div>
      <form method="post">
        <?= csrf_field() ?>
        <input type="hidden" name="id" value="<?= h($pid) ?>">
        <label>Baslik</label>
        <input type="text" name="title" value="<?= h($it['title'] ?? '') ?>">
        <label>Yorum (americawhat sesi)</label>
        <textarea name="comment" placeholder="Kısa, kuru, ironik tek-iki cümle..."><?= h($it['comment'] ?? '') ?></textarea>
        <label>Body (opsiyonel, uzun metin)</label>
        <textarea name="body"><?= h($it['body'] ?? '') ?></textarea>
        <div class="row">
          <div><label>Kategori</label><select name="category"><?= cat_options($CATS, $it['category'] ?? 'wait-what') ?></select></div>
          <div><label>Kaynak adı</label><input type="text" name="source_name" value="<?= h($it['source_name'] ?? '') ?>"></div>
        </div>
        <div class="row">
          <div><label>Kaynak URL</label><input type="text" name="source_url" value="<?= h($it['source_url'] ?? '') ?>"></div>
          <div><label>Tarih</label><input type="text" name="date" value="<?= h($it['date'] ?? date('Y-m-d')) ?>"></div>
        </div>
        <div class="actions">
          <button class="btn-red" type="submit" name="action" value="approve">Onayla → yayınla</button>
          <button class="btn-ghost" type="submit" name="action" value="reject" onclick="return confirm('Reddedilsin mi?')">Reddet</button>
        </div>
      </form>
    </div>
  <?php endforeach; endif; ?>

  <!-- ELLE EKLE -->
  <h2>Elle içerik ekle</h2>
  <div class="card">
    <form method="post">
      <?= csrf_field() ?>
      <input type="hidden" name="action" value="add">
      <label>Baslik</label>
      <input type="text" name="title" required>
      <label>Yorum (americawhat sesi)</label>
      <textarea name="comment"></textarea>
      <label>Body (opsiyonel)</label>
      <textarea name="body"></textarea>
      <div class="row">
        <div><label>Kategori</label><select name="category"><?= cat_options($CATS, 'wait-what') ?></select></div>
        <div><label>Kaynak adı</label><input type="text" name="source_name"></div>
      </div>
      <div class="row">
        <div><label>Kaynak URL</label><input type="text" name="source_url"></div>
        <div><label>Tarih</label><input type="text" name="date" value="<?= date('Y-m-d') ?>"></div>
      </div>
      <div class="actions"><button class="btn-red" type="submit">Ekle → yayınla</button></div>
    </form>
  </div>

  <!-- YAYINDAKİLER -->
  <h2>Yayında (<?= count($pubItems) ?>)</h2>
  <?php if (!$pubItems): ?>
    <div class="empty">Henüz içerik yok.</div>
  <?php else: foreach ($pubItems as $it): $id = $it['id'] ?? ''; ?>
    <details class="card pub-row">
      <summary>
        <span><span class="tag"><?= h($CATS[$it['category'] ?? ''] ?? ($it['category'] ?? '?')) ?></span> &nbsp; <span class="t"><?= h($it['title'] ?? '') ?></span></span>
        <span class="meta"><?= h($id) ?> · <?= h($it['date'] ?? '') ?></span>
      </summary>
      <form method="post" style="margin-top:14px;">
        <?= csrf_field() ?>
        <input type="hidden" name="id" value="<?= h($id) ?>">
        <label>Baslik</label>
        <input type="text" name="title" value="<?= h($it['title'] ?? '') ?>">
        <label>Yorum</label>
        <textarea name="comment"><?= h($it['comment'] ?? '') ?></textarea>
        <label>Body (opsiyonel)</label>
        <textarea name="body"><?= h($it['body'] ?? '') ?></textarea>
        <div class="row">
          <div><label>Kategori</label><select name="category"><?= cat_options($CATS, $it['category'] ?? 'wait-what') ?></select></div>
          <div><label>Kaynak adı</label><input type="text" name="source_name" value="<?= h($it['source_name'] ?? '') ?>"></div>
        </div>
        <div class="row">
          <div><label>Kaynak URL</label><input type="text" name="source_url" value="<?= h($it['source_url'] ?? '') ?>"></div>
          <div><label>Tarih</label><input type="text" name="date" value="<?= h($it['date'] ?? '') ?>"></div>
        </div>
        <div class="actions">
          <button class="btn-red" type="submit" name="action" value="edit">Kaydet</button>
          <button class="btn-ghost" type="submit" name="action" value="delete" onclick="return confirm('Silinsin mi? <?= h($id) ?>')">Sil</button>
        </div>
      </form>
    </details>
  <?php endforeach; endif; ?>

</div>
<?php endif; ?>
</body>
</html>
