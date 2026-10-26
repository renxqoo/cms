import { expect, it } from 'vitest';
import { createServer } from 'node:http';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderIntegrationExamples } from '../examples.ts';
import { execute } from './multimodal-fixture.ts';
it('cURL sends a valid large Core JSON request without exceeding the Linux per-argument budget', async () => {
  const requests: unknown[] = [];
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on('end', () => {
      requests.push(JSON.parse(body) as unknown);
      response.setHeader('Content-Type', 'application/json');
      response.end('{"choices":[{"message":{"content":"Accepted large input"}}]}');
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture');
  const directory = await mkdtemp(join(tmpdir(), 'oneaster-large-curl-'));
  const requestValues = {
    messages: [{ role: 'user', content: 'x'.repeat(240000) }],
    max_tokens: 1,
  };
  try {
    const sample = renderIntegrationExamples({
      profileKey: 'core.chat',
      flowKey: 'chat.json',
      modelId: 'business/chat',
      requestValues,
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      policy: {
        requestTimeoutMs: 2000,
        pollIntervalMs: 1000,
        pollDeadlineMs: 3000,
        maxResponseBytes: 1048576,
      },
    }).find((item) => item.key === 'curl');
    if (!sample) throw new Error('Missing renderer');
    await writeFile(join(directory, 'example.sh'), sample.code);
    const wrapper =
      "#!/usr/bin/env node\nimport { spawnSync } from 'node:child_process';\nconst args=process.argv.slice(2);if(args.some(value=>Buffer.byteLength(value)>131071)){process.stderr.write('Linux argument limit exceeded');process.exit(126);}const result=spawnSync('/usr/bin/jq',args,{stdio:'inherit'});process.exit(result.status??1);\n";
    await writeFile(join(directory, 'jq'), wrapper);
    await chmod(join(directory, 'jq'), 0o700);
    const result = await execute({
      directory,
      filename: 'example.sh',
      language: 'curl',
      searchPath: `${directory}:${process.env.PATH ?? ''}`,
    });
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('Accepted large input');
    expect(requests).toEqual([{ ...requestValues, model: 'business/chat', stream: false }]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await rm(directory, { recursive: true, force: true });
  }
});
