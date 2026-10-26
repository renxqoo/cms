import type { PublicObject } from './contracts.ts';
import { publicObject } from './value.ts';
import { text } from './source.ts';

export function projectModelContent(value: unknown): PublicObject {
  const content = publicObject(value);
  return {
    ...content,
    ...(Array.isArray(content['faq'])
      ? {
          faq: content['faq'].map((entry) => {
            const row = publicObject(entry);
            return { ...row, sourceUrl: text(row['sourceUrl']) || null };
          }),
        }
      : {}),
    ...(Array.isArray(content['sources'])
      ? {
          sources: content['sources'].map((entry) => {
            const row = publicObject(entry);
            return {
              ...row,
              url: text(row['url']) || null,
              kind: text(row['kind']) || null,
              accessedAt: text(row['accessedAt']) || null,
            };
          }),
        }
      : {}),
  };
}
export function projectSpecifications(value: unknown): PublicObject {
  const specifications = publicObject(value);
  const groups = Object.fromEntries(
    Object.entries(specifications).filter(([, group]) => group !== null),
  );
  if (groups['text'] == null) return groups;
  const textGroup = publicObject(groups['text']);
  return {
    ...groups,
    text: {
      ...textGroup,
      licenseName: text(textGroup['licenseName']) || null,
      licenseUrl: text(textGroup['licenseUrl']) || null,
    },
  };
}
