import { attachJoinedComponentProps } from '../editor/document-component-props.ts';
import { populateJoins } from '../joins/populate.ts';
import { populationDepth } from './population-depth.ts';
import { documentJson, expansionCost } from './expansion-cost.ts';
import type { ExpansionBudget } from './expansion-cost.ts';
export type { ExpansionBudget } from './expansion-cost.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { collectReferences } from '../fields/collect-references.ts';
import { storedViews } from './stored-views.ts';
import { fieldPaths } from '../fields/structure.ts';
import { policyRelations, queryDefaults } from '../runtime.ts';
import { denied, targetState } from './relation-scopes.ts';
import { decorateDocuments } from './project-assets.ts';
import { replaceAtPath } from './data-path.ts';
import type { DocumentView } from '../model.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { ReferenceValue } from '../definition.ts';

function consume(runtime: ContentRuntime, budget: ExpansionBudget, count: number): void {
  budget.nodes += count;
  if (budget.nodes > runtime.limits.maxExpandNodes) fail('capacity_exceeded');
}

async function targetViews(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    references: readonly PopulationReference[];
    depth: number;
    currentDepth?: number;
    budget: ExpansionBudget;
  },
): Promise<Map<string, DocumentView>> {
  const result = new Map<string, DocumentView>();
  const groups = new Map<string, PopulationReference[]>();
  for (const reference of input.references) {
    const key = `${reference.collection}:${reference.depth}`;
    const group = groups.get(key) ?? [];
    group.push(reference);
    groups.set(key, group);
  }
  for (const references of groups.values()) {
    const [first] = references;
    if (!first) continue;
    const { collection, depth } = first;
    try {
      const target = await targetState(state, { runtime: input.runtime, collection });
      const ids = [...new Set(references.map((reference) => reference.id))];
      const views = await loadTargetGroup(target, { ...input, ids, depth });
      for (const view of views) result.set(`${collection}:${depth}:${view.id}`, view);
    } catch (error) {
      if (!denied(error)) throw error;
    }
  }
  return result;
}

async function loadTargetGroup(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    ids: readonly string[];
    depth: number;
    currentDepth?: number;
    budget: ExpansionBudget;
  },
): Promise<DocumentView[]> {
  const views: DocumentView[] = [];
  const schemaVersions = new Map<string, number>();
  for (let offset = 0; offset < input.ids.length; offset += input.runtime.limits.maxPageSize) {
    const ids = input.ids.slice(offset, offset + input.runtime.limits.maxPageSize);
    const page = await input.runtime.store.queryDocuments(state.tx, {
      collection: state.collection.key,
      query: {
        ...queryDefaults(state, input.runtime),
        pageSize: ids.length,
        where: { field: 'id', operator: 'in', value: [...ids] },
        ...(state.predicate ? { policy: state.predicate } : {}),
      },
      limits: input.runtime.limits,
      ...(await policyRelations(state, input.runtime)),
    });
    views.push(
      ...(await storedViews(state, page.rows, {
        runtime: input.runtime,
        select: state.collection.defaultPopulate,
      })),
    );
    for (const row of page.rows) schemaVersions.set(row.version.id, row.version.schemaVersion);
  }
  await decorateDocuments(state, { runtime: input.runtime, views, schemaVersions });
  await expandRelations(state, {
    runtime: input.runtime,
    views,
    depth: input.depth - 1,
    currentDepth: (input.currentDepth ?? 1) + 1,
    select: state.collection.defaultPopulate,
    budget: input.budget,
  });
  return views;
}

async function expandJoins(
  state: ContentState,
  input: Parameters<typeof expandRelations>[1],
): Promise<void> {
  await populateJoins(state, { ...input, expand: expandRelations });
  await attachJoinedComponentProps(state, { runtime: input.runtime, views: input.views });
}

export async function expandRelations(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    views: DocumentView[];
    depth: number;
    currentDepth?: number;
    budget: ExpansionBudget;
    select?: readonly string[] | undefined;
  },
): Promise<void> {
  if (input.depth < 0 || input.depth > input.runtime.limits.maxExpandDepth) fail('invalid_input');
  if (input.depth === 0) return expandJoins(state, input);
  const depths = new Map(
    fieldPaths(state.collection.fields).map(({ field }) => [
      field.id,
      populationDepth(input, field.maxDepth),
    ]),
  );
  const references = input.views.flatMap((view) =>
    populationReferences(state, { ...input, depths }, view),
  );
  consume(input.runtime, input.budget, references.length);
  const targets = await targetViews(state, { ...input, references });
  chargeRepeatedRelations(input, references, targets);
  for (const view of input.views) {
    for (const reference of populationReferences(state, { ...input, depths }, view)) {
      const related = targets.get(populationKey(reference));
      replaceAtPath(
        view.data,
        reference.path,
        related ? documentJson(related, input.budget) : null,
      );
    }
  }
  await expandJoins(state, input);
}

function chargeRepeatedRelations(
  input: { runtime: ContentRuntime; budget: ExpansionBudget },
  references: readonly PopulationReference[],
  targets: ReadonlyMap<string, DocumentView>,
): void {
  const counts = new Map<string, number>();
  for (const reference of references) {
    const key = populationKey(reference);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, view] of targets) {
    const extra = (counts.get(key) ?? 0) - 1;
    if (extra > 0)
      consume(input.runtime, input.budget, extra * (expansionCost(view, input.budget) - 1));
  }
}

interface PopulationReference extends ReferenceValue {
  depth: number;
}

function populationKey(reference: PopulationReference): string {
  return `${reference.collection}:${reference.depth}:${reference.id}`;
}

function populationReferences(
  state: ContentState,
  input: { runtime: ContentRuntime; depth: number; depths: ReadonlyMap<string, number> },
  view: DocumentView,
): PopulationReference[] {
  return collectReferences({
    limits: input.runtime.limits,
    collection: state.collection,
    data: view.data,
    locale: state.locale,
  })
    .map((reference) => ({
      ...reference,
      depth: input.depths.get(reference.fieldId) ?? input.depth,
    }))
    .filter((reference) => reference.depth > 0);
}
