import type { PhysicalColumn, PhysicalTable } from '@new-cms/database/schema-plan';
import { fail } from '@new-cms/cms/platform/contracts';
import type { CompiledCollection, IndexMapping } from '../../model.ts';
import { physicalName } from './names.ts';
export function compileIndexes(collection: CompiledCollection): IndexMapping[] {
  return (collection.definition.indexes ?? []).map((index) => {
    const fields = index.fields.map((path) => {
      const field = collection.flat.find((candidate) => candidate.path === path);
      if (!field) fail('invalid_input');
      return field;
    });
    return {
      id: index.id,
      table: physicalName(
        'ci',
        `${collection.definition.id}:${index.id}:${fields.map((field) => field.table).join(':')}`,
      ),
      fields,
    };
  });
}
export function indexTables(collection: CompiledCollection): PhysicalTable[] {
  return collection.indexes.map((index) => {
    const columns: PhysicalColumn[] = [
      { name: 'revision_id', type: 'uuid' },
      { name: 'document_id', type: 'uuid' },
      { name: 'locale', type: 'text' },
    ];
    for (const [position, field] of index.fields.entries()) {
      columns.push(
        { name: `k${position}`, type: field.columnType, nullable: true },
        { name: `p${position}`, type: 'boolean' },
        { name: `b${position}`, type: 'boolean' },
      );
      if (field.columnType === 'uuid')
        columns.push({ name: `c${position}`, type: 'text', nullable: true });
    }
    return {
      name: index.table,
      columns,
      primaryKey: ['revision_id', 'locale'],
      indexes: [
        {
          name: physicalName('ix', index.table),
          columns: [
            'locale',
            ...index.fields.map((_field, position) => `k${position}`),
            'revision_id',
          ],
        },
      ],
      foreignKeys: [
        {
          name: physicalName('fk', index.table),
          columns: ['revision_id', 'document_id'],
          targetTable: 'content_revisions',
          targetColumns: ['id', 'document_id'],
          onDelete: 'cascade',
        },
      ],
    };
  });
}
