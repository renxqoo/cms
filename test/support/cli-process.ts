import { spawn } from 'node:child_process';
import { nodeExecutable } from './node-runtime.ts';

export interface CliProcessOptions {
  env: NodeJS.ProcessEnv;
  args: string[];
  input?: unknown;
}

export interface CliProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export function startCliProcess(options: CliProcessOptions) {
  const authorization = Promise.withResolvers<URL>();
  const completion = Promise.withResolvers<CliProcessResult>();
  const child = spawn(nodeExecutable(), ['apps/cli/dist/main.js', ...options.args], {
    env: {
      ...process.env,
      CMS_ACCESS_TOKEN: undefined,
      CMS_CLI_PROFILE: 'default',
      ...options.env,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  const timer = setTimeout(() => {
    child.kill('SIGKILL');
    completion.reject(new Error('CLI process did not settle within 20 seconds'));
  }, 20_000);
  child.stdout.on('data', (chunk: Buffer) => {
    stdout = (stdout + chunk.toString()).slice(-65_536);
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-65_536);
    const value = /^Authorize this CLI: (https?:\/\/\S+)/m.exec(stderr)?.[1];
    if (value) authorization.resolve(new URL(value));
  });
  child.once('error', (error) => {
    clearTimeout(timer);
    authorization.reject(error);
    completion.reject(error);
  });
  child.once('exit', (code) => {
    clearTimeout(timer);
    authorization.reject(new Error('CLI exited before exposing an authorization URL'));
    completion.resolve({ code, stdout, stderr });
  });
  child.stdin.end(options.input === undefined ? undefined : JSON.stringify(options.input));
  void authorization.promise.catch(() => {});
  void completion.promise.catch(() => {});
  return {
    authorization: authorization.promise,
    result: completion.promise,
    async close() {
      child.kill('SIGTERM');
      await completion.promise;
    },
  };
}

export async function runCliProcess(options: CliProcessOptions): Promise<CliProcessResult> {
  return startCliProcess(options).result;
}
