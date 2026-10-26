import { fail } from '@new-cms/cms/platform/contracts';
import type { StoredDocument } from '../model.ts';
import type { PublicModel, PublicRecord, PublicDocument } from './contracts.ts';
import type { DeliverySession } from './types.ts';
import { record, strings, text } from './source.ts';
import { publicObject, pick, modelCategory } from './value.ts';
import { selectedLanguages, translations, projectSeo } from './navigation.ts';
import { decorateRows } from './decoration.ts';
import type { Decorated } from './decoration.ts';
import { projectDocumentBody } from './document-body.ts';
import { projectShowcase } from './showcase.ts';
import { projectSiteData } from './presentation.ts';
import { projectModelContent, projectSpecifications } from './model-content.ts';
export { publicObject } from './value.ts';
function referenceId(value: unknown): string | null {
  const item = record(value);
  return typeof item['id'] === 'string' ? item['id'] : null;
}
function modelDetail(data: StoredDocument['data'], detail: boolean, decorated: Decorated) {
  if (!detail)
    return {
      apiBindings: [],
      defaultBindingKey: null,
      parameterReference: null,
      content: {},
      showcase: [],
    };
  return {
    apiBindings: Array.isArray(data['apiBindings']) ? data['apiBindings'].map(publicObject) : [],
    defaultBindingKey: text(data['defaultBindingKey']) || null,
    parameterReference:
      data['parameterReference'] == null ? null : publicObject(data['parameterReference']),
    content: projectModelContent(data['content']),
    showcase: projectShowcase(data['showcase'], decorated.media),
  };
}
function modelIdentity(
  row: StoredDocument,
): Pick<
  PublicModel,
  | 'id'
  | 'versionId'
  | 'modelId'
  | 'slug'
  | 'title'
  | 'summary'
  | 'primaryCategory'
  | 'version'
  | 'versionKind'
  | 'releaseDate'
  | 'officialUrl'
> {
  const { data } = row;
  return {
    id: row.document.id,
    versionId: row.version.id,
    modelId: text(data['modelId']),
    slug: text(data['slug']),
    title: text(data['title']),
    summary: text(data['summary']),
    primaryCategory: modelCategory(data['primaryCategory']),
    version: text(data['version']) || null,
    versionKind:
      data['versionKind'] === 'rolling' || data['versionKind'] === 'snapshot'
        ? data['versionKind']
        : null,
    releaseDate: text(data['releaseDate']) || null,
    officialUrl: text(data['officialUrl']) || null,
  };
}
export function projectModel(
  session: DeliverySession,
  input: { row: StoredDocument; decorated: Decorated; detail: boolean },
): PublicModel {
  const { row, decorated, detail } = input;
  const { data } = row;
  const technical = record(data['technicalCapabilities']);
  const presentation = record(data['presentation']);
  const callable = Array.isArray(data['apiBindings']) && data['apiBindings'].length > 0;
  return {
    ...modelIdentity(row),
    contentLocales: selectedLanguages(session, row),
    developer: decorated.developers.get(referenceId(data['developer']) ?? '') ?? null,
    family: text(data['family']) || null,
    technicalCapabilities: {
      inputs: strings(technical['inputs']),
      outputs: strings(technical['outputs']),
      tasks: strings(technical['tasks']),
      features: strings(technical['features']),
    },
    specifications: projectSpecifications(data['specifications']),
    ...modelDetail(data, detail, decorated),
    platformAccess: callable ? 'supported' : 'unsupported',
    presentation: {
      featured: presentation['featured'] === true,
      sortOrder: typeof presentation['sortOrder'] === 'number' ? presentation['sortOrder'] : 0,
    },
    logo: decorated.media['logo'] ?? null,
    media: decorated.media,
    relations: decorated.relations,
    seo: projectSeo(session, { collection: 'models', row, media: decorated.media }),
    translations: session.preview ? [] : translations(session, 'models', row),
    updatedAt: row.version.createdAt,
  };
}
export async function projectModels(
  session: DeliverySession,
  rows: readonly StoredDocument[],
  detail = false,
): Promise<PublicModel[]> {
  const decorated = await decorateRows(session, 'models', rows);
  return rows.map((row) => {
    const context = decorated.get(row.version.id);
    if (!context) fail('internal_error');
    return projectModel(session, { row, decorated: context, detail });
  });
}
export async function projectRecord(
  session: DeliverySession,
  collection: 'site' | 'home',
  row: StoredDocument,
): Promise<PublicRecord> {
  const decorated = (await decorateRows(session, collection, [row])).get(row.version.id);
  if (!decorated) fail('internal_error');
  const keys =
    collection === 'site'
      ? [
          'brand',
          'title',
          'description',
          'apiBaseUrl',
          'defaultDocumentSlug',
          'header',
          'footer',
          'ui',
        ]
      : ['hero', 'workspace', 'featuredModels', 'useCases', 'faq', 'closing'];
  return {
    id: row.document.id,
    versionId: row.version.id,
    publishedAt: row.version.createdAt,
    updatedAt: row.version.createdAt,
    data: collection === 'site' ? projectSiteData(pick(row.data, keys)) : pick(row.data, keys),
    media: decorated.media,
    relations: decorated.relations,
    seo: projectSeo(session, { collection, row, media: decorated.media }),
    translations: translations(session, collection, row),
  };
}
export async function projectDocument(
  session: DeliverySession,
  row: StoredDocument,
): Promise<PublicDocument> {
  const decorated = (await decorateRows(session, 'documents', [row])).get(row.version.id);
  if (!decorated) fail('internal_error');
  return {
    id: row.document.id,
    versionId: row.version.id,
    slug: text(row.data['slug']),
    title: text(row.data['title']),
    summary: text(row.data['summary']),
    navigationLabel: text(row.data['navigationLabel']) || text(row.data['title']),
    order: typeof row.data['order'] === 'number' ? row.data['order'] : 0,
    body: projectDocumentBody(row.data['body']),
    media: decorated.media,
    relations: decorated.relations,
    seo: projectSeo(session, { collection: 'documents', row, media: decorated.media }),
    translations: translations(session, 'documents', row),
    updatedAt: row.version.createdAt,
  };
}
