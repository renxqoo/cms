import type { JoinQueryOptions } from './definition.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { readJoinedRows } from './read-rows.ts';
import { storedViews } from '../documents/stored-views.ts';
import { decorateDocuments } from '../documents/project-assets.ts';
import { documentJson, expansionCost } from '../documents/expansion-cost.ts';
import type { ExpansionBudget } from '../documents/expansion-cost.ts';
import { populationDepth } from '../documents/population-depth.ts';
import type { ContentRuntime, ContentState, ContentDocumentView } from '../types.ts';
import type { DocumentData, FieldDefinition, SortField } from '../definition.ts';
import type { StoredDocument } from '../model.ts';

export interface JoinPage {
  rows: DocumentData[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  total?: number;
  sort: readonly SortField[];
  orderVersion?: string;
}
export interface JoinedPageInput {
  runtime: ContentRuntime;
  field: FieldDefinition;
  ids: readonly string[];
  query?: JoinQueryOptions;
  depth: number;
  currentDepth?: number;
  budget: ExpansionBudget;
  occurrences?: ReadonlyMap<string, number>;
  expand: (
    state: ContentState,
    input: {
      runtime: ContentRuntime;
      views: ContentDocumentView[];
      depth: number;
      currentDepth?: number;
      budget: ExpansionBudget;
      select?: readonly string[];
    },
  ) => Promise<void>;
}

export function joinPageJson(page: JoinPage): DocumentData {
  return {
    rows: page.rows,
    page: page.page,
    pageSize: page.pageSize,
    hasNextPage: page.hasNextPage,
    sort: page.sort.map(({ field, order }) => ({ field, order })),
    ...(page.total === undefined ? {} : { total: page.total }),
    ...(page.orderVersion ? { orderVersion: page.orderVersion } : {}),
  };
}

function consume(input: JoinedPageInput, count: number) {
  input.budget.nodes += count;
  if (input.budget.nodes > input.runtime.limits.maxExpandNodes) fail('capacity_exceeded');
}

async function targetViews(
  input: JoinedPageInput,
  result: Awaited<ReturnType<typeof readJoinedRows>>,
  depth: number,
) {
  const views = new Map<string, ContentDocumentView>();
  const grouped = new Map<string, Map<string, StoredDocument>>();
  for (const page of result.pages.values())
    for (const row of page.rows) {
      const rows = grouped.get(row.document.collectionId) ?? new Map<string, StoredDocument>();
      rows.set(row.document.id, row);
      grouped.set(row.document.collectionId, rows);
    }
  for (const [collection, rows] of grouped) {
    const state = result.states.get(collection);
    if (!state) fail('temporarily_unavailable');
    const target = await storedViews(state, [...rows.values()], {
      runtime: input.runtime,
      select: state.collection.defaultPopulate,
    });
    await decorateDocuments(state, {
      runtime: input.runtime,
      views: target,
      schemaVersions: new Map(
        [...rows.values()].map((row) => [row.version.id, row.version.schemaVersion]),
      ),
    });
    await input.expand(state, {
      runtime: input.runtime,
      views: target,
      depth: depth - 1,
      currentDepth: (input.currentDepth ?? 1) + 1,
      budget: input.budget,
      ...(state.collection.defaultPopulate ? { select: state.collection.defaultPopulate } : {}),
    });
    for (const view of target) views.set(view.id, view);
  }
  return views;
}

export async function joinedPages(
  state: ContentState,
  input: JoinedPageInput,
): Promise<ReadonlyMap<string, JoinPage>> {
  const depth = populationDepth(input, input.field.maxDepth);
  const result = await readJoinedRows(state, {
    ...input,
    identitiesOnly: depth === 0,
    maxRows: Math.max(0, input.runtime.limits.maxExpandNodes - input.budget.nodes),
  });
  const occurrences = new Map<string, number>();
  for (const [source, page] of result.pages)
    for (const row of page.rows) {
      const count = input.occurrences?.get(source) ?? 1;
      consume(input, count);
      occurrences.set(row.document.id, (occurrences.get(row.document.id) ?? 0) + count);
    }
  const views =
    depth > 0 ? await targetViews(input, result, depth) : new Map<string, ContentDocumentView>();
  const pages = new Map<string, JoinPage>();
  for (const [source, page] of result.pages) {
    const rows = page.rows.map((row) => {
      if (depth > 0) {
        const view = views.get(row.document.id);
        if (!view) fail('temporarily_unavailable');
        return documentJson(view, input.budget);
      }
      const reader = result.states.get(row.document.collectionId);
      if (!reader) fail('temporarily_unavailable');
      return { collection: reader.collection.key, id: row.document.id };
    });
    pages.set(source, {
      ...page,
      rows,
      sort: result.sort,
      ...(result.orderVersion ? { orderVersion: result.orderVersion } : {}),
    });
  }
  for (const view of views.values())
    consume(
      input,
      Math.max(0, (occurrences.get(view.id) ?? 1) - 1) * (expansionCost(view, input.budget) - 1),
    );
  return pages;
}
