import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { renderIntegrationExamples } from '../examples.ts';
type Kind = 'music' | 'asr' | 'video';
interface Received {
  path: string;
  intent: string | undefined;
  authorization: string | undefined;
  fields: unknown;
  file?: Buffer;
}
const id = '10000000-0000-4000-8000-000000000009';
export const audio = Buffer.alloc(76, 1);
export const mp3 = Buffer.from('isolated archived MP3 bytes');
export async function protocol(kind: Kind, state = 'success') {
  const received: Received[] = [],
    errors: unknown[] = [];
  const server = createServer((request, response) => {
    void handle(request, response, { kind, state, received }).catch((error) => {
      errors.push(error);
      response.statusCode = 500;
      response.end('Protocol fixture failed');
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture address');
  return { server, received, errors, baseUrl: `http://127.0.0.1:${address.port}/v1` };
}
async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  data: { kind: Kind; state: string; received: Received[] },
) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    if (!Buffer.isBuffer(chunk)) throw new Error('Unexpected request chunk');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);
  const received: Received = {
    path: `${request.method} ${request.url}`,
    intent: request.headers['idempotency-key']?.toString(),
    authorization: request.headers.authorization,
    fields: null,
  };
  if (request.method === 'POST') {
    if (data.kind === 'asr') {
      const form = await new Response(raw, {
        headers: { 'Content-Type': request.headers['content-type'] ?? '' },
      }).formData();
      const file = form.get('file');
      if (!(file instanceof File)) throw new Error('Missing audio form file');
      received.file = Buffer.from(await file.arrayBuffer());
      received.fields = {
        model: form.get('model'),
        language: form.get('language'),
        names: [...form.keys()].toSorted(),
      };
    } else received.fields = JSON.parse(raw.toString()) as unknown;
    response.statusCode = 202;
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify({ success: true, data: { id, reused: false, status_url: `/v1/tasks/${id}` } }),
    );
  } else if (request.url?.endsWith('/content')) {
    response.setHeader('Content-Type', 'audio/mpeg');
    response.end(mp3);
  } else {
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify({
        success: true,
        data: {
          id,
          model: `business/${data.kind}`,
          kind: data.kind,
          state: data.state,
          billing_state: data.state === 'success' ? 'settled' : 'reserved',
          artifact_available: data.state === 'success',
          artifact: artifact(data.kind),
        },
      }),
    );
  }
  data.received.push(received);
}
function artifact(kind: Kind) {
  if (kind === 'asr')
    return {
      media_type: 'text/plain',
      text: 'Recognized real protocol text',
      duration: 1,
      duration_ms: 1000,
    };
  if (kind === 'video')
    return { media_type: 'video/mp4', url: 'https://file.aiquickdraw.com/fixture.mp4' };
  return { media_type: 'audio/mpeg', duration_ms: 1000 };
}
function scenario(kind: Kind) {
  if (kind === 'asr')
    return {
      profileKey: 'core.transcriptions',
      flowKey: 'audio.transcribe',
      requestValues: { language: 'en' },
    };
  if (kind === 'video')
    return {
      profileKey: 'core.video-tasks',
      flowKey: 'video.seedance-25-text',
      requestValues: {
        input: {
          prompt: '船'.repeat(20480),
          aspect_ratio: '21:9',
          resolution: '480p',
          duration: 5,
        },
      },
    };
  return {
    profileKey: 'core.music-tasks',
    flowKey: 'music.generate',
    requestValues: { input: { prompt: 'An "original" melody $()', is_instrumental: true } },
  };
}
export async function program(input: { language: string; kind: Kind; baseUrl: string }) {
  const directory = await mkdtemp(join(tmpdir(), 'oneaster-multimodal-'));
  const extensions: Record<string, string> = {
    python: 'py',
    curl: 'sh',
    go: 'go',
    typescript: 'ts',
  };
  const filename = `example.${extensions[input.language] ?? 'mjs'}`;
  const sample = renderIntegrationExamples({
    ...scenario(input.kind),
    modelId: `business/${input.kind}`,
    baseUrl: input.baseUrl,
    policy: {
      requestTimeoutMs: 2000,
      pollIntervalMs: 1000,
      pollDeadlineMs: 3000,
      maxResponseBytes: 1048576,
    },
  }).find((item) => item.key === input.language);
  if (!sample) throw new Error('Missing renderer');
  await writeFile(join(directory, filename), sample.code);
  await writeFile(join(directory, 'input.wav'), audio);
  return { directory, filename };
}
export function execute(input: {
  directory: string;
  filename: string;
  language: string;
  file?: string;
  searchPath?: string;
}) {
  const commands: Record<string, string> = {
    python: 'python3',
    curl: 'bash',
    go: 'go',
    typescript: 'bun',
  };
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(
      commands[input.language] ?? 'node',
      input.language === 'go' ? ['run', input.filename] : [input.filename],
      {
        cwd: input.directory,
        env: {
          ...process.env,
          PATH: input.searchPath ?? process.env.PATH,
          ONEASTER_API_KEY: 'oak_isolated',
          ONEASTER_INTENT_ID: 'stable-multimodal-intent',
          ONEASTER_AUDIO_FILE: input.file ?? join(input.directory, 'input.wav'),
        },
      },
    );
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
