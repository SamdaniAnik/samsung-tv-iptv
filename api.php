<?php
// Browser-side helper for the IPTV app: relays the IPTV server's channel list (with signed stream URLs),
// because the server sends no CORS headers. The TV app (.wgt) talks to the server directly.

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

const IPTV_BASE_URL = 'http://10.99.99.99';
const CHANNEL_CACHE_TTL = 300; // seconds; stream tokens last ~3 h, so a short cache is safe
const UPSTREAM_TIMEOUT = 5;    // seconds

$action = isset($_GET['action']) ? $_GET['action'] : '';

function upstream_get($url)
{
    $ctx = stream_context_create([
        'http' => [
            'timeout' => UPSTREAM_TIMEOUT,
            'header' => "User-Agent: Mozilla/5.0 (SmartTV; Tizen)\r\n",
        ],
    ]);
    $body = @file_get_contents($url, false, $ctx);
    return $body === false ? null : $body;
}

function cache_file()
{
    return sys_get_temp_dir() . '/samsung-tv-iptv-channels-v2.json';
}

function bundled_channels()
{
    $jsFile = __DIR__ . '/channels.js';
    if (!file_exists($jsFile)) {
        return [];
    }
    if (preg_match('/window\.CHANNELS_DATA\s*=\s*(\[.*?\]);/s', file_get_contents($jsFile), $m)) {
        $data = json_decode($m[1], true);
        return is_array($data) ? $data : [];
    }
    return [];
}

function fetch_upstream_channels()
{
    $body = upstream_get(IPTV_BASE_URL . '/api/channels');
    $list = $body ? json_decode($body, true) : null;
    if (!is_array($list)) {
        return [];
    }
    $channels = [];
    foreach ($list as $c) {
        if (!is_array($c) || !isset($c['id'])) {
            continue;
        }
        $logo = isset($c['logo']) ? (string) $c['logo'] : '';
        if ($logo !== '' && !preg_match('#^https?://#', $logo)) {
            $logo = IPTV_BASE_URL . '/' . ltrim($logo, '/');
        }
        $channels[] = [
            'id' => (string) $c['id'],
            'name' => isset($c['name']) ? $c['name'] : (string) $c['id'],
            'category' => isset($c['category']) ? $c['category'] : 'General',
            'logo' => $logo,
            'url' => isset($c['url']) ? $c['url'] : null,
        ];
    }
    return $channels;
}

function load_channels()
{
    $cache = cache_file();
    if (is_file($cache) && time() - filemtime($cache) < CHANNEL_CACHE_TTL) {
        $cached = json_decode(file_get_contents($cache), true);
        if (is_array($cached) && $cached) {
            return $cached;
        }
    }

    $channels = fetch_upstream_channels();
    if ($channels) {
        @file_put_contents($cache, json_encode($channels), LOCK_EX);
        return $channels;
    }

    // Server unreachable: serve the last good list, then the bundled one.
    if (is_file($cache)) {
        $stale = json_decode(file_get_contents($cache), true);
        if (is_array($stale) && $stale) {
            return $stale;
        }
    }
    return bundled_channels();
}

if ($action === 'channels') {
    $channels = load_channels();
    if (!$channels) {
        http_response_code(502);
        echo json_encode(['error' => 'Unable to reach IPTV server']);
        exit;
    }
    echo json_encode($channels);
    exit;
}

echo json_encode(['status' => 'Samsung TV IPTV API Ready', 'channels_count' => count(load_channels())]);
