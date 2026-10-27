import type { ProductionConfig } from './config';
import type { DockerRun } from './docker-types';

function assertBody(status: number, body: unknown, expected: string): void {
  if (
    status !== 200 ||
    typeof body !== 'object' ||
    body === null ||
    Reflect.get(body, 'status') !== expected
  )
    throw new Error(`CMS ${expected} check must return HTTP 200 and status=${expected}`);
}

function assertOptionalReadiness(status: number, body: unknown): void {
  if (status === 503) {
    if (typeof body !== 'object' || body === null)
      throw new Error('CMS readiness body must be valid JSON while degraded');
    return;
  }
  assertBody(status, body, 'ready');
}

function parseHealth(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('CMS health response must contain valid JSON');
  }
}

export async function probeDockerHealth(config: ProductionConfig, run: DockerRun): Promise<void> {
  for (const path of ['/livez', '/readyz']) {
    const readiness = path.endsWith('readyz');
    const expected = readiness ? 'ready' : 'ok';
    const response = await fetch(`http://127.0.0.1:${config.port}${path}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(4000),
    });
    const localBody = parseHealth(await response.text());
    if (readiness) assertOptionalReadiness(response.status, localBody);
    else assertBody(response.status, localBody, expected);
    const edgeOrigin = readiness ? config.apiOrigin : config.adminOrigin;
    const output = await run([
      'curl',
      '--silent',
      '--show-error',
      '--noproxy',
      '*',
      '--max-time',
      '5',
      '--write-out',
      '\n%{http_code}',
      ...(readiness ? [] : ['--fail']),
      '--resolve',
      `${new URL(edgeOrigin).hostname}:443:127.0.0.1`,
      `${edgeOrigin}${path}`,
    ]);
    const split = output.lastIndexOf('\n');
    const edgeBody = parseHealth(output.slice(0, split));
    if (readiness) assertOptionalReadiness(Number(output.slice(split + 1)), edgeBody);
    else assertBody(Number(output.slice(split + 1)), edgeBody, expected);
  }
}
