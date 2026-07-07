<?php
// ═══════════════════════════════════════════════════════════════════════════
//  americawhat · Content Panel (Faz 1)
//  Edits src/data/published.json. Run locally, then `npm run build` + deploy.
// ═══════════════════════════════════════════════════════════════════════════

// ── CONFIG ───────────────────────────────────────────────────────────────────
// Path to the feed data file, relative to this panel.
$DATA_FILE = __DIR__ . '/../src/data/published.json';

// CHANGE THESE before use. Keep different from your other sites.
$username   = 'aw';
$password   = 'AwPanel2026!Change';
$cookieName = 'aw_panel_auth';
$cookieVal  = hash('sha256', $username . ':' . $password . ':aw-panel-2026');

// Categories — must match keys in src/data/categories.js
$CATEGORIES = [
    'florida-man'     => 'Florida Man',
    'bureaucracy'     => 'Bureaucracy',
    'only-in-america' => 'Only in America',
    'late-stage'      => 'Late Stage',
    'wait-what'       => 'Wait, What',
    'crime-weird'     => 'Crime & Weird',
];

// ── AUTH ─────────────────────────────────────────────────────────────────────
if (isset($_GET['logout'])) {
    setcookie($cookieName, '', time() - 3600, '/');
    header('Location: panel.php');
    exit;
}
if (isset($_POST['login_user'], $_POST['login_pass'])) {
    if (trim($_POST['login_user']) === $username && trim($_POST['login_pass']) === $password) {
        setcookie($cookieName, $cookieVal, time() + 86400, '/');
        header('Location: panel.php');
        exit;
    }
    $loginError = 'Wrong username or password';
}
$isLoggedIn = (($_COOKIE[$cookieName] ?? '') === $cookieVal);

// ── DATA HELPERS ─────────────────────────────────────────────────────────────
function loadItems($file) {
    if (!file_exists($file)) return [];
    $raw = json_decode(file_get_contents($file), true);
    return $raw['items'] ?? [];
}
function saveItems($file, $items) {
    // keep newest first by date, then write
    usort($items, function ($a, $b) {
        return strcmp($b['date'] ?? '', $a['date'] ?? '');
    });
    $json = json_encode(['items' => array_values($items)],
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    return file_put_contents($file, $json, LOCK_EX) !== false;
}
function nextId($items) {
    $max = 0;
    foreach ($items as $it) {
        if (preg_match('/aw-(\d+)/', $it['id'] ?? '', $m)) {
            $max = max($max, (int)$m[1]);
        }
    }
    return 'aw-' . str_pad($max + 1, 4, '0', STR_PAD_LEFT);
}

// ── ACTIONS (only when logged in) ────────────────────────────────────────────
$flash = '';
if ($isLoggedIn && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    $items  = loadItems($DATA_FILE);
    $action = $_POST['action'];

    if ($action === 'delete') {
        $id = $_POST['id'] ?? '';
        $items = array_filter($items, fn($it) => ($it['id'] ?? '') !== $id);
        $flash = saveItems($DATA_FILE, $items) ? "Deleted $id." : "Save failed — check file permissions.";
    }

    if ($action === 'save') {
        $id       = trim($_POST['id'] ?? '');
        $title    = trim($_POST['title'] ?? '');
        $comment  = trim($_POST['comment'] ?? '');
        $body     = trim($_POST['body'] ?? '');
        $category = trim($_POST['category'] ?? '');
        $srcName  = trim($_POST['source_name'] ?? '');
        $srcUrl   = trim($_POST['source_url'] ?? '');
        $date     = trim($_POST['date'] ?? date('Y-m-d'));

        if ($title === '' || $comment === '') {
            $flash = 'Title and comment are required.';
        } else {
            $entry = [
                'id'          => $id !== '' ? $id : nextId($items),
                'title'       => $title,
                'comment'     => $comment,
                'category'    => $category !== '' ? $category : 'wait-what',
                'source_url'  => $srcUrl,
                'source_name' => $srcName,
                'date'        => $date,
            ];
            if ($body !== '') $entry['body'] = $body;

            // replace if exists, else append
            $found = false;
            foreach ($items as &$it) {
                if (($it['id'] ?? '') === $entry['id']) { $it = $entry; $found = true; break; }
            }
            unset($it);
            if (!$found) $items[] = $entry;

            $flash = saveItems($DATA_FILE, $items)
                ? ($found ? "Updated {$entry['id']}." : "Added {$entry['id']}.")
                : "Save failed — check file permissions.";
        }
    }
    // reload after any change
    $items = loadItems($DATA_FILE);
}

$items = $isLoggedIn ? loadItems($DATA_FILE) : [];
usort($items, fn($a, $b) => strcmp($b['date'] ?? '', $a['date'] ?? ''));

// item being edited (from ?edit=id)
$editItem = null;
if ($isLoggedIn && isset($_GET['edit'])) {
    foreach ($items as $it) {
        if (($it['id'] ?? '') === $_GET['edit']) { $editItem = $it; break; }
    }
}
$writable = is_writable($DATA_FILE) || (!file_exists($DATA_FILE) && is_writable(dirname($DATA_FILE)));
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>americawhat · Content Panel</title>
<style>
  :root{
    --night:#0b1120;--night-2:#0f1830;--card:#111c34;--ink:#eef2ff;
    --dim:#8ea0c9;--dim-2:#5a6a8a;--red:#e23b4e;--red-hot:#ff5468;
    --star:#f4f1e6;--line:rgba(142,160,201,.16);--line-strong:rgba(142,160,201,.28);
    --green:#22c55e;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--night);color:var(--ink);font-family:'Courier New',monospace;font-size:13px;min-height:100vh}
  a{color:inherit}

  /* login */
  .login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center}
  .login{width:360px;background:var(--night-2);border:1px solid #ff546833;padding:32px}
  .login h2{font-size:12px;letter-spacing:3px;text-transform:uppercase;
     border-left:3px solid var(--red);padding-left:12px;color:var(--red-hot);margin-bottom:6px}
  .login .sub{font-size:10px;color:var(--dim-2);letter-spacing:1px;margin:0 0 22px 15px}
  .login input{display:block;width:100%;padding:11px 14px;margin-bottom:12px;
     background:var(--night);border:1px solid #1e2a44;color:var(--ink);font-family:inherit;font-size:13px;outline:none}
  .login input:focus{border-color:var(--red)}
  .login button{width:100%;padding:12px;background:var(--red);color:#fff;border:0;
     font-family:inherit;font-weight:700;font-size:12px;letter-spacing:2px;cursor:pointer;text-transform:uppercase}
  .err{color:#ff4b4b;font-size:12px;margin-top:10px}

  /* topbar */
  .topbar{background:var(--night-2);border-bottom:1px solid #1e2a44;padding:0 24px;height:52px;
     display:flex;align-items:center;justify-content:space-between}
  .brand{font-size:12px;letter-spacing:2px;color:var(--red-hot);font-weight:700}
  .brand span{color:var(--dim-2)}
  .btn{display:inline-block;padding:6px 14px;font-size:11px;font-family:inherit;letter-spacing:1px;
     cursor:pointer;text-decoration:none;border:1px solid #1e2a44;background:transparent;color:var(--dim);transition:.15s}
  .btn:hover{border-color:var(--red);color:var(--red-hot)}
  .btn-primary{background:var(--red);border-color:var(--red);color:#fff}
  .btn-primary:hover{background:var(--red-hot);color:#fff}
  .btn-danger{color:var(--red-hot);border-color:#ff546833}
  .btn-danger:hover{background:var(--red);color:#fff}

  .layout{max-width:1100px;margin:0 auto;padding:24px;display:grid;grid-template-columns:1fr 1fr;gap:24px}
  @media(max-width:820px){.layout{grid-template-columns:1fr}}

  .panel-h{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--dim);
     margin-bottom:14px;border-left:3px solid var(--red);padding-left:10px}

  /* form */
  .form-card{background:var(--night-2);border:1px solid #1e2a44;padding:20px}
  label{display:block;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--dim-2);margin:14px 0 5px}
  label:first-of-type{margin-top:0}
  input[type=text],input[type=url],input[type=date],textarea,select{
     width:100%;padding:10px 12px;background:var(--night);border:1px solid #1e2a44;
     color:var(--ink);font-family:inherit;font-size:13px;outline:none;resize:vertical}
  input:focus,textarea:focus,select:focus{border-color:var(--red)}
  textarea{min-height:64px;line-height:1.5}
  .form-actions{margin-top:18px;display:flex;gap:10px}
  .hint{font-size:10px;color:var(--dim-2);margin-top:4px;letter-spacing:.5px}

  /* list */
  .item{background:var(--night-2);border:1px solid #1e2a44;padding:14px 16px;margin-bottom:10px;
     display:flex;flex-direction:column;gap:8px}
  .item.editing{border-color:var(--red)}
  .item-top{display:flex;align-items:center;gap:8px}
  .cat-tag{font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;
     padding:3px 8px;border-radius:4px;background:#ff54681a;color:var(--red-hot);border:1px solid #ff546833}
  .item-date{font-size:11px;color:var(--dim-2);margin-left:auto}
  .item-title{color:var(--ink);font-size:13px;font-weight:700;line-height:1.35}
  .item-comment{color:var(--dim);font-size:12px;line-height:1.5}
  .item-actions{display:flex;gap:8px;margin-top:2px}
  .item-actions a,.item-actions button{font-size:10px;padding:4px 10px}

  .flash{background:#22c55e1a;border:1px solid #22c55e44;color:var(--green);
     padding:10px 16px;margin:16px 24px 0;font-size:12px;letter-spacing:.5px}
  .flash.warn{background:#ff54681a;border-color:#ff546844;color:var(--red-hot)}
  .warnbar{background:#f2a6231a;border:1px solid #f2a62344;color:#f2a623;
     padding:10px 16px;margin:16px 24px 0;font-size:12px;letter-spacing:.5px}
  .count{font-size:11px;color:var(--dim-2);margin-bottom:12px}
  .empty{color:var(--dim-2);font-size:12px;padding:20px;text-align:center}
</style>
</head>
<body>

<?php if (!$isLoggedIn): ?>
  <div class="login-wrap">
    <form class="login" method="post">
      <h2>americawhat Panel</h2>
      <p class="sub">content · published.json</p>
      <input name="login_user" placeholder="Username" autocomplete="off" required>
      <input name="login_pass" type="password" placeholder="Password" autocomplete="off" required>
      <button type="submit">ACCESS</button>
      <?php if (!empty($loginError)) echo '<p class="err">' . htmlspecialchars($loginError) . '</p>'; ?>
    </form>
  </div>
<?php else: ?>

  <div class="topbar">
    <span class="brand">[ <span>AMERICA</span>WHAT · PANEL ]</span>
    <div>
      <a class="btn" href="panel.php">Refresh</a>
      <a class="btn btn-danger" href="panel.php?logout=1">Logout</a>
    </div>
  </div>

  <?php if ($flash): ?>
    <div class="flash <?= strpos($flash, 'failed') !== false || strpos($flash, 'required') !== false ? 'warn' : '' ?>">
      <?= htmlspecialchars($flash) ?>
    </div>
  <?php endif; ?>

  <?php if (!$writable): ?>
    <div class="warnbar">
      Heads up: <?= htmlspecialchars($DATA_FILE) ?> is not writable. Saving will fail until permissions are fixed.
    </div>
  <?php endif; ?>

  <div class="layout">
    <!-- FORM -->
    <div>
      <div class="panel-h"><?= $editItem ? 'Edit item' : 'New item' ?></div>
      <form class="form-card" method="post">
        <input type="hidden" name="action" value="save">
        <input type="hidden" name="id" value="<?= htmlspecialchars($editItem['id'] ?? '') ?>">

        <label>Title *</label>
        <input type="text" name="title" required
               value="<?= htmlspecialchars($editItem['title'] ?? '') ?>"
               placeholder="Florida man arrested after arguing with a bag of frozen peas">

        <label>Comment * <span class="hint">(short line on the card — americawhat voice)</span></label>
        <textarea name="comment" required placeholder="Police report describes the peas as &quot;unresponsive.&quot;"><?= htmlspecialchars($editItem['comment'] ?? '') ?></textarea>

        <label>Body <span class="hint">(optional — longer text on the detail page)</span></label>
        <textarea name="body" placeholder="Extra paragraph shown only on the item's own page…"><?= htmlspecialchars($editItem['body'] ?? '') ?></textarea>

        <label>Category</label>
        <select name="category">
          <?php foreach ($CATEGORIES as $key => $lbl): ?>
            <option value="<?= $key ?>" <?= ($editItem['category'] ?? 'wait-what') === $key ? 'selected' : '' ?>>
              <?= htmlspecialchars($lbl) ?>
            </option>
          <?php endforeach; ?>
        </select>

        <label>Source name</label>
        <input type="text" name="source_name"
               value="<?= htmlspecialchars($editItem['source_name'] ?? '') ?>"
               placeholder="Local Affiliate">

        <label>Source URL <span class="hint">(link to the original — you're an aggregator, not a copier)</span></label>
        <input type="url" name="source_url"
               value="<?= htmlspecialchars($editItem['source_url'] ?? '') ?>"
               placeholder="https://…">

        <label>Date</label>
        <input type="date" name="date"
               value="<?= htmlspecialchars($editItem['date'] ?? date('Y-m-d')) ?>">

        <div class="form-actions">
          <button type="submit" class="btn btn-primary"><?= $editItem ? 'Update' : 'Add to feed' ?></button>
          <?php if ($editItem): ?>
            <a class="btn" href="panel.php">Cancel</a>
          <?php endif; ?>
        </div>
      </form>
    </div>

    <!-- LIST -->
    <div>
      <div class="panel-h">Published feed</div>
      <div class="count"><?= count($items) ?> item<?= count($items) === 1 ? '' : 's' ?> · newest first</div>
      <?php if (empty($items)): ?>
        <div class="item"><div class="empty">No items yet. Add your first one on the left.</div></div>
      <?php else: foreach ($items as $it):
        $catLbl = $CATEGORIES[$it['category'] ?? ''] ?? ($it['category'] ?? '—');
        $isEditing = $editItem && ($editItem['id'] === $it['id']);
      ?>
        <div class="item <?= $isEditing ? 'editing' : '' ?>">
          <div class="item-top">
            <span class="cat-tag"><?= htmlspecialchars($catLbl) ?></span>
            <span class="item-date"><?= htmlspecialchars($it['date'] ?? '') ?> · <?= htmlspecialchars($it['id'] ?? '') ?></span>
          </div>
          <div class="item-title"><?= htmlspecialchars($it['title'] ?? '') ?></div>
          <div class="item-comment"><?= htmlspecialchars($it['comment'] ?? '') ?></div>
          <div class="item-actions">
            <a class="btn" href="panel.php?edit=<?= urlencode($it['id']) ?>">Edit</a>
            <form method="post" style="display:inline" onsubmit="return confirm('Delete this item?')">
              <input type="hidden" name="action" value="delete">
              <input type="hidden" name="id" value="<?= htmlspecialchars($it['id']) ?>">
              <button type="submit" class="btn btn-danger">Delete</button>
            </form>
          </div>
        </div>
      <?php endforeach; endif; ?>
    </div>
  </div>

<?php endif; ?>
</body>
</html>
