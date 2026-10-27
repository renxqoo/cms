import type { FieldDefinition } from '../definition.ts';

export function conditionalContractFields(
  fields: readonly FieldDefinition[],
  inherited = false,
): FieldDefinition[] {
  return fields.map((field) => {
    const conditional = inherited || field.admin?.condition !== undefined;
    return {
      ...field,
      ...(conditional ? { required: false } : {}),
      ...(field.fields ? { fields: conditionalContractFields(field.fields, conditional) } : {}),
      ...(field.blocks
        ? {
            blocks: field.blocks.map((block) => ({
              ...block,
              fields: conditionalContractFields(block.fields, conditional),
            })),
          }
        : {}),
      ...(field.tabs
        ? {
            tabs: field.tabs.map((tab) => ({
              ...tab,
              fields: conditionalContractFields(tab.fields, conditional),
            })),
          }
        : {}),
    };
  });
}
