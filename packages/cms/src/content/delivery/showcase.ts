import type { PublicMedia, PublicObject } from './contracts.ts';
import { record, text } from './source.ts';
import { publicObject } from './value.ts';

export function projectShowcase(
  value: unknown,
  media: Readonly<Record<string, PublicMedia>>,
): PublicObject[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const source = record(entry);
    const id = text(source['id']);
    const provenance = record(source['provenance']);
    return {
      id,
      key: text(source['key']),
      title: text(source['title']),
      description: text(source['description']),
      prompt: text(source['prompt']),
      mediaType: text(source['mediaType']),
      media: media[`showcase.${id}.media`]?.bindingId ?? null,
      poster: media[`showcase.${id}.poster`]?.bindingId ?? null,
      alt: text(source['alt']),
      outputText: source['outputText'] == null ? null : text(source['outputText']),
      settings: publicObject(source['settings']),
      provenance: {
        ...publicObject(provenance),
        sourceUrl: text(provenance['sourceUrl']) || null,
        createdAt: text(provenance['createdAt']) || null,
      },
    };
  });
}
