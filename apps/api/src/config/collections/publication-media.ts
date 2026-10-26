import type { DocumentData, JsonValue } from '@new-cms/cms/content/generate';
import { home } from './home.ts';
import { site } from './site.ts';
import { documents } from './documents.ts';
import { validHomeShape, validShape } from './publication-shape.ts';
import { validDocumentBody } from './publication-document.ts';
function object(value: JsonValue | undefined): DocumentData {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function image(mime: string | undefined) {
  return (
    mime !== undefined &&
    ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(mime)
  );
}
function identity(value: JsonValue | undefined) {
  return typeof value === 'string' ? value : '';
}
function documentImages(data: DocumentData, media: ReadonlyMap<string, string>) {
  const { sections } = object(data['body']);
  if (!Array.isArray(sections)) return true;
  return sections.every((section) => {
    const item = object(section);
    const { blocks } = item;
    return (
      !Array.isArray(blocks) ||
      blocks.every((block) => {
        const value = object(block);
        return (
          value['blockType'] !== 'image' ||
          image(
            media.get(
              `body.sections.${identity(item['id'])}.blocks.${identity(value['id'])}.asset`,
            ),
          )
        );
      })
    );
  });
}
export function validatePublicMedia(input: {
  collection: string;
  data: DocumentData;
  media: readonly { sourcePath: string; mimeType: string }[];
}): boolean {
  const definition = [home, site, documents].find((item) => item.key === input.collection);
  if (definition && !validShape(definition.fields, input.data, input.collection)) return false;
  if (input.collection === 'home' && !validHomeShape(input.data)) return false;
  if (input.collection === 'documents' && !validDocumentBody(input.data)) return false;
  if (!['models', 'documents', 'home', 'site', 'developers'].includes(input.collection))
    return true;
  const media = new Map(input.media.map((item) => [item.sourcePath, item.mimeType]));
  for (const [path, mime] of media) {
    if (input.collection === 'models' && /^showcase\.[^.]+\.media$/u.test(path)) continue;
    if (!image(mime)) return false;
  }
  if (input.collection === 'models') return validShowcase(input.data, media);
  if (input.collection !== 'documents') return true;
  return documentImages(input.data, media);
}
function validShowcase(data: DocumentData, media: ReadonlyMap<string, string>) {
  const { showcase } = data;
  if (!Array.isArray(showcase)) return true;
  const keys = showcase.map((entry) => object(entry)['key']);
  if (new Set(keys).size !== keys.length) return false;
  return showcase.every((entry) => {
    const item = object(entry);
    const mime = media.get(`showcase.${identity(item['id'])}.media`);
    if (item['mediaType'] === 'image') return image(mime);
    if (item['mediaType'] === 'audio') return mime === 'audio/mpeg' || mime === 'audio/wav';
    if (item['mediaType'] === 'video') return mime === 'video/mp4';
    if (item['mediaType'] === 'text')
      return (
        mime === undefined &&
        typeof item['outputText'] === 'string' &&
        item['outputText'].trim().length > 0
      );
    return mime === undefined && item['mediaType'] === 'none';
  });
}
