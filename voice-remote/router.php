<?php
// Voice remote relay for the Samsung Smart IPTV TV app.
// Run with PHP's built-in server (see start.sh):  php -S 0.0.0.0:8765 router.php
//
//   GET  /                         phone remote page (index.html)
//   POST /api/command  {text, alternatives[]}   phone → queue a command
//   GET  /api/commands?since=N     TV polls for commands newer than id N (N=-1: just the latest id)
//   POST /api/result   {id, ok, message}        TV → outcome of a command
//   GET  /api/status?id=N          phone: is the TV connected, and what happened to command N

const QUEUE_KEEP_SECONDS = 60;   // commands older than this are dropped (never replayed later)
const TV_ONLINE_SECONDS = 6;     // TV polls every 1.5 s; silent longer than this = offline

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($path === '/' || $path === '/index.html') {
    header('Content-Type: text/html; charset=UTF-8');
    header('Cache-Control: no-store');
    readfile(__DIR__ . '/index.html');
    return true;
}

if (strpos($path, '/api/') !== 0) {
    http_response_code(404);
    echo 'Not found';
    return true;
}

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    return true;
}

// All state lives in one JSON file, read-modify-written under an exclusive lock.
function with_state(callable $fn)
{
    $file = sys_get_temp_dir() . '/samsung-tv-voice-relay.json';
    $fh = fopen($file, 'c+');
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $state = $raw ? json_decode($raw, true) : null;
    if (!is_array($state)) {
        $state = ['last' => 0, 'commands' => [], 'results' => [], 'tvSeen' => 0];
    }
    $now = time();
    $state['commands'] = array_values(array_filter($state['commands'], function ($c) use ($now) {
        return $now - $c['at'] <= QUEUE_KEEP_SECONDS;
    }));
    foreach ($state['results'] as $id => $r) {
        if ($now - $r['at'] > QUEUE_KEEP_SECONDS) {
            unset($state['results'][$id]);
        }
    }
    $out = $fn($state, $now);
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($state));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return $out;
}

function json_body()
{
    $data = json_decode(file_get_contents('php://input'), true);
    return is_array($data) ? $data : [];
}

function clean_text($value, $max = 120)
{
    $text = trim(preg_replace('/\s+/', ' ', (string) $value));
    return function_exists('mb_substr') ? mb_substr($text, 0, $max) : substr($text, 0, $max);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($path === '/api/command' && $method === 'POST') {
    $body = json_body();
    $text = clean_text(isset($body['text']) ? $body['text'] : '');
    if ($text === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Say or type a command']);
        return true;
    }
    $alts = [];
    foreach (array_slice(isset($body['alternatives']) && is_array($body['alternatives']) ? $body['alternatives'] : [], 0, 4) as $a) {
        $a = clean_text($a);
        if ($a !== '' && $a !== $text) {
            $alts[] = $a;
        }
    }
    echo json_encode(with_state(function (&$s, $now) use ($text, $alts) {
        $id = ++$s['last'];
        $s['commands'][] = ['id' => $id, 'text' => $text, 'alternatives' => $alts, 'at' => $now];
        return ['id' => $id, 'tvOnline' => $now - $s['tvSeen'] <= TV_ONLINE_SECONDS];
    }));
    return true;
}

if ($path === '/api/commands' && $method === 'GET') {
    $since = isset($_GET['since']) ? (int) $_GET['since'] : -1;
    echo json_encode(with_state(function (&$s, $now) use ($since) {
        $s['tvSeen'] = $now;
        $cmds = $since < 0 ? [] : array_values(array_filter($s['commands'], function ($c) use ($since) {
            return $c['id'] > $since;
        }));
        return ['last' => $s['last'], 'commands' => $cmds];
    }));
    return true;
}

if ($path === '/api/result' && $method === 'POST') {
    $body = json_body();
    $id = isset($body['id']) ? (int) $body['id'] : 0;
    echo json_encode(with_state(function (&$s, $now) use ($id, $body) {
        if ($id > 0) {
            $s['results'][(string) $id] = [
                'ok' => !empty($body['ok']),
                'message' => clean_text(isset($body['message']) ? $body['message'] : '', 160),
                'at' => $now,
            ];
        }
        return ['saved' => $id > 0];
    }));
    return true;
}

if ($path === '/api/status' && $method === 'GET') {
    $id = isset($_GET['id']) ? (string) (int) $_GET['id'] : '';
    echo json_encode(with_state(function (&$s, $now) use ($id) {
        return [
            'tvOnline' => $now - $s['tvSeen'] <= TV_ONLINE_SECONDS,
            'result' => $id !== '' && isset($s['results'][$id]) ? $s['results'][$id] : null,
        ];
    }));
    return true;
}

http_response_code(404);
echo json_encode(['error' => 'Unknown endpoint']);
return true;
