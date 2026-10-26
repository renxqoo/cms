import type { CollectionDefinition, FieldDefinition } from '../definition.ts';
import { dataFields } from '../fields/structure.ts';
import { definitionFingerprint } from './create-registry.ts';
function fieldsFingerprint(fields: readonly FieldDefinition[]): unknown[] {
  return dataFields(fields).map((field) => {
    const {
      label: _label,
      index: _index,
      access: _access,
      defaultValue: _default,
      fields: children,
      blocks,
      validate,
      ...definition
    } = field;
    return {
      ...definition,
      ...(validate ? { validateVersion: validate.version } : {}),
      ...(children ? { fields: fieldsFingerprint(children) } : {}),
      ...(blocks
        ? {
            blocks: blocks.map((block) => ({
              id: block.id,
              key: block.key,
              fields: fieldsFingerprint(block.fields),
            })),
          }
        : {}),
    };
  });
}
export function dataFingerprint(definition: CollectionDefinition): string {
  return definitionFingerprint({
    id: definition.id,
    schemaVersion: definition.schemaVersion,
    mode: definition.mode,
    upload: definition.upload !== undefined,
    locales: definition.localeSource ? { source: definition.localeSource } : definition.locales,
    fields: fieldsFingerprint(definition.fields),
    indexes: definition.indexes ?? [],
    search: definition.search ?? [],
    nodes: definition.richTextNodes?.map((node) => ({
      type: node.type,
      version: node.version,
      validator: node.validate.version,
      references: node.references?.version,
    })),
    migrations: definition.migrations?.map((migration) => ({
      from: migration.from,
      version: migration.version,
      localeMap: migration.localeMap,
    })),
  });
}
