import type { FieldDefinition } from '../definition.ts';

export function adminAreas(field: FieldDefinition) {
  const configured = field.admin?.disabled;
  const all = configured === true;
  const disabled = typeof configured === 'object' ? configured : {};
  return {
    field: all || disabled.field === true,
    column: all || disabled.column === true,
    filter: all || disabled.filter === true,
    groupBy: all || (disabled.groupBy ?? field.type === 'ui'),
    bulkEdit: all || (disabled.bulkEdit ?? field.type === 'ui'),
  };
}
