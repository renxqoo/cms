import type { ExampleContext } from './program.ts';
import { renderProgram } from './program.ts';
const program = String.raw`
import { randomUUID } from 'node:crypto';
import { open, writeFile } from 'node:fs/promises';
const base = Buffer.from('@@BASE@@', 'base64').toString('utf8');
const key = process.env.ONEASTER_API_KEY;
if (!key) throw new Error('Set ONEASTER_API_KEY');
const intent = process.env.ONEASTER_INTENT_ID || randomUUID();
console.error('Keep this intent and input:', intent);
const mode = String('@@MODE@@');
const body = JSON.parse(Buffer.from('@@BODY@@', 'base64').toString('utf8'));
const headers = { Authorization: 'Bearer ' + key, 'Idempotency-Key': intent };
async function request(path, options = {}, remaining = @@REQUEST_MS@@) {
  const response = await fetch(base + path, { ...options, headers: { ...headers, ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, redirect: 'error', signal: AbortSignal.timeout(Math.max(1, Math.min(@@REQUEST_MS@@, remaining))) });
  if (!response.ok) throw new Error('HTTP ' + response.status + '; inspect original intent ' + intent);
  return response;
}
async function bytes(response) {
  if (!response.body) throw new Error('Missing response body');
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > @@MAX_BYTES@@) throw new Error('Response exceeds limit');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks);
}
async function json(path, options = {}, remaining) {
  return JSON.parse((await bytes(await request(path, options, remaining))).toString('utf8'));
}
async function upload() {
  const filename = process.env.ONEASTER_AUDIO_FILE;
  if (!filename) throw new Error('Set ONEASTER_AUDIO_FILE to a PCM WAV file');
  const source = await open(filename, 'r');
  const content = Buffer.alloc(8388609);
  let size = 0;
  try {
    while (size < content.length) {
      const chunk = await source.read(content, size, content.length - size);
      if (!chunk.bytesRead) break;
      size += chunk.bytesRead;
    }
  } finally { await source.close(); }
  if (size < 44 || size > 8388608) throw new Error('PCM WAV must be 44 bytes to 8 MiB');
  const form = new FormData();
  form.set('model', body.model);
  if (body.language) form.set('language', body.language);
  form.set('file', new Blob([new Uint8Array(content.subarray(0, size))], { type: 'audio/wav' }), 'input.wav');
  return json('/audio/transcriptions', { method: 'POST', body: form });
}
if (mode === 'sse') {
  const response = await request('/chat/completions', { method: 'POST', body: JSON.stringify(body) });
  if (!response.headers.get('content-type')?.startsWith('text/event-stream')) throw new Error('Expected SSE');
  if (!response.body) throw new Error('Missing response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let pending = '', size = 0, complete = false;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > @@MAX_BYTES@@) throw new Error('Stream exceeds limit');
      pending += decoder.decode(chunk.value, { stream: true });
      pending = pending.replaceAll('\r\n', '\n');
      let boundary;
      while ((boundary = pending.indexOf('\n\n')) >= 0) {
        const frame = pending.slice(0, boundary);
        pending = pending.slice(boundary + 2);
        const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
        if (data === '[DONE]') { complete = true; break; }
        if (!data) continue;
        const event = JSON.parse(data);
        if (event.error) throw new Error('Stream failed; inspect original intent ' + intent);
        for (const choice of event.choices || []) process.stdout.write(choice.delta?.content || '');
      }
      if (complete) break;
    }
    if (!complete) throw new Error('Incomplete SSE; keep original intent ' + intent);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
} else if (mode === 'json') {
  const result = await json('/chat/completions', { method: 'POST', body: JSON.stringify(body) });
  process.stdout.write(result.choices[0].message.content);
} else {
  const accepted = mode === 'transcription' ? await upload() : await json('/tasks', { method: 'POST', body: JSON.stringify(body) });
  if (accepted.success !== true || !/^[0-9a-f-]{36}$/i.test(accepted.data?.id || '')) throw new Error('Invalid task acknowledgement');
  const path = '/tasks/' + accepted.data.id;
  const deadline = Date.now() + @@DEADLINE_MS@@;
  let complete = false;
  while (Date.now() < deadline) {
    const result = await json(path, {}, deadline - Date.now());
    const task = result.data;
    if (result.success !== true || task?.model !== body.model || task.kind !== (mode === 'transcription' ? 'asr' : body.kind)) throw new Error('Invalid task');
    if (task.state === 'success' && task.billing_state === 'settled' && task.artifact_available) {
      if (task.kind === 'image') await writeFile('result.png', await bytes(await request(path + '/content', {}, deadline - Date.now())));
      else if (task.kind === 'music') await writeFile('result.mp3', await bytes(await request(path + '/content', {}, deadline - Date.now())));
      else if (task.kind === 'asr') process.stdout.write(task.artifact.text);
      else if (task.kind === 'video') process.stdout.write(task.artifact.url);
      else throw new Error('Unsupported task kind');
      complete = true; break;
    }
    if (['failed', 'rejected', 'unknown', 'success'].includes(task.state)) throw new Error('Task ended without a usable settled result: ' + task.state);
    await new Promise((resolve) => setTimeout(resolve, Math.min(@@POLL_MS@@, Math.max(0, deadline - Date.now()))));
  }
  if (!complete) throw new Error('Polling deadline reached; retain task ' + accepted.data.id);
}
`;
export function javascriptExample(context: ExampleContext): string {
  return renderProgram(program, context);
}
export function typescriptExample(context: ExampleContext): string {
  return javascriptExample(context)
    .replace(
      'async function request(path, options = {}, remaining =',
      'async function request(path: string, options: RequestInit = {}, remaining =',
    )
    .replace('async function bytes(response)', 'async function bytes(response: Response)')
    .replace(
      'async function json(path, options = {}, remaining)',
      'async function json(path: string, options: RequestInit = {}, remaining?: number)',
    );
}
