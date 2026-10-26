import { expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { renderIntegrationExamples } from '../examples.ts';
const filenames: Record<string, string> = {
  python: 'example.py',
  curl: 'example.sh',
  go: 'example.go',
};
const commands: Record<string, string> = { python: 'python3', curl: 'bash', go: 'go' };
const policy = {
  requestTimeoutMs: 2000,
  pollIntervalMs: 1000,
  pollDeadlineMs: 3000,
  maxResponseBytes: 1048576,
};
const sample = {
  profileKey: 'core.chat',
  flowKey: 'chat.json',
  modelId: 'Provider/Exact:Model',
  requestValues: {
    messages: [{ role: 'user', content: `A quote ' " \\ \n $() 😀` }],
    max_tokens: 100,
  },
  baseUrl: 'https://api.oneaster.test/v1',
  policy,
};
function run(command: string, arguments_: string[], cwd: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd,
      env: {
        ...process.env,
        ONEASTER_API_KEY: 'oak_test',
        ONEASTER_INTENT_ID: 'stable-intent-test',
      },
    });
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
it('renders every supported language with safe data injection and no invented public endpoints', () => {
  const result = renderIntegrationExamples(sample);
  expect(result.map((item) => item.key)).toEqual([
    'curl',
    'python',
    'javascript',
    'typescript',
    'go',
    'java',
    'php',
  ]);
  for (const item of result) {
    expect(item.code).not.toMatch(/@@[A-Z_]+@@/u);
    expect(item.code).not.toContain('/core/');
    expect(item.code).not.toContain('/lookup');
    expect(item.code).toContain('ONEASTER_INTENT_ID');
    expect(item.requirements.length).toBeGreaterThan(0);
  }
});
it('refuses credentials, query strings and unsupported base URLs before producing code', () => {
  for (const baseUrl of [
    'https://secret@api.example/v1',
    'https://api.example/v1?token=x',
    'javascript:alert(1)',
    'https://api.example/other',
  ])
    expect(() => renderIntegrationExamples({ ...sample, baseUrl })).toThrowError(Error);
});
it.each(['javascript', 'python', 'curl', 'go'])(
  '%s sample executes JSON using one stable intent and the exact safely serialized model and prompt',
  async (language) => {
    const requests: { path: string; body: unknown; intent: string | undefined }[] = [];
    const server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      request.on('end', () => {
        requests.push({
          path: request.url ?? '',
          body: JSON.parse(body),
          intent: request.headers['idempotency-key']?.toString(),
        });
        response.setHeader('Content-Type', 'application/json');
        response.end(
          JSON.stringify({ choices: [{ message: { content: 'Actual test response' } }] }),
        );
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test address');
    const directory = await mkdtemp(join(tmpdir(), 'oneaster-code-'));
    try {
      const example = renderIntegrationExamples({
        ...sample,
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
      }).find((item) => item.key === language);
      if (!example) throw new Error('Missing renderer');
      const filename = filenames[language] ?? 'example.mjs';
      await writeFile(join(directory, filename), example.code);
      const command = commands[language] ?? 'node';
      const result = await run(
        command,
        language === 'go' ? ['run', filename] : [filename],
        directory,
      );
      expect(result.stderr).toContain('stable-intent-test');
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe('Actual test response');
      expect(requests).toEqual([
        {
          path: '/v1/chat/completions',
          intent: 'stable-intent-test',
          body: { ...sample.requestValues, model: sample.modelId, stream: false },
        },
      ]);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      await rm(directory, { recursive: true, force: true });
    }
  },
);
it.each(['javascript', 'python'])(
  '%s task example polls the accepted UUID and downloads a settled image without a second POST',
  async (language) => {
    let posts = 0;
    const id = '10000000-0000-4000-8000-000000000001';
    const paths: string[] = [];
    const server = createServer((request, response) => {
      request.resume();
      paths.push(`${request.method} ${request.url}`);
      response.setHeader('Content-Type', 'application/json');
      if (request.method === 'POST') {
        posts++;
        response.statusCode = 202;
        response.end(
          JSON.stringify({
            success: true,
            data: { id, reused: false, status_url: `/v1/tasks/${id}` },
          }),
        );
      } else if (request.url?.endsWith('/content')) {
        response.setHeader('Content-Type', 'image/png');
        response.end('test-png-bytes');
      } else
        response.end(
          JSON.stringify({
            success: true,
            data: {
              id,
              kind: 'image',
              model: 'image/exact',
              state: 'success',
              billing_state: 'settled',
              artifact_available: true,
              artifact: { media_type: 'image/png' },
            },
          }),
        );
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test address');
    const directory = await mkdtemp(join(tmpdir(), 'oneaster-task-code-'));
    try {
      const example = renderIntegrationExamples({
        profileKey: 'core.image-tasks',
        flowKey: 'image.generate',
        modelId: 'image/exact',
        requestValues: { input: { prompt: 'A scene', aspect_ratio: '1:1' } },
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        policy,
      }).find((item) => item.key === language);
      if (!example) throw new Error('Missing renderer');
      const filename = language === 'python' ? 'example.py' : 'example.mjs';
      await writeFile(join(directory, filename), example.code);
      const result = await run(language === 'python' ? 'python3' : 'node', [filename], directory);
      expect(result.code).toBe(0);
      expect(posts).toBe(1);
      expect(paths).toEqual([
        'POST /v1/tasks',
        `GET /v1/tasks/${id}`,
        `GET /v1/tasks/${id}/content`,
      ]);
      expect(await readFile(join(directory, 'result.png'), 'utf8')).toBe('test-png-bytes');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      await rm(directory, { recursive: true, force: true });
    }
  },
);
it.each(['javascript', 'python', 'curl', 'go'])(
  '%s SSE sample requires DONE and never retries a failed stream',
  async (language) => {
    let complete = true;
    let posts = 0;
    const server = createServer((request, response) => {
      request.resume();
      posts++;
      response.setHeader('Content-Type', 'text/event-stream');
      response.write(': keepalive\n\n');
      response.write('data: {"choices":[{"delta":{"content":"partial response"}}]}\n\n');
      response.end(complete ? 'data: [DONE]\n\n' : '');
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test address');
    const directory = await mkdtemp(join(tmpdir(), 'oneaster-stream-code-'));
    try {
      const example = renderIntegrationExamples({
        ...sample,
        flowKey: 'chat.sse',
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
      }).find((item) => item.key === language);
      if (!example) throw new Error('Missing renderer');
      const filename = filenames[language] ?? 'example.mjs';
      await writeFile(join(directory, filename), example.code);
      const command = commands[language] ?? 'node';
      const args = language === 'go' ? ['run', filename] : [filename];
      const success = await run(command, args, directory);
      expect(success.code).toBe(0);
      expect(success.stdout).toBe('partial response');
      expect(posts).toBe(1);
      complete = false;
      const failed = await run(command, args, directory);
      expect(failed.code).not.toBe(0);
      expect(failed.stderr.toLowerCase()).toContain('intent');
      expect(posts).toBe(2);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      await rm(directory, { recursive: true, force: true });
    }
  },
);
it.each(['javascript', 'python'])(
  '%s retains an unknown task without issuing another paid request',
  async (language) => {
    let posts = 0;
    const server = createServer((request, response) => {
      request.resume();
      response.setHeader('Content-Type', 'application/json');
      if (request.method === 'POST') {
        posts++;
        response.statusCode = 202;
        response.end('{"success":true,"data":{"id":"10000000-0000-4000-8000-000000000001"}}');
      } else
        response.end(
          JSON.stringify({
            success: true,
            data: { model: 'image/exact', state: 'unknown', billing_state: 'reserved' },
          }),
        );
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test address');
    const directory = await mkdtemp(join(tmpdir(), 'oneaster-unknown-code-'));
    try {
      const example = renderIntegrationExamples({
        profileKey: 'core.image-tasks',
        flowKey: 'image.generate',
        modelId: 'image/exact',
        requestValues: { input: { prompt: 'A scene', aspect_ratio: '1:1' } },
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        policy,
      }).find((item) => item.key === language);
      if (!example) throw new Error('Missing renderer');
      const filename = filenames[language] ?? 'example.mjs';
      await writeFile(join(directory, filename), example.code);
      const result = await run(commands[language] ?? 'node', [filename], directory);
      expect(result.code).not.toBe(0);
      expect(posts).toBe(1);
      expect(result.stderr).toContain('unknown');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      await rm(directory, { recursive: true, force: true });
    }
  },
);
