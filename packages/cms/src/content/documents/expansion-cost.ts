import type { DocumentData, JsonValue } from '../definition.ts';
import type { DocumentView } from '../model.ts';

export interface ExpansionBudget {
  nodes: number;
  costs?: WeakMap<object, number>;
}

function valueCost(value: JsonValue, costs: WeakMap<object, number>): number {
  if (value === null || typeof value !== 'object') return 0;
  const known = costs.get(value);
  if (known !== undefined) return known;
  const values = Array.isArray(value) ? value : Object.values(value);
  return values.reduce<number>((total, child) => total + valueCost(child, costs), 0);
}

export function expansionCost(view: DocumentView, budget: ExpansionBudget): number {
  budget.costs ??= new WeakMap();
  return 1 + valueCost(view.data, budget.costs);
}

export function documentJson(view: DocumentView, budget: ExpansionBudget): DocumentData {
  const result = {
    ...(view.componentProps ? { componentProps: view.componentProps } : {}),
    ...(view.createdBy === undefined ? {} : { createdBy: view.createdBy }),
    ...(view.updatedBy === undefined ? {} : { updatedBy: view.updatedBy }),
    id: view.id,
    collection: view.collection,
    revision: view.revision,
    versionId: view.versionId,
    publishedVersionId: view.publishedVersionId,
    trashedAt: view.trashedAt,
    folderId: view.folderId,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
    data: view.data,
  };
  budget.costs ??= new WeakMap();
  budget.costs.set(result, expansionCost(view, budget));
  return result;
}
