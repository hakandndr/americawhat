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

$log_file = __DIR__ . '/aw_panel_log.txt';

// ── Real IP ───────────────────────────────────────────────────────────────────
function getRealIP() {
    foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'] as $key) {
        if (!empty($_SERVER[$key])) {
            $ip = trim(explode(',', $_SERVER[$key])[0]);
            if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                return $ip;
            }
        }
    }
    return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

// ── Device / browser detection ────────────────────────────────────────────────
function detectDevice($ua) {
    $device = preg_match('/Mobile|Android|iPhone|iPad/i', $ua) ? 'Mobile' : 'Desktop';
    if      (preg_match('/Edg\/(\d+)/i',     $ua, $m)) $browser = 'Edge '    . $m[1];
    elseif  (preg_match('/OPR\/(\d+)/i',     $ua, $m)) $browser = 'Opera '   . $m[1];
    elseif  (preg_match('/Chrome\/(\d+)/i',  $ua, $m)) $browser = 'Chrome '  . $m[1];
    elseif  (preg_match('/Firefox\/(\d+)/i', $ua, $m)) $browser = 'Firefox ' . $m[1];
    elseif  (preg_match('/Safari\/(\d+)/i',  $ua, $m)) $browser = 'Safari';
    else    $browser = 'Other';
    return $device . ' / ' . $browser;
}

// ── Referrer normalizer ───────────────────────────────────────────────────────
function normalizeReferrer($ref) {
    $ref = trim((string) $ref);
    if ($ref === '') return ['referrer' => 'Direct', 'referrer_raw' => ''];

    $lower = strtolower($ref);
    if (strpos($lower, 'google')    !== false) return ['referrer' => 'Google',    'referrer_raw' => $ref];
    if (strpos($lower, 'bing')      !== false) return ['referrer' => 'Bing',      'referrer_raw' => $ref];
    if (strpos($lower, 'instagram') !== false) return ['referrer' => 'Instagram', 'referrer_raw' => $ref];
    if (strpos($lower, 'facebook')  !== false) return ['referrer' => 'Facebook',  'referrer_raw' => $ref];
    if (strpos($lower, 'twitter')   !== false) return ['referrer' => 'Twitter',   'referrer_raw' => $ref];
    if (strpos($lower, 'linkedin')  !== false) return ['referrer' => 'LinkedIn',  'referrer_raw' => $ref];
    if (strpos($lower, 'reddit')    !== false) return ['referrer' => 'Reddit',    'referrer_raw' => $ref];

    $host = parse_url($ref, PHP_URL_HOST);
    if ($host) return ['referrer' => $host, 'referrer_raw' => $ref];
    return ['referrer' => $ref, 'referrer_raw' => $ref];
}

// ── Bot / crawler detection ───────────────────────────────────────────────────
function detectSource($ua) {
    $ua_lower = strtolower($ua);
    $bots = [
        'googlebot'       => 'Googlebot',
        'bingbot'         => 'Bingbot',
        'slurp'           => 'Yahoo Bot',
        'duckduckbot'     => 'DuckDuckBot',
        'baiduspider'     => 'Baidubot',
        'yandexbot'       => 'Yandexbot',
        'facebookbot'     => 'Facebookbot',
        'twitterbot'      => 'Twitterbot',
        'applebot'        => 'Applebot',
        'semrushbot'      => 'SEMrush',
        'ahrefsbot'       => 'Ahrefs',
        'mj12bot'         => 'Majestic',
        'dotbot'          => 'OpenSite',
        'petalbot'        => 'Petal',
        'palo alto'       => 'Palo Alto Scanner',
        'nessus'          => 'Nessus Scanner',
        'nikto'           => 'Nikto Scanner',
        'masscan'         => 'Masscan',
        'zgrab'           => 'ZGrab',
        'python-requests' => 'Python Script',
        'curl/'           => 'cURL',
        'wget/'           => 'Wget',
        'go-http-client'  => 'Go HTTP',
        'dataforseo'      => 'DataForSEO',
        'archive.org_bot' => 'Wayback',
    ];
    foreach ($bots as $pattern => $label) {
        if (strpos($ua_lower, $pattern) !== false) return $label;
    }
    return 'Unknown';
}

$ip      = getRealIP();
$ua      = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';
$path    = trim((string)($_GET['path'] ?? ($_POST['path'] ?? '-')));
$path    = $path === '' ? '-' : $path;
$refRaw  = $_GET['referrer'] ?? ($_POST['referrer'] ?? ($_SERVER['HTTP_REFERER'] ?? ''));
$refInfo = normalizeReferrer($refRaw);
$source  = detectSource($ua);

// ── Geo lookup ────────────────────────────────────────────────────────────────
$geo     = @json_decode(@file_get_contents("http://ip-api.com/json/{$ip}?fields=status,country,countryCode,city,region"), true);
$country = ($geo && $geo['status'] === 'success') ? $geo['country'] : 'Unknown';
$countryCode = ($geo && $geo['status'] === 'success' && !empty($geo['countryCode'])) ? $geo['countryCode'] : '';
$rawCity = ($geo && $geo['status'] === 'success') ? $geo['city']    : 'Unknown';
$region  = ($geo && $geo['status'] === 'success' && !empty($geo['region'])) ? $geo['region'] : '';
$city    = $region ? $rawCity . ', ' . $region : $rawCity;

// ── PST timestamp ─────────────────────────────────────────────────────────────
date_default_timezone_set('America/Los_Angeles');
$date = date('Y-m-d h:i:s A');

$entry = [
    'ip'           => $ip,
    'date'         => $date,
    'country'      => $country,
    'city'         => $city,
    'source'       => $source,
    'device'       => detectDevice($ua),
    'ua_full'      => $ua,
    'referrer'     => $refInfo['referrer'],
    'referrer_raw' => $refInfo['referrer_raw'],
    'path'         => $path,
    // Additive (DNDR Analytics copy): a random id that makes every line unique,
    // so the line's DNDR event id is stable and a retried delivery is a no-op.
    // The Studio panel reads fields by name and ignores it.
    'event_id'     => bin2hex(random_bytes(16)),
];

// This log stays the source of truth; the Studio panel reads it.
$line = json_encode($entry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
$written = file_put_contents($log_file, $line . "\n", FILE_APPEND | LOCK_EX);

echo json_encode(['status' => 'ok']);

// ── DNDR Analytics copy (optional) ───────────────────────────────────────────
// Off unless both the sender and its PRIVATE configuration exist; the
// configuration (relay URL, key id, secret, registry hostname) lives OUTSIDE
// public_html and is never printed. The visitor's response is finished first,
// and a DNDR failure changes nothing here (integrations/dndr/README.md).
$dndrConfigFile = dirname(__DIR__, 2) . '/dndr-relay.config.php';
if ($written !== false && is_readable(__DIR__ . '/dndr-relay.php') && is_readable($dndrConfigFile)) {
    require_once __DIR__ . '/dndr-relay.php';
    $dndr = dndr_relay_config($dndrConfigFile);
    if ($dndr !== null) {
        if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
        dndr_relay_send($dndr, [
            'producerEventId' => dndr_panel_log_event_id($line),
            'path'            => $path,
            'referrer'        => $refInfo['referrer_raw'],
            'ip'              => $ip,
            'userAgent'       => $ua,
            'country'         => $countryCode,
            'regionCode'      => $region,
            'city'            => $rawCity === 'Unknown' ? '' : $rawCity,
        ]);
    }
}
