import { createRuntime } from './bootstrap/create-runtime.ts';
import { loadConfig } from './bootstrap/load-config.ts';
import { startServer } from './bootstrap/server.ts';
import { startupFailure } from './bootstrap/startup-error.ts';

async function main(): Promise<void> {
  const config = loadConfig();
  const runtime = createRuntime(config);
  try {
    const running = await startServer(runtime, config.http);
    let stopping = false;
    const cleanup = async () => {
      if (stopping) return;
      stopping = true;
      process.off('SIGTERM', onSignal);
      process.off('SIGINT', onSignal);
      const hardStop = setTimeout(() => {
        process.stderr.write('CMS shutdown deadline exceeded; terminating remaining work.\n');
        process.exit(1);
      }, config.http.shutdownTimeoutMs);
      hardStop.unref();
      await running.close();
      clearTimeout(hardStop);
    };
    function onSignal() {
      void cleanup().catch(() => {
        process.exitCode = 1;
      });
    }
    process.on('SIGTERM', onSignal);
    process.on('SIGINT', onSignal);
    process.stdout.write(
      `${JSON.stringify({ event: 'listening', address: running.server.address() })}\n`,
    );
  } catch (error) {
    await runtime.close();
    throw error;
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(startupFailure(error));
  process.exitCode = 1;
});
