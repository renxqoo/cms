import { attachAdminDocumentURLs } from '../editor/document-urls.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { storedViews } from '../documents/stored-views.ts';
import { decorateDocuments } from '../documents/project-assets.ts';
import { expandRelations } from '../documents/expand-relations.ts';
import { expansionCost } from '../documents/expansion-cost.ts';
import { projectAllLocales } from '../documents/all-locales.ts';
import { joinReadContext } from '../joins/context.ts';
import type { ContentState, ContentRuntime } from '../types.ts';
import type { QueryInput, StoredJoinPage, StoredDocument } from '../model.ts';

function groupOccurrences(pages: ReadonlyMap<string, StoredJoinPage>, maxNodes: number) {
  const unique = new Map<string, StoredDocument>();
  const occurrences = new Map<string, number>();
  for (const page of pages.values())
    for (const row of page.rows) {
      unique.set(row.document.id, row);
      occurrences.set(row.document.id, (occurrences.get(row.document.id) ?? 0) + 1);
    }
  const count = [...occurrences.values()].reduce((total, value) => total + value, 0);
  if (count > maxNodes) fail('capacity_exceeded');
  return { unique, occurrences, count };
}

export async function groupDocumentViews(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    query: QueryInput;
    pages: ReadonlyMap<string, StoredJoinPage>;
    allLocales: boolean;
  },
) {
  const { unique, occurrences, count } = groupOccurrences(
    input.pages,
    input.runtime.limits.maxExpandNodes,
  );
  const reader = joinReadContext(state, input.query.joins);
  const budget = (reader.expansionBudget ??= { nodes: 0 });
  budget.nodes += count;
  const views = await storedViews(reader, [...unique.values()], {
    runtime: input.runtime,
    ...(input.query.select ? { select: input.query.select } : {}),
  });
  await decorateDocuments(reader, {
    runtime: input.runtime,
    views,
    schemaVersions: new Map(
      [...unique.values()].map((row) => [row.version.id, row.version.schemaVersion]),
    ),
    fallback: input.query.fallback,
  });
  await expandRelations(reader, {
    runtime: input.runtime,
    views,
    depth: input.query.depth ?? 0,
    budget,
    ...(input.query.select ? { select: input.query.select } : {}),
  });
  if (input.allLocales)
    await projectAllLocales(reader, {
      runtime: input.runtime,
      views,
      depth: input.query.depth ?? 0,
      ...(input.query.select ? { select: input.query.select } : {}),
    });
  if (input.query.context === 'admin')
    await attachAdminDocumentURLs(reader, { runtime: input.runtime, views });
  for (const view of views)
    budget.nodes +=
      Math.max(0, (occurrences.get(view.id) ?? 1) - 1) * (expansionCost(view, budget) - 1);
  if (budget.nodes > input.runtime.limits.maxExpandNodes) fail('capacity_exceeded');
  return new Map(views.map((view) => [view.id, view]));
}
