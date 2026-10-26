import { loadMcpConfig } from './config.ts';
import { startMcpServer } from './server.ts';

const runtime = await startMcpServer(loadMcpConfig());
process.stdout.write(
  `${JSON.stringify({ event: 'listening', address: { port: runtime.port }, service: 'mcp' })}\n`,
);
function stop() {
  process.off('SIGINT', stop);
  process.off('SIGTERM', stop);
  void runtime.close().catch(() => {
    process.exitCode = 1;
  });
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
