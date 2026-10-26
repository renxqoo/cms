import type { ExampleContext } from './program.ts';
import { renderProgram } from './program.ts';
const program = String.raw`
import base64, json, os, re, sys, time, uuid
import urllib.request
from pathlib import Path
base = base64.b64decode('@@BASE@@').decode('utf-8')
key = os.environ['ONEASTER_API_KEY']
intent = os.environ.get('ONEASTER_INTENT_ID') or str(uuid.uuid4())
print('Keep this intent and input:', intent, file=sys.stderr)
body = json.loads(base64.b64decode('@@BODY@@'))
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, response_headers, new_url):
        return None
opener = urllib.request.build_opener(NoRedirect())
headers = {'Authorization': 'Bearer ' + key, 'Idempotency-Key': intent}
def request(path, data=None, remaining=@@REQUEST_MS@@ / 1000, content_type='application/json'):
    payload = data if isinstance(data, bytes) else None if data is None else json.dumps(data).encode('utf-8')
    req = urllib.request.Request(base + path, data=payload, headers={**headers, 'Content-Type': content_type})
    timeout = max(0.001, min(@@REQUEST_MS@@ / 1000, remaining))
    deadline = time.monotonic() + timeout
    response = opener.open(req, timeout=timeout)
    response.oneaster_deadline = deadline
    return response
def read_bytes(response):
    result = bytearray()
    while True:
        if time.monotonic() >= response.oneaster_deadline:
            raise TimeoutError('Response deadline reached; retain original intent')
        chunk = response.read1(65536)
        if not chunk:
            return bytes(result)
        result.extend(chunk)
        if len(result) > @@MAX_BYTES@@:
            raise RuntimeError('Response exceeds limit')
def read_json(path, data=None, remaining=@@REQUEST_MS@@ / 1000, content_type='application/json'):
    with request(path, data, remaining, content_type) as response:
        return json.loads(read_bytes(response))
def upload():
    filename = os.environ['ONEASTER_AUDIO_FILE']
    with open(filename, 'rb') as source:
        content = source.read(8388609)
    if len(content) < 44 or len(content) > 8388608:
        raise RuntimeError('PCM WAV must be 44 bytes to 8 MiB')
    boundary = 'oneaster-' + uuid.uuid4().hex
    parts = []
    for name in ('model', 'language'):
        if body.get(name):
            parts.append(('--' + boundary + '\r\nContent-Disposition: form-data; name="' + name + '"\r\n\r\n' + body[name] + '\r\n').encode('utf-8'))
    parts.append(('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="input.wav"\r\nContent-Type: audio/wav\r\n\r\n').encode('ascii'))
    parts.extend([content, ('\r\n--' + boundary + '--\r\n').encode('ascii')])
    return read_json('/audio/transcriptions', b''.join(parts), content_type='multipart/form-data; boundary=' + boundary)
if '@@MODE@@' == 'sse':
    complete = False
    size = 0
    with request('/chat/completions', body) as response:
        if response.headers.get_content_type() != 'text/event-stream':
            raise RuntimeError('Expected SSE')
        import codecs
        decoder = codecs.getincrementaldecoder('utf-8')('strict')
        pending = ''
        while not complete:
            if time.monotonic() >= response.oneaster_deadline:
                raise TimeoutError('Stream deadline reached; retain original intent')
            chunk = response.read1(65536)
            if not chunk:
                break
            size += len(chunk)
            if size > @@MAX_BYTES@@:
                raise RuntimeError('Stream exceeds limit')
            pending = (pending + decoder.decode(chunk)).replace('\r\n', '\n')
            while '\n\n' in pending:
                frame, pending = pending.split('\n\n', 1)
                data = '\n'.join(line[5:].lstrip() for line in frame.split('\n') if line.startswith('data:'))
                if data == '[DONE]':
                    complete = True
                    break
                if not data:
                    continue
                event = json.loads(data)
                if event.get('error'):
                    raise RuntimeError('Stream failed; keep original intent ' + intent)
                for choice in event.get('choices', []):
                    print(choice.get('delta', {}).get('content', ''), end='', flush=True)
    if not complete:
        raise RuntimeError('Incomplete stream; keep original intent ' + intent)
elif '@@MODE@@' == 'json':
    result = read_json('/chat/completions', body)
    print(result['choices'][0]['message']['content'])
else:
    accepted = upload() if '@@MODE@@' == 'transcription' else read_json('/tasks', body)
    task_id = accepted.get('data', {}).get('id', '')
    if accepted.get('success') is not True or not re.fullmatch(r'[0-9a-fA-F-]{36}', task_id):
        raise RuntimeError('Invalid task acknowledgement')
    path = '/tasks/' + task_id
    deadline = time.monotonic() + @@DEADLINE_MS@@ / 1000
    complete = False
    while time.monotonic() < deadline:
        result = read_json(path, remaining=deadline - time.monotonic())
        task = result['data']
        if result.get('success') is not True or task['model'] != body['model'] or task['kind'] != ('asr' if '@@MODE@@' == 'transcription' else body['kind']):
            raise RuntimeError('Invalid task')
        if task['state'] == 'success' and task['billing_state'] == 'settled' and task['artifact_available']:
            if task['kind'] == 'image':
                with request(path + '/content', remaining=deadline - time.monotonic()) as response:
                    Path('result.png').write_bytes(read_bytes(response))
            elif task['kind'] == 'music':
                with request(path + '/content', remaining=deadline - time.monotonic()) as response:
                    Path('result.mp3').write_bytes(read_bytes(response))
            elif task['kind'] == 'asr':
                print(task['artifact']['text'])
            elif task['kind'] == 'video':
                print(task['artifact']['url'])
            else:
                raise RuntimeError('Unsupported task kind')
            complete = True
            break
        if task['state'] in ('failed', 'rejected', 'unknown', 'success'):
            raise RuntimeError('Task ended without usable settled result: ' + task['state'])
        time.sleep(min(@@POLL_MS@@ / 1000, max(0, deadline - time.monotonic())))
    if not complete:
        raise RuntimeError('Polling deadline reached; retain task ' + task_id)
`;
export function pythonExample(context: ExampleContext): string {
  return renderProgram(program, context);
}
