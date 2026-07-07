<?php
// ── CORS: only allow our own domains ─────────────────────────────────────────
$allowed_origins = [
    'https://americawhat.com',
    'https://www.americawhat.com',
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowed_origins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Content-Type: application/json');

$votes_file = __DIR__ . '/aw_votes.json';

$valid_reactions = ['wat', 'lol', 'same', 'dead'];

$id       = trim($_POST['id']       ?? ($_GET['id']       ?? ''));
$reaction = trim($_POST['reaction'] ?? ($_GET['reaction'] ?? ''));

// ── Validate ─────────────────────────────────────────────────────────────────
if ($id === '' || !preg_match('/^aw-[a-z0-9\-]{1,40}$/i', $id)) {
    echo json_encode(['status' => 'error', 'message' => 'bad id']);
    exit;
}
if (!in_array($reaction, $valid_reactions, true)) {
    echo json_encode(['status' => 'error', 'message' => 'bad reaction']);
    exit;
}

// ── Load ─────────────────────────────────────────────────────────────────────
$votes = [];
if (file_exists($votes_file)) {
    $votes = json_decode(file_get_contents($votes_file), true) ?: [];
}

if (!isset($votes[$id]) || !is_array($votes[$id])) {
    $votes[$id] = ['wat' => 0, 'lol' => 0, 'same' => 0, 'dead' => 0];
}
$votes[$id][$reaction] = ($votes[$id][$reaction] ?? 0) + 1;

// ── Save ─────────────────────────────────────────────────────────────────────
file_put_contents(
    $votes_file,
    json_encode($votes, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
    LOCK_EX
);

echo json_encode(['status' => 'ok', 'counts' => $votes[$id]]);
