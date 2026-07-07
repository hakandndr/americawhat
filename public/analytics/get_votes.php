<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store');

$votes_file = __DIR__ . '/aw_votes.json';

$idsRaw = trim($_GET['ids'] ?? '');
if ($idsRaw === '') {
    echo json_encode([]);
    exit;
}

$ids = array_filter(array_map('trim', explode(',', $idsRaw)), function ($id) {
    return preg_match('/^aw-[a-z0-9\-]{1,40}$/i', $id);
});

$votes = [];
if (file_exists($votes_file)) {
    $votes = json_decode(file_get_contents($votes_file), true) ?: [];
}

$out = [];
foreach ($ids as $id) {
    $out[$id] = $votes[$id] ?? ['wat' => 0, 'lol' => 0, 'same' => 0, 'dead' => 0];
}

echo json_encode($out);
