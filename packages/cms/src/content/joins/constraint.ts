import type { JoinDefinition } from './definition.ts';
import type { Where } from '../definition.ts';

export function joinConstraint(collection: string, id: string, join: JoinDefinition): Where {
  const inverse: Where = { field: join.field, operator: 'eq', value: { collection, id } };
  return join.where ? { and: [inverse, join.where] } : inverse;
}
