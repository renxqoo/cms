import { spawn } from 'node:child_process';
import type { BrowserOpener } from '@renxqoo/agent-cli-sdk';

export function createBrowserOpener(options: {
  signal: AbortSignal;
  timeoutMs: number;
}): BrowserOpener {
  return {
    open(url) {
      const [executable, args] = browserCommand(url);
      return new Promise<void>((resolve, reject) => {
        const child = spawn(executable, args, {
          stdio: 'ignore',
          env: { ...process.env },
          signal: options.signal,
          killSignal: 'SIGKILL',
        });
        const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs);
        child.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once('close', (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error('Browser launcher failed'));
        });
      });
    },
  };
}

function browserCommand(url: string): [string, string[]] {
  if (process.platform === 'darwin') return ['open', [url]];
  if (process.platform === 'win32') return ['rundll32', ['url.dll,FileProtocolHandler', url]];
  return ['xdg-open', [url]];
}
