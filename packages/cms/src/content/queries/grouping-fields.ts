import type { FieldDefinition } from '../definition.ts';

export function groupableField(field: FieldDefinition): boolean {
  return (
    [
      'text',
      'textarea',
      'number',
      'select',
      'relationship',
      'date',
      'boolean',
      'radio',
      'email',
      'upload',
    ].includes(field.type) &&
    (!field.virtual || typeof field.virtual === 'string')
  );
}
