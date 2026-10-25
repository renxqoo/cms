import { spawn } from 'bun';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { z } from 'zod';

const resultSchema = z.object({
  value: z.string().optional(),
  error: z.string().optional(),
  restored: z.boolean(),
});

async function terminalInput(parts: (string | Uint8Array)[]) {
  const source = `
    import {readPassword} from ${JSON.stringify(fileURLToPath(new URL('../read-password.ts', import.meta.url)))};
    import {initializationFailure} from ${JSON.stringify(fileURLToPath(new URL('../initialization-error.ts', import.meta.url)))};
    const originalRaw=process.stdin.isRaw;
    const pending=readPassword('Probe: ');
    process.stdin.on('data',()=>process.stdout.write('CHUNK\\n'));
    pending.then(value=>process.stdout.write('RESULT '+JSON.stringify({value,restored:process.stdin.isRaw===originalRaw})+'\\n'),error=>{
      process.stdout.write('RESULT '+JSON.stringify({error:initializationFailure(error),restored:process.stdin.isRaw===originalRaw})+'\\n');
      process.exitCode=1;
    });
  `;
  let output = '';
  const decoder = new TextDecoder();
  const child = spawn([process.execPath, '--no-env-file', '-e', source], {
    terminal: {
      cols: 120,
      rows: 24,
      data(_terminal, bytes) {
        output += decoder.decode(bytes, { stream: true });
      },
    },
  });
  const { terminal } = child;
  if (!terminal) throw new Error('Expected a real terminal');
  const deadline = Date.now() + 4000;
  async function waitFor(check: () => boolean) {
    while (!check()) {
      if (Date.now() > deadline) throw new Error('Terminal response timed out');
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 2);
      });
    }
  }
  const timer = setTimeout(() => child.kill(), 4000);
  try {
    await waitFor(() => output.includes('Probe: '));
    for (const [index, part] of parts.entries()) {
      terminal.write(part);
      if (index < parts.length - 1)
        await waitFor(() => output.split('CHUNK').length - 1 >= index + 1);
    }
    const status = await child.exited;
    await waitFor(() => output.includes('RESULT '));
    const line = output.split(/\r?\n/).find((entry) => entry.startsWith('RESULT '));
    const value: unknown = JSON.parse(line?.slice('RESULT '.length) ?? 'null');
    return { status, ...resultSchema.parse(value) };
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) child.kill();
    await child.exited;
    terminal.close();
  }
}

it('preserves a Unicode password when one UTF-8 character arrives across terminal chunks', async () => {
  const result = await terminalInput([
    new Uint8Array([0xe7]),
    new Uint8Array([0x95, 0x8c, ...new TextEncoder().encode(`${'界'.repeat(14)}\n`)]),
  ]);
  expect(result).toEqual({ status: 0, value: '界'.repeat(15), restored: true });
});

it('preserves a leading Unicode byte order mark as part of the password', async () => {
  const password = `\uFEFF${'a'.repeat(15)}`;
  const result = await terminalInput([`${password}\n`]);
  expect(result).toEqual({ status: 0, value: password, restored: true });
});

it('removes one complete emoji with backspace after decoding split terminal bytes', async () => {
  const bytes = new TextEncoder().encode('🙂'.repeat(15));
  const result = await terminalInput([bytes.subarray(0, 2), bytes.subarray(2), '\u007fa\n']);
  expect(result).toEqual({ status: 0, value: `${'🙂'.repeat(14)}a`, restored: true });
});

it.each(['\u0003', '\u0004'])(
  'explains terminal cancellation without blaming the database',
  async (cancel) => {
    const result = await terminalInput(['private-input', cancel]);
    expect(result.status).toBe(1);
    expect(result.restored).toBe(true);
    expect(result.error).toContain('Password input cancelled');
    expect(result.error).not.toContain('database');
    expect(result.error).not.toContain('private-input');
  },
);

it('explains the password limit when terminal input exceeds the transport buffer', async () => {
  const result = await terminalInput(['a'.repeat(2049)]);
  expect(result.status).toBe(1);
  expect(result.restored).toBe(true);
  expect(result.error).toContain('15–128');
  expect(result.error).not.toContain('database');
  expect(result.error).not.toContain('a'.repeat(14));
});

it('rejects invalid UTF-8 terminal input instead of changing the password bytes', async () => {
  const result = await terminalInput([new Uint8Array([0xff, 0x0a])]);
  expect(result.status).toBe(1);
  expect(result.restored).toBe(true);
  expect(result.error).toContain('Invalid password input');
  expect(result.error).not.toContain('database');
});
