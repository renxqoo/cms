import { CmsError, fail } from '@new-cms/cms/platform/contracts';
import type { SqlExecutor } from '@new-cms/database/client';
import type { ContentOptions } from '../types.ts';
import { createContentStore } from '../adapters/postgres/store.ts';
import { readLanguages, readRows, text } from './source.ts';
import type { MessageContract } from './types.ts';
import type { PublicObject } from './contracts.ts';

export function createContentLocaleResolver(
  options: Pick<ContentOptions, 'mapping' | 'limits' | 'registry'>,
) {
  const runtime = { ...options, store: createContentStore(options) };
  return async function resolveLocaleSource(source: string, tx: SqlExecutor) {
    if (source !== 'languages') fail('invalid_input');
    return (await readLanguages(runtime, tx)).source;
  };
}
export function createContentLocaleValidator(
  options: Pick<ContentOptions, 'mapping' | 'limits' | 'registry'>,
  contract: MessageContract,
) {
  const runtime = { ...options, store: createContentStore(options) };
  return async function validateAfterMutation(
    tx: SqlExecutor,
    input: { collection: string; operationId: string },
  ) {
    if (input.collection !== 'languages') return;
    try {
      const languages = await readLanguages(runtime, tx);
      for (const locale of languages.source.enabled) {
        const rows = await readRows(runtime, tx, {
          collection: 'message-bundles',
          locale: runtime.registry.get('message-bundles').locales.default,
          where: {
            and: [
              { field: 'locale', operator: 'eq', value: locale },
              { field: 'contractVersion', operator: 'eq', value: contract.version },
            ],
          },
        });
        if (rows.total > runtime.limits.maxPageSize) fail('capacity_exceeded');
        const messages: PublicObject = {};
        for (const row of rows.rows) {
          const namespace = text(row.data['namespace']);
          if (!namespace || Object.hasOwn(messages, namespace)) fail('invalid_input');
          messages[namespace] = row.data['messages'] ?? null;
        }
        if (!contract.validate(messages)) fail('invalid_input');
      }
    } catch (error) {
      if (error instanceof CmsError)
        fail('invalid_input', {
          fieldErrors: [
            {
              field: 'default',
              message:
                'Enabled languages require one default, unique canonical codes and complete valid software messages.',
            },
          ],
        });
      throw error;
    }
  };
}
