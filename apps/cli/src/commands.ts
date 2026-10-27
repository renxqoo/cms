import { open, writeFile, stat } from 'node:fs/promises';
import { defineCommand, ValidationError } from '@renxqoo/agent-cli-sdk';
import type { CommandGroup, CommandContext } from '@renxqoo/agent-cli-sdk';
import { z } from 'zod';
import { editorSessionIdSchema } from '@new-cms/api-client/client';
import { operations } from '@new-cms/api-client/operations';
import type { ApiOperation } from '@new-cms/api-client/operations';
import type { CliConfig } from './config.ts';
import { login, logout } from './oauth.ts';
import { createSessionStore } from './state.ts';

export interface CliState {
  signal: AbortSignal;
  execute(request: { path: string; body?: unknown }): Promise<unknown>;
}
const input = z.object({
  editorSessionId: editorSessionIdSchema.optional(),
  input: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().min(16).max(128).optional(),
  file: z.string().optional(),
  output: z.string().optional(),
});

function kebab(value: string): string {
  return value.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

async function binaryInput(args: z.infer<typeof input>, maximum: number) {
  if (!args.file)
    throw new ValidationError({
      subtype: 'missing_required',
      message: 'Upload requires an explicit file path in the file field',
    });
  const metadata = await stat(args.file);
  if (!metadata.isFile() || metadata.size > maximum)
    throw new ValidationError({
      subtype: 'out_of_range',
      message: 'Upload file exceeds byte limit or is not a file',
    });
  const file = await open(args.file, 'r');
  const bytes = new Uint8Array(maximum + 1);
  let size = 0;
  try {
    while (size < bytes.length) {
      const read = await file.read(bytes, size, bytes.length - size);
      if (read.bytesRead === 0) break;
      size += read.bytesRead;
    }
  } finally {
    await file.close();
  }
  if (size > maximum)
    throw new ValidationError({
      subtype: 'out_of_range',
      message: 'Upload file exceeds byte limit',
    });
  return bytes.subarray(0, size);
}

async function binaryOutput(value: unknown, output: string | undefined) {
  if (!output)
    throw new ValidationError({
      subtype: 'missing_required',
      message: 'Download requires an explicit output path',
    });
  const file = z
    .object({
      data: z.instanceof(Uint8Array),
      bytes: z.number(),
      filename: z.string(),
      mimeType: z.string(),
    })
    .parse(value);
  await writeFile(output, file.data, { mode: 0o600, flag: 'wx' });
  return { bytes: file.bytes, filename: file.filename, mimeType: file.mimeType, output };
}

function businessCommand(operation: ApiOperation, maximum: number) {
  const name = kebab(operation.id.split('.')[1] ?? operation.id);
  return defineCommand({
    name,
    description: `${operation.id}: ${operation.method} ${operation.path}`,
    args: { type: 'json', schema: input },
    async run(context: CommandContext<CliState>, args) {
      if (operation.transport === 'download' && !args.output)
        throw new ValidationError({
          subtype: 'missing_required',
          message: 'Download requires an explicit output path',
        });
      const bytes = operation.transport === 'upload' ? await binaryInput(args, maximum) : undefined;
      const value = await context.state.execute({
        path: operation.id,
        body: {
          input: args.input,
          idempotencyKey: args.idempotencyKey,
          editorSessionId: args.editorSessionId,
          bytes,
        },
      });
      return {
        data: operation.transport === 'download' ? await binaryOutput(value, args.output) : value,
      };
    },
  });
}

export function businessCommands(maximum: number): Record<string, CommandGroup<CliState>> {
  const namespaces: Record<string, CommandGroup<CliState>> = {};
  for (const operation of operations) {
    const [identity] = operation.id.split('.');
    if (!identity) throw new Error('Invalid operation identity');
    const namespace = kebab(identity);
    namespaces[namespace] ??= {};
    const command = businessCommand(operation, maximum);
    namespaces[namespace][command.name] = command;
  }
  return namespaces;
}

export function authCommands(config: CliConfig): CommandGroup<CliState> {
  return {
    login: defineCommand({
      name: 'login',
      description: 'Authorize this profile with OAuth PKCE',
      args: { schema: z.object({ browser: z.boolean().default(true) }) },
      async run(context: CommandContext<CliState>, args) {
        await login(config, { signal: context.state.signal, browser: args.browser });
        return { data: { loggedIn: true, origin: config.origin, profile: config.profile } };
      },
    }),
    status: defineCommand({
      name: 'status',
      description: 'Show this profile without exposing tokens',
      async run() {
        const stored = await createSessionStore(config).read();
        return {
          data: {
            origin: config.origin,
            profile: config.profile,
            source: config.token ? 'environment' : 'profile',
            loggedIn: config.token !== undefined || stored !== null,
            expiresAt: stored ? new Date(stored.expiresAt).toISOString() : null,
          },
        };
      },
    }),
    logout: defineCommand({
      name: 'logout',
      description: 'Revoke this CLI login',
      async run(context: CommandContext<CliState>) {
        await logout(config, context.state.signal);
        return { data: { loggedOut: true } };
      },
    }),
  };
}
