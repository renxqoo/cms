export const publicContentContract = 'oneaster-public.v1' as const;

export type PublicJson = string | number | boolean | null | PublicJson[] | PublicObject;
export interface PublicObject {
  [key: string]: PublicJson;
}

export interface PublicEnvelope<T> {
  contractVersion: typeof publicContentContract;
  locale: string;
  revision: string;
  data: T;
}

export interface PublicLanguage {
  code: string;
  label: string;
  shortLabel: string;
  htmlLang: string;
  direction: 'ltr' | 'rtl';
}

export interface PublicLanguages {
  defaultLocale: string;
  locales: PublicLanguage[];
}

export interface PublicMedia {
  bindingId: string;
  mediaDocumentId: string;
  url: string;
  mimeType: string;
  bytes: number;
  digest: string;
  width: number | null;
  height: number | null;
  alt: string;
}

export interface PublicRecord {
  id: string;
  versionId: string;
  publishedAt: string;
  updatedAt: string;
  data: PublicObject;
  media: Record<string, PublicMedia>;
  relations: Record<string, PublicRelation>;
  seo: PublicSeo;
  translations: PublicTranslation[];
}

export interface PublicRelation {
  id: string;
  collection: string;
  title: string;
  url: string;
}

export interface PublicDeveloper {
  id: string;
  title: string;
  website: string | null;
  logo: PublicMedia | null;
}

export interface PublicCapabilities {
  inputs: string[];
  outputs: string[];
  tasks: string[];
  features: string[];
}

export interface PublicModel {
  id: string;
  versionId: string;
  modelId: string;
  slug: string;
  title: string;
  summary: string;
  primaryCategory: 'text' | 'image' | 'video' | 'embedding' | 'audio';
  contentLocales: string[];
  developer: PublicDeveloper | null;
  family: string | null;
  version: string | null;
  versionKind: 'rolling' | 'snapshot' | null;
  releaseDate: string | null;
  officialUrl: string | null;
  technicalCapabilities: PublicCapabilities;
  specifications: PublicObject;
  apiBindings: PublicObject[];
  defaultBindingKey: string | null;
  parameterReference: PublicObject | null;
  platformAccess: 'supported' | 'unsupported';
  content: PublicObject;
  showcase: PublicObject[];
  presentation: { featured: boolean; sortOrder: number };
  logo: PublicMedia | null;
  media: Record<string, PublicMedia>;
  relations: Record<string, PublicRelation>;
  seo: PublicSeo;
  translations: PublicTranslation[];
  updatedAt: string;
}

export interface PublicSeo {
  title: string;
  description: string;
  canonicalPath: string;
  allowIndex: boolean;
  image: PublicMedia | null;
}

export interface PublicTranslation {
  locale: string;
  slug: string;
  canonicalPath: string;
  updatedAt: string;
  allowIndex: boolean;
}

export interface PublicFacet {
  value: string;
  label: string;
  count: number;
}

export interface PublicModelFacets {
  categories: PublicFacet[];
  developers: PublicFacet[];
  tasks: PublicFacet[];
  inputs: PublicFacet[];
  outputs: PublicFacet[];
  capabilities: PublicFacet[];
}

export interface PublicModelCatalog {
  models: PublicModel[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  facets: PublicModelFacets;
}

export interface PublicModelDetail {
  model: PublicModel;
  related: PublicModel[];
}

export interface PublicInterface {
  languages: PublicLanguages;
  messageContractVersion: string;
  messages: PublicObject;
  site: PublicRecord | null;
  initialized: boolean;
}

export interface PublicHomePage {
  home: PublicRecord | null;
  featuredModels: PublicModel[];
}

export interface PublicDocument {
  id: string;
  versionId: string;
  slug: string;
  title: string;
  summary: string;
  navigationLabel: string;
  order: number;
  body: PublicObject;
  media: Record<string, PublicMedia>;
  relations: Record<string, PublicRelation>;
  seo: PublicSeo;
  translations: PublicTranslation[];
  updatedAt: string;
}

export interface PublicDocumentPage {
  document: PublicDocument | null;
  navigation: PublicDocumentIndexItem[];
  total: number;
  indexUrl: string;
}

export interface PublicDocumentIndexItem {
  id: string;
  slug: string;
  title: string;
  navigationLabel: string;
  order: number;
}

export interface PublicModelGuide {
  id: string;
  slug: string;
  title: string;
  summary: string;
  modelId: string;
  primaryCategory: PublicModel['primaryCategory'];
}

export interface PublicSitemapItem {
  locale: string;
  canonicalPath: string;
  updatedAt: string;
  translations: PublicTranslation[];
}

export type PublicIndexItem = PublicDocumentIndexItem | PublicModelGuide | PublicSitemapItem;

export type PublicExportFrame =
  | {
      type: 'start';
      contractVersion: typeof publicContentContract;
      kind: string;
      locale: string;
      id: string;
    }
  | { type: 'item'; sequence: number; data: PublicIndexItem }
  | { type: 'end'; count: number; digest: string }
  | { type: 'error'; code: string };

export interface PublicPreviewTicket {
  ticketId: string;
  expiresAt: string;
  url: string;
}
export interface PublicIntegrationExamples {
  modelId: string;
  bindingKey: string;
  profileKey: string;
  recipeKey: string;
  flowKey: string;
  scenarioKey: string;
  examples: { key: string; language: string; code: string; requirements: string[] }[];
  agentInstructions: string;
  documentationUrl: string | null;
}
