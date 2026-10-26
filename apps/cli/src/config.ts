import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { apiOrigin } from '@new-cms/api-client/client';

export function cliConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = z
    .object({
      CMS_API_ORIGIN: z.string(),
      CMS_CLI_PROFILE: z.string().min(1).max(128).default('default'),
      CMS_CLI_STATE_DIR: z.string().default(join(homedir(), '.cms')),
      CMS_CLI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
      CMS_CLI_LOGIN_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
      CMS_CLI_FILE_LIMIT_BYTES: z.coerce.number().int().positive().default(20_971_520),
      CMS_CLI_RESPONSE_LIMIT_BYTES: z.coerce.number().int().positive().default(33_554_432),
      CMS_ACCESS_TOKEN: z.string().optional(),
    })
    .parse(env);
  return {
    oauthResponseLimitBytes: 65_536,
    browserOpenTimeoutMs: 10_000,
    refreshSkewMs: 30_000,
    callbackLimits: { headerBytes: 8192, urlCharacters: 4096, codeCharacters: 1024 },
    lockLimits: { pollMs: 50, invalidGraceMs: 60_000, waitMs: parsed.CMS_CLI_TIMEOUT_MS },
    origin: apiOrigin(parsed.CMS_API_ORIGIN),
    profile: parsed.CMS_CLI_PROFILE,
    stateDir: parsed.CMS_CLI_STATE_DIR,
    timeoutMs: parsed.CMS_CLI_TIMEOUT_MS,
    loginTimeoutMs: parsed.CMS_CLI_LOGIN_TIMEOUT_MS,
    maxFileBytes: parsed.CMS_CLI_FILE_LIMIT_BYTES,
    maxResponseBytes: parsed.CMS_CLI_RESPONSE_LIMIT_BYTES,
    ...(parsed.CMS_ACCESS_TOKEN ? { token: parsed.CMS_ACCESS_TOKEN } : {}),
  };
}
export type CliConfig = ReturnType<typeof cliConfig>;
