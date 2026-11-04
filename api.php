<?php
// Browser-side helper for the IPTV app: scrapes the channel list and stream URLs from the IPTV server.
// The TV app (.wgt) talks to the server directly and does not need this file.

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=UTF-8');

const IPTV_BASE_URL = 'http://172.20.5.50';
const CHANNEL_CACHE_TTL = 600; // seconds
const UPSTREAM_TIMEOUT = 4;    // seconds

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
    return sys_get_temp_dir() . '/samsung-tv-iptv-channels.json';
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

// Channel numbers follow the stream id from channels.js, so a new channel never shifts existing numbers.
function number_map()
{
    $map = [];
    foreach (bundled_channels() as $c) {
        if (isset($c['id'], $c['number'])) {
            $map[(string) $c['id']] = (int) $c['number'];
        }
    }
    return $map;
}

function scrape_channels($html)
{
    $marker = strpos($html, 'id="vidlink"');
    $part = $marker === false ? $html : substr($html, $marker);
    preg_match_all('/<li class="([^"]+)">\s*<a[^>]*stream=(\d+)[^>]*>([\s\S]*?)<\/li>/', $part, $matches, PREG_SET_ORDER);

    $numbers = number_map();
    $next = $numbers ? max($numbers) + 1 : 1;
    $channels = [];
    $seen = [];

    foreach ($matches as $m) {
        $streamId = $m[2];
        if (isset($seen[$streamId])) {
            continue;
        }
        $seen[$streamId] = true;

        preg_match('/src="([^"]+)"/', $m[3], $imgMatch);
        preg_match('/alt="([^"]*)"/', $m[3], $altMatch);
        $imgSrc = isset($imgMatch[1]) ? html_entity_decode($imgMatch[1], ENT_QUOTES) : '';
        $name = isset($altMatch[1]) && trim($altMatch[1]) !== ''
            ? html_entity_decode(trim($altMatch[1]), ENT_QUOTES)
            : "Channel $streamId";

        $categories = array_values(array_filter(preg_split('/\s+/', $m[1]), function ($c) {
            return $c !== '' && !in_array($c, ['All', 'channel', 'nav-item'], true);
        }));

        $channels[] = [
            'number' => isset($numbers[$streamId]) ? $numbers[$streamId] : $next++,
            'id' => $streamId,
            'name' => $name,
            'category' => $categories ? $categories[0] : 'General',
            'logo' => preg_match('#^https?://#', $imgSrc) ? $imgSrc : IPTV_BASE_URL . '/' . ltrim($imgSrc, '/'),
            'playerUrl' => IPTV_BASE_URL . "/player.php?stream=$streamId",
        ];
    }

    usort($channels, function ($a, $b) {
        return $a['number'] - $b['number'];
    });
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

    $html = upstream_get(IPTV_BASE_URL . '/');
    $channels = $html ? scrape_channels($html) : [];
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

if ($action === 'stream') {
    $id = isset($_GET['id']) ? preg_replace('/[^0-9]/', '', $_GET['id']) : '';
    if ($id === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Missing channel id']);
        exit;
    }

    $playerUrl = IPTV_BASE_URL . "/player.php?stream=$id";
    $playerHtml = upstream_get($playerUrl);
    $m3u8 = null;
    if ($playerHtml && preg_match("/primarySource\s*=\s*'([^']+)'/", $playerHtml, $sm)) {
        $m3u8 = $sm[1];
    }

    echo json_encode(['id' => $id, 'm3u8' => $m3u8, 'playerUrl' => $playerUrl]);
    exit;
}

echo json_encode(['status' => 'Samsung TV IPTV API Ready', 'channels_count' => count(load_channels())]);
