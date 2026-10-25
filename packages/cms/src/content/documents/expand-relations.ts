import { documentJson, expansionCost } from './expansion-cost.ts';
import type { ExpansionBudget } from './expansion-cost.ts';
export type { ExpansionBudget } from './expansion-cost.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { collectReferences } from '../fields/collect-references.ts';
import { projectData } from '../fields/policies.ts';
import { dataFieldInstances, fieldPaths } from '../fields/structure.ts';
import { policyContext, queryDefaults, permittedQueryFields } from '../runtime.ts';
import { denied, relationScopes, targetState } from './relation-scopes.ts';
import { decorateDocuments } from './project-assets.ts';
import { replaceAtPath } from './data-path.ts';
import type { DocumentView, StoredDocument } from '../model.ts';
import type { ContentRuntime, ContentState, ContentDocumentView } from '../types.ts';
import type { ReferenceValue, FieldDefinition } from '../definition.ts';

export function storedView(
  state: ContentState,
  row: StoredDocument,
  select?: readonly string[],
): ContentDocumentView {
  const { document } = row;
  return {
    id: document.id,
    collection: state.collection.key,
    revision: document.revision,
    versionId: row.version.id,
    publishedVersionId: document.publishedVersionId,
    trashedAt: document.trashedAt,
    folderId: document.folderId,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    data: projectData({
      collection: state.collection,
      data: row.data,
      context: policyContext(state, row.data),
      ...(select ? { select } : {}),
    }),
  };
}

function consume(runtime: ContentRuntime, budget: ExpansionBudget, count: number): void {
  budget.nodes += count;
  if (budget.nodes > runtime.limits.maxExpandNodes) fail('capacity_exceeded');
}

async function targetViews(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    references: readonly ReferenceValue[];
    depth: number;
    budget: ExpansionBudget;
  },
): Promise<Map<string, DocumentView>> {
  const result = new Map<string, DocumentView>();
  const groups = new Map<string, ReferenceValue[]>();
  for (const reference of input.references) {
    const group = groups.get(reference.collection) ?? [];
    group.push(reference);
    groups.set(reference.collection, group);
  }
  for (const [collection, references] of groups) {
    try {
      const target = await targetState(state, { runtime: input.runtime, collection });
      const ids = [...new Set(references.map((reference) => reference.id))];
      const views = await loadTargetGroup(target, { ...input, ids });
      for (const view of views) result.set(`${collection}:${view.id}`, view);
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
    });
    views.push(...page.rows.map((row) => storedView(state, row)));
    for (const row of page.rows) schemaVersions.set(row.version.id, row.version.schemaVersion);
  }
  await decorateDocuments(state, { runtime: input.runtime, views, schemaVersions });
  await expandRelations(state, {
    runtime: input.runtime,
    views,
    depth: input.depth - 1,
    budget: input.budget,
  });
  return views;
}

async function queryJoin(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    source: ContentState;
    views: DocumentView[];
    field: string;
    budget: ExpansionBudget;
  },
): Promise<StoredDocument[]> {
  const rows: StoredDocument[] = [];
  let page = 1;
  let total = 0;
  do {
    const result = await input.runtime.store.queryDocuments(state.tx, {
      collection: state.collection.key,
      query: {
        ...queryDefaults(state, input.runtime),
        page,
        pageSize: input.runtime.limits.maxPageSize,
        sort: [],
        where: {
          field: input.field,
          operator: 'in',
          value: input.views.map((view) => ({
            collection: input.source.collection.key,
            id: view.id,
          })),
        },
        ...(state.predicate ? { policy: state.predicate } : {}),
      },
      queryableFields: permittedQueryFields(state),
      ...(await relationScopes(state, input.runtime)),
      limits: input.runtime.limits,
    });
    consume(input.runtime, input.budget, result.rows.length);
    rows.push(...result.rows);
    ({ total } = result);
    page += 1;
  } while (rows.length < total);
  return rows;
}

async function expandJoinGroup(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    views: DocumentView[];
    paths: ReadonlyMap<string, readonly string[]>;
    collection: string;
    field: string;
    depth: number;
    budget: ExpansionBudget;
  },
): Promise<void> {
  const target = await targetState(state, { runtime: input.runtime, collection: input.collection });
  const rows = await queryJoin(target, {
    runtime: input.runtime,
    source: state,
    views: input.views,
    field: input.field,
    budget: input.budget,
  });
  const views = rows.map((row) => storedView(target, row));
  const links = rows.map((row) =>
    collectReferences({
      limits: input.runtime.limits,
      collection: target.collection,
      data: row.data,
      locale: target.locale,
    }).filter(
      (reference) => reference.path === input.field || reference.path.startsWith(`${input.field}.`),
    ),
  );
  await decorateDocuments(target, {
    runtime: input.runtime,
    views,
    schemaVersions: new Map(rows.map((row) => [row.version.id, row.version.schemaVersion])),
  });
  if (input.depth > 0) await expandRelations(target, { ...input, views, depth: input.depth - 1 });
  distributeJoinViews(state, { ...input, parents: input.views, target, views, links });
}

function distributeJoinViews(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    views: DocumentView[];
    target: ContentState;
    links: readonly ReferenceValue[][];
    paths: ReadonlyMap<string, readonly string[]>;
    depth: number;
    budget: ExpansionBudget;
    parents: DocumentView[];
  },
): void {
  const occurrences = new Map<string, number>();
  for (const parent of input.parents) {
    const related = input.views.filter((_view, index) =>
      input.links[index]?.some(
        (reference) => reference.collection === state.collection.key && reference.id === parent.id,
      ),
    );
    const paths = input.paths.get(parent.id) ?? [];
    for (const view of related)
      occurrences.set(view.id, (occurrences.get(view.id) ?? 0) + paths.length);
    const data = related.map((view) =>
      input.depth > 0
        ? documentJson(view, input.budget)
        : { collection: input.target.collection.key, id: view.id },
    );
    for (const path of paths) replaceAtPath(parent.data, path, data);
  }
  for (const view of input.views) {
    const extra = Math.max(0, (occurrences.get(view.id) ?? 0) - 1);
    consume(input.runtime, input.budget, extra * expansionCost(view, input.budget));
  }
}

interface JoinInstance {
  view: DocumentView;
  path: string;
}
interface JoinGroup {
  field: FieldDefinition;
  path: string;
  instances: JoinInstance[];
}

function joinGroups(state: ContentState, views: readonly DocumentView[]): JoinGroup[] {
  const groups = new Map<string, JoinGroup>();
  const paths = new Map(
    fieldPaths(state.collection.fields).map(({ field, path }) => [field.id, path]),
  );
  for (const view of views) {
    for (const { field, path } of dataFieldInstances({
      fields: state.collection.fields,
      data: view.data,
    })) {
      if (field.type !== 'join' || !field.join) continue;
      const group = groups.get(field.id) ?? {
        field,
        path: paths.get(field.id) ?? path,
        instances: [],
      };
      group.instances.push({ view, path });
      groups.set(field.id, group);
    }
  }
  return [...groups.values()];
}

async function expandJoins(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    views: DocumentView[];
    depth: number;
    budget: ExpansionBudget;
    select?: readonly string[];
  },
): Promise<void> {
  for (const group of joinGroups(state, input.views)) {
    const { field, path } = group;
    if (!field.join) continue;
    if (
      input.select &&
      !input.select.some(
        (selected) =>
          selected === path || path.startsWith(`${selected}.`) || selected.startsWith(`${path}.`),
      )
    )
      continue;
    const instances = group.instances.filter(
      ({ view }) => !field.access?.read || field.access.read.run(policyContext(state, view.data)),
    );
    const views = [
      ...new Map(instances.map((instance) => [instance.view.id, instance.view])).values(),
    ];
    if (views.length === 0) continue;
    const paths = new Map(
      views.map((view) => [
        view.id,
        instances
          .filter((instance) => instance.view.id === view.id)
          .map((instance) => instance.path),
      ]),
    );
    try {
      await expandJoinGroup(state, {
        ...input,
        views,
        paths,
        collection: field.join.collection,
        field: field.join.field,
      });
    } catch (error) {
      if (!denied(error)) throw error;
      for (const instance of instances) replaceAtPath(instance.view.data, instance.path, []);
    }
  }
}

export async function expandRelations(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    views: DocumentView[];
    depth: number;
    budget: ExpansionBudget;
    select?: readonly string[];
  },
): Promise<void> {
  if (input.depth < 0 || input.depth > input.runtime.limits.maxExpandDepth) fail('invalid_input');
  if (input.depth === 0) return expandJoins(state, input);
  const references = input.views.flatMap((view) =>
    collectReferences({
      limits: input.runtime.limits,
      collection: state.collection,
      data: view.data,
      locale: state.locale,
    }),
  );
  consume(input.runtime, input.budget, references.length);
  const targets = await targetViews(state, { ...input, references });
  chargeRepeatedRelations(input, references, targets);
  for (const view of input.views) {
    for (const reference of collectReferences({
      limits: input.runtime.limits,
      collection: state.collection,
      data: view.data,
      locale: state.locale,
    })) {
      const related = targets.get(`${reference.collection}:${reference.id}`);
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
  references: readonly ReferenceValue[],
  targets: ReadonlyMap<string, DocumentView>,
): void {
  const counts = new Map<string, number>();
  for (const reference of references) {
    const key = `${reference.collection}:${reference.id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, view] of targets) {
    const extra = (counts.get(key) ?? 0) - 1;
    if (extra > 0)
      consume(input.runtime, input.budget, extra * (expansionCost(view, input.budget) - 1));
  }
}
