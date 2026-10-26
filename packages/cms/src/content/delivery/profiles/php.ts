import type { ExampleContext } from './program.ts';
import { renderProgram } from './program.ts';
const program = String.raw`
<?php
$base = base64_decode('@@BASE@@', true);
$key = getenv('ONEASTER_API_KEY');
if (!$key) throw new RuntimeException('Set ONEASTER_API_KEY');
$intent = getenv('ONEASTER_INTENT_ID') ?: bin2hex(random_bytes(16));
fwrite(STDERR, 'Keep this intent and input: ' . $intent . PHP_EOL);
$body = json_decode(base64_decode('@@BODY@@', true), true, 512, JSON_THROW_ON_ERROR);
function request(string $path, ?array $body = null, bool $stream = false, ?int $remaining = null): string {
    global $base, $key, $intent;
    $curl = curl_init($base . $path);
    $result = ''; $size = 0; $complete = false; $pending = '';
    $multipart = isset($body['file']) && $body['file'] instanceof CURLFile;
    $headers = ['Authorization: Bearer ' . $key, 'Idempotency-Key: ' . $intent];
    if (!$multipart) $headers[] = 'Content-Type: application/json';
    curl_setopt_array($curl, [CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT_MS => max(1, min(@@REQUEST_MS@@, $remaining ?? @@REQUEST_MS@@)), CURLOPT_HTTPHEADER => $headers]);
    if ($body !== null) { curl_setopt($curl, CURLOPT_POST, true); curl_setopt($curl, CURLOPT_POSTFIELDS, $multipart ? $body : json_encode($body, JSON_THROW_ON_ERROR)); }
    curl_setopt($curl, CURLOPT_WRITEFUNCTION, function ($handle, string $chunk) use (&$result, &$size, &$complete, &$pending, $stream): int {
        $size += strlen($chunk);
        if ($size > @@MAX_BYTES@@) return 0;
        if (!$stream) { $result .= $chunk; return strlen($chunk); }
        $pending .= $chunk;
        $pending = str_replace("\r\n", "\n", $pending);
        while (($end = strpos($pending, "\n\n")) !== false) {
            $frame = substr($pending, 0, $end); $pending = substr($pending, $end + 2);
            foreach (explode("\n", $frame) as $line) {
                if (!str_starts_with($line, 'data:')) continue;
                $data = ltrim(substr($line, 5));
                if ($data === '[DONE]') { $complete = true; continue; }
                $event = json_decode($data, true, 512, JSON_THROW_ON_ERROR);
                if (isset($event['error'])) throw new RuntimeException('Stream failed; inspect original intent');
                foreach ($event['choices'] ?? [] as $choice) echo $choice['delta']['content'] ?? '';
                flush();
            }
        }
        return strlen($chunk);
    });
    try {
        if (curl_exec($curl) === false) throw new RuntimeException('Transport failed; keep intent ' . $intent);
        $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
        if ($status < 200 || $status >= 300) throw new RuntimeException('HTTP ' . $status . '; keep intent ' . $intent);
        if ($stream && !$complete) throw new RuntimeException('Incomplete SSE; keep original intent ' . $intent);
        return $result;
    } finally { curl_close($curl); }
}
if ('@@MODE@@' === 'sse') {
    request('/chat/completions', $body, true);
} elseif ('@@MODE@@' === 'json') {
    $result = json_decode(request('/chat/completions', $body), true, 512, JSON_THROW_ON_ERROR);
    echo $result['choices'][0]['message']['content'];
} else {
    if ('@@MODE@@' === 'transcription') {
        $filename = getenv('ONEASTER_AUDIO_FILE');
        if (!$filename || !is_file($filename)) throw new RuntimeException('Set ONEASTER_AUDIO_FILE to a PCM WAV file');
        $size = filesize($filename);
        if ($size === false || $size < 44 || $size > 8388608) throw new RuntimeException('PCM WAV must be 44 bytes to 8 MiB');
        $upload = ['model' => $body['model'], 'file' => new CURLFile($filename, 'audio/wav', 'input.wav')];
        if (!empty($body['language'])) $upload['language'] = $body['language'];
        $accepted = json_decode(request('/audio/transcriptions', $upload), true, 512, JSON_THROW_ON_ERROR);
    } else $accepted = json_decode(request('/tasks', $body), true, 512, JSON_THROW_ON_ERROR);
    $id = $accepted['data']['id'] ?? '';
    if (($accepted['success'] ?? false) !== true || !preg_match('/^[0-9a-fA-F-]{36}$/D', $id)) throw new RuntimeException('Invalid task acknowledgement');
    $path = '/tasks/' . $id; $deadline = microtime(true) + @@DEADLINE_MS@@ / 1000; $complete = false;
    while (microtime(true) < $deadline) {
        $remaining = max(1, (int)(($deadline - microtime(true)) * 1000));
        $result = json_decode(request($path, null, false, $remaining), true, 512, JSON_THROW_ON_ERROR);
        $task = $result['data'];
        if (($result['success'] ?? false) !== true || $task['model'] !== $body['model']) throw new RuntimeException('Invalid task');
        if ($task['state'] === 'success' && $task['billing_state'] === 'settled' && $task['artifact_available']) {
            if ($task['kind'] === 'image') {
                $bytes = request($path . '/content', null, false, $remaining);
                if (file_put_contents('result.png', $bytes) === false) throw new RuntimeException('Cannot save image');
            } elseif ($task['kind'] === 'music') {
                $bytes = request($path . '/content', null, false, $remaining);
                if (file_put_contents('result.mp3', $bytes) === false) throw new RuntimeException('Cannot save audio');
            } elseif ($task['kind'] === 'asr') echo $task['artifact']['text'];
            elseif ($task['kind'] === 'video') echo $task['artifact']['url'];
            else throw new RuntimeException('Unsupported task kind');
            $complete = true; break;
        }
        if (in_array($task['state'], ['failed', 'rejected', 'unknown', 'success'], true)) throw new RuntimeException('Task ended without usable result: ' . $task['state']);
        usleep((int)(min(@@POLL_MS@@, max(0, ($deadline - microtime(true)) * 1000)) * 1000));
    }
    if (!$complete) throw new RuntimeException('Polling deadline; retain task ' . $id);
}
`;
export function phpExample(context: ExampleContext): string {
  return renderProgram(program, context);
}
