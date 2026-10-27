import { z } from 'zod';
import { groupBySchema } from '../../contracts/document-groups';
import type { GroupBy } from '../../contracts/document-groups';
import type { Collection } from '../../contracts/content';

const groupPagesSchema = z.record(
  z.uuid(),
  z.strictObject({
    page: z.number().int().positive().max(2_147_483_647).optional(),
    pageSize: z.number().int().positive().optional(),
  }),
);
export type GroupPages = z.infer<typeof groupPagesSchema>;

function parsed(value: string | null): unknown {
  if (value === null) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

export function readGroupingQuery(
  params: URLSearchParams,
  collection: Collection | null,
  defaultPageSize: number,
) {
  const result = groupBySchema.safeParse(parsed(params.get('groupBy')));
  const allowed =
    result.success &&
    collection?.fields.some(
      (field) => field.path === result.data.field && field.groupable && !field.disabled?.groupBy,
    );
  const groupBy: GroupBy | null = allowed && result.success ? result.data : null;
  const paging = groupPagesSchema.safeParse(parsed(params.get('queryByGroup')));
  const size = Number(params.get('groupPageSize'));
  const groupPageSize = Number.isSafeInteger(size) && size > 0 ? size : defaultPageSize;
  return {
    groupBy,
    queryByGroup: groupBy && paging.success ? paging.data : undefined,
    groupPageSize: groupBy ? groupPageSize : undefined,
  };
}

export function groupedQueryHrefValue(key: string, value: unknown): string | undefined {
  if (key !== 'groupBy' && key !== 'queryByGroup') return undefined;
  if (!value || typeof value !== 'object') return undefined;
  return JSON.stringify(value);
}
