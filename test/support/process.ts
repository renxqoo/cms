import { spawn, spawnSync } from 'node:child_process';
import { z } from 'zod';

const listening = z.object({
  event: z.literal('listening'),
  address: z.object({ port: z.number() }),
});

export function runCommand(
  binary: string,
  file: string,
  options: { env: NodeJS.ProcessEnv; args?: string[]; input?: string },
) {
  const result = spawnSync(binary, [file, ...(options.args ?? [])], {
    env: options.env,
    input: options.input,
    encoding: 'utf8',
    timeout: 15000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Command failed (${file}): ${result.stderr}`);
  return result.stdout;
}

export async function startProcess(binary: string, file: string, env: NodeJS.ProcessEnv) {
  const child = spawn(binary, [file], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let errors = '';
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code));
  });
  child.stderr.on('data', (value: Buffer) => {
    errors = (errors + value.toString()).slice(-65536);
  });
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Startup timed out: ${errors}`));
    }, 15000);
    child.stdout.on('data', (value: Buffer) => {
      output = (output + value.toString()).slice(-65536);
      for (const line of output.split('\n')) {
        if (!line.startsWith('{')) continue;
        try {
          const decoded: unknown = JSON.parse(line);
          const result = listening.safeParse(decoded);
          if (result.success) {
            clearTimeout(timer);
            resolve(result.data.address.port);
          }
        } catch {
          continue;
        }
      }
    });
    void exited.then((code) => {
      clearTimeout(timer);
      return reject(new Error(`Server exited before ready (${code}): ${errors}`));
    }, reject);
  });
  async function close() {
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
    try {
      const code = await exited;
      if (code !== 0) throw new Error(`Server did not shut down cleanly (${code}): ${errors}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return { port, close, output: () => output, errors: () => errors };
}
