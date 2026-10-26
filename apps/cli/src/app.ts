import {
  BareError,
  defineCli,
  ValidationError,
  CliError,
  exitCodeOf,
} from '@renxqoo/agent-cli-sdk';
import type { Plugin } from '@renxqoo/agent-cli-sdk';
import { z } from 'zod';
import { ApiError } from '@new-cms/api-client/client';
import { authCommands, businessCommands } from './commands.ts';
import type { CliState } from './commands.ts';
import { apiRequest } from './http.ts';
import type { CliConfig } from './config.ts';

function apiPlugin(config: CliConfig): Plugin<CliState> {
  return {
    name: 'cms-http',
    beforeCommand(context) {
      const execute = apiRequest(config, context);
      context.state.execute = (request) =>
        execute(request).catch((error: unknown) => cliFailure(error));
      return Promise.resolve();
    },
  };
}

export function cliFailure(error: unknown): never {
  const problem =
    error instanceof ApiError
      ? {
          code: error.code,
          requestId: error.requestId,
          status: error.status,
          message: error.message,
        }
      : {
          code: failureCode(error),
          requestId: null,
          message: error instanceof Error ? error.message : 'Request failed',
        };
  process.stderr.write(`${JSON.stringify({ ok: false, error: problem })}\n`);
  if (error instanceof ApiError) throw new BareError([401, 403].includes(error.status) ? 3 : 1);
  if (error instanceof CliError) throw new BareError(exitCodeOf(error.category));
  throw new BareError(error instanceof z.ZodError ? 2 : 4);
}

export function createCli(config: CliConfig, signal: AbortSignal) {
  const auth: Plugin<CliState> = {
    name: 'cms-oauth',
    provides: { namespaces: { auth: authCommands(config) } },
  };
  const app = defineCli<CliState>({
    name: 'cms',
    binName: 'cms',
    description: 'CMS administration',
    commands: {},
    namespaces: businessCommands(config.maxFileBytes),
    plugins: [auth, apiPlugin(config)],
    createState: () => ({
      signal,
      execute: () => Promise.reject(new Error('CMS HTTP plugin is not initialized')),
    }),
    defaultFormat: 'json',
  });
  return {
    name: app.name,
    run(argv: string[]): Promise<void> {
      if (argv.some((argument) => argument === '--api-key' || argument.startsWith('--api-key=')))
        cliFailure(
          new ValidationError({
            subtype: 'invalid_argument',
            message:
              'API keys target MCP. Use cms auth login or CMS_ACCESS_TOKEN with an API access token.',
          }),
        );
      return app.run(argv);
    },
  };
}

function failureCode(error: unknown): string {
  if (error instanceof z.ZodError || error instanceof ValidationError) return 'invalid_input';
  if (error instanceof CliError) return error.subtype;
  return 'request_failed';
}
