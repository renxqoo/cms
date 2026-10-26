import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { nodeExecutable } from '../../../../../../test/support/node-runtime.ts';

const execute = promisify(execFile);
const runner = fileURLToPath(new URL('./local-stream-runner.ts', import.meta.url));

it.each(['abort-opening', 'abort-start', 'cancel', 'eof', 'shutdown', 'prefetched-shutdown'])(
  'regression: explicitly releases storage file handles on real Node before GC after %s',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'cms-storage-node-'));
    try {
      const result = await execute(nodeExecutable(), ['--expose-gc', runner, mode, root], {
        timeout: 5000,
      });
      expect(result.stdout).toBe(`Closed stream ownership: ${mode}\n`);
      expect(result.stderr).toBe('');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
