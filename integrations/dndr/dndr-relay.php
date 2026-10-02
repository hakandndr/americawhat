<?php
// DNDR Analytics signed relay - reference sender for a PHP host.
//
// For a property served outside Cloudflare (for example shared PHP hosting),
// where neither a Worker route nor a Service Binding can reach it. The
// property's own logger stores the page view first (its own log stays the
// source of truth and its own panel keeps working); then this file signs the
// stored view and POSTs it to the DNDR collector's relay
// (docs/ANALYTICS-V2.md §4.6, docs/ONBOARDING.md "Hostinger-style senders").
//
// Contract (src/analytics/producers.js):
//   POST <collector>/relay/v1/page, JSON body, headers
//     X-DNDR-Key-Id     the key id the DNDR registry holds for this producer
//     X-DNDR-Timestamp  Unix seconds; the collector accepts +/- 60 s
//     X-DNDR-Signature  hex HMAC-SHA256 over the signing input:
//                       DNDR-RELAY-V1 \n POST \n /relay/v1/page \n <timestamp> \n <key id> \n <hex SHA-256 of the body>
//   The secret never leaves the server: it lives in a configuration file
//   OUTSIDE the web root and is never echoed, logged or sent anywhere.
//   The hostname is fixed in that configuration, never taken from the request.
//
// Usage from a logger, after its own write succeeded:
//   require_once __DIR__ . '/dndr-relay.php';
//   $dndr = dndr_relay_config('/home/<account>/dndr-relay.config.php');   // outside public_html
//   if ($dndr) {
//       if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();  // answer the visitor first
//       dndr_relay_send($dndr, ['producerEventId' => dndr_panel_log_event_id($line), 'path' => ..., ...]);
//   }
//
// Self-test (prints the signature of the published test vector):
//   php dndr-relay.php --self-test

declare(strict_types=1);

// Requested directly over the web, this file does nothing.
if (PHP_SAPI !== 'cli' && isset($_SERVER['SCRIPT_FILENAME']) && realpath((string) $_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}

const DNDR_RELAY_VERSION = 'DNDR-RELAY-V1';
const DNDR_RELAY_PATH = '/relay/v1/page';
const DNDR_RELAY_STATUSES = ['accepted', 'duplicate', 'rejected', 'error'];

/** The exact bytes that are signed. */
function dndr_relay_signing_input(string $method, string $path, int $timestamp, string $keyId, string $body): string
{
    return implode("\n", [DNDR_RELAY_VERSION, strtoupper($method), $path, (string) $timestamp, $keyId, hash('sha256', $body)]);
}

/** Lower-case hex HMAC-SHA256 of the signing input. */
function dndr_relay_signature(string $secret, string $method, string $path, int $timestamp, string $keyId, string $body): string
{
    return hash_hmac('sha256', dndr_relay_signing_input($method, $path, $timestamp, $keyId, $body), $secret);
}

/**
 * The producer event id of one panel-log line: DNDR's history importer gives
 * the same line the same id (`<sha256 of the trimmed line, 32 hex>#<ordinal>`,
 * written here with '.'), so a line delivered live and imported later is one
 * event. Unique only if the line itself is unique: write a random event id
 * into every line.
 */
function dndr_panel_log_event_id(string $line): string
{
    return 'panel_log:' . substr(hash('sha256', trim($line)), 0, 32) . '.0';
}

/**
 * Loads the private configuration: a PHP file that returns
 *   ['url' => 'https://<collector>/relay/v1/page', 'key_id' => '...', 'secret' => '...',
 *    'hostname' => '<the site hostname in the DNDR registry>', 'timeout' => 2.0]
 * Returns null (relay off) when the file is missing or incomplete.
 */
function dndr_relay_config(string $file): ?array
{
    if (!is_readable($file)) return null;
    $config = include $file;
    if (!is_array($config)) return null;
    foreach (['url', 'key_id', 'secret', 'hostname'] as $field) {
        if (!isset($config[$field]) || !is_string($config[$field]) || $config[$field] === '') return null;
    }
    if (strlen($config['secret']) < 32 || parse_url($config['url'], PHP_URL_PATH) !== DNDR_RELAY_PATH) return null;
    return $config;
}

/**
 * Sends one stored page view. Never throws, never prints; returns one of
 * DNDR_RELAY_STATUSES. Only the listed traffic fields are sent.
 */
function dndr_relay_send(array $config, array $event): string
{
    try {
        $field = static fn(string $name): string => isset($event[$name]) && is_scalar($event[$name]) ? (string) $event[$name] : '';
        $body = json_encode([
            'producerEventId' => $field('producerEventId'),
            'hostname' => $config['hostname'],
            'path' => $field('path'),
            'referrer' => $field('referrer'),
            'ip' => $field('ip'),
            'userAgent' => $field('userAgent'),
            'country' => $field('country'),
            'region' => $field('region'),
            'regionCode' => $field('regionCode'),
            'city' => $field('city'),
            'asn' => null,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($body === false) return 'error';
        $timestamp = time();
        $signature = dndr_relay_signature($config['secret'], 'POST', DNDR_RELAY_PATH, $timestamp, $config['key_id'], $body);
        $context = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n"
                . 'X-DNDR-Key-Id: ' . $config['key_id'] . "\r\n"
                . 'X-DNDR-Timestamp: ' . $timestamp . "\r\n"
                . 'X-DNDR-Signature: ' . $signature . "\r\n",
            'content' => $body,
            'timeout' => (float) ($config['timeout'] ?? 2.0),
            'ignore_errors' => true,
        ]]);
        $response = @file_get_contents($config['url'], false, $context);
        if ($response === false) return 'error';
        $decoded = json_decode($response, true);
        $status = is_array($decoded) && isset($decoded['status']) ? (string) $decoded['status'] : 'error';
        return in_array($status, DNDR_RELAY_STATUSES, true) ? $status : 'error';
    } catch (\Throwable $error) {
        return 'error';
    }
}

if (PHP_SAPI === 'cli' && isset($argv[1]) && $argv[1] === '--self-test' && realpath($argv[0]) === __FILE__) {
    // The published test vector (test/analytics-v2-relay-hostinger.test.js).
    $body = '{"producerEventId":"panel_log:test-vector","hostname":"relayed.example","path":"/"}';
    echo dndr_relay_signature('dndr-relay-test-vector-secret-0123456789', 'POST', DNDR_RELAY_PATH, 1790000000, 'test-vector-1', $body), "\n";
    echo dndr_panel_log_event_id('{"event_id":"0f0e0d0c0b0a09080706050403020100","path":"/"}'), "\n";
}
