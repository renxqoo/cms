import { BareError } from '@renxqoo/agent-cli-sdk';
import { cliConfig } from './config.ts';
import { createCli, cliFailure } from './app.ts';

const controller = new AbortController();
function cancel() {
  controller.abort(new Error('CLI cancelled'));
}
process.once('SIGINT', cancel);
process.once('SIGTERM', cancel);
try {
  await createCli(cliConfig(), controller.signal).run(process.argv.slice(2));
} catch (error) {
  try {
    if (error instanceof BareError) throw error;
    cliFailure(error);
  } catch (error_) {
    process.exitCode = error_ instanceof BareError ? error_.exitCode : 1;
  }
} finally {
  process.off('SIGINT', cancel);
  process.off('SIGTERM', cancel);
}
