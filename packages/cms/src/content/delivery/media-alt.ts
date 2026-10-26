import { fail } from '@new-cms/cms/platform/contracts';
import type { AssetsParticipants } from '@new-cms/cms/assets/composition';
import type { DeliverySession } from './types.ts';
import { readRows, record, text } from './source.ts';
import { readProjection } from './read-shapes.ts';

type Binding = Awaited<ReturnType<AssetsParticipants['listRevisionBindings']>>[number];
export async function readMediaAlts(
  session: DeliverySession,
  bindings: readonly Binding[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const targets = new Map<string, Set<string>>();
  for (const binding of bindings) {
    const ids = targets.get(binding.mediaCollectionKey) ?? new Set<string>();
    ids.add(binding.mediaDocumentId);
    targets.set(binding.mediaCollectionKey, ids);
  }
  if (
    [...targets.values()].reduce((total, ids) => total + ids.size, 0) >
    session.runtime.limits.maxExpandNodes
  )
    fail('capacity_exceeded');
  for (const [collection, ids] of targets) {
    const definition = await session.runtime.resolveCollection(session.tx, collection);
    const locale = definition.locales.supported.includes(session.locale)
      ? session.locale
      : definition.locales.default;
    const values = [...ids];
    for (let offset = 0; offset < values.length; offset += session.runtime.limits.maxPageSize) {
      const page = await readRows(session.runtime, session.tx, {
        collection,
        projection: await readProjection(session, collection, ['alt']),
        locale,
        where: {
          field: 'id',
          operator: 'in',
          value: values.slice(offset, offset + session.runtime.limits.maxPageSize),
        },
      });
      for (const row of page.rows)
        result.set(`${collection}:${row.document.id}`, text(row.data['alt']));
    }
  }
  return result;
}
export function sourceMediaAlt(input: { data: unknown; path: string; fallback: string }): string {
  const source = record(input.data);
  const match = /^showcase\.([^.]+)\.media$/u.exec(input.path);
  if (!match || !Array.isArray(source['showcase'])) return input.fallback;
  const item: unknown = source['showcase'].find(
    (value: unknown) => record(value)['id'] === match[1],
  );
  return text(record(item)['alt']) || input.fallback;
}
