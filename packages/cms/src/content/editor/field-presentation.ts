import { resolveLabel } from '../collections/labels.ts';
import type { FieldDefinition } from '../definition.ts';

export function fieldPresentation(field: FieldDefinition, locale: string) {
  return {
    ...(field.disableDuplicate === undefined ? {} : { disableDuplicate: field.disableDuplicate }),
    ...(field.admin?.readOnly === undefined ? {} : { readOnly: field.admin.readOnly }),
    ...(field.admin?.hidden === undefined ? {} : { hidden: field.admin.hidden }),
    ...(field.admin?.description === undefined
      ? {}
      : { description: resolveLabel(field.admin.description, locale, '') }),
    ...(field.admin?.placeholder === undefined
      ? {}
      : { placeholder: resolveLabel(field.admin.placeholder, locale, '') }),
    ...(field.admin?.position === undefined ? {} : { position: field.admin.position }),
    ...(field.admin?.width === undefined ? {} : { width: field.admin.width }),
  };
}
