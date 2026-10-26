import { fail } from '@new-cms/cms/platform/contracts';
import type { Where } from '../definition.ts';
import type { DeliverySession } from './types.ts';
import type {
  PublicDocumentIndexItem,
  PublicDocumentPage,
  PublicHomePage,
  PublicInterface,
  PublicLanguages,
  PublicModelDetail,
} from './contracts.ts';
import { readRows, record, text } from './source.ts';
import { publicObject, projectDocument, projectModels, projectRecord } from './projection.ts';
import { selectedLocale } from './query.ts';
import { projectHomeData } from './presentation.ts';
import { modelCardFields, documentNavigationFields, readProjection } from './read-shapes.ts';

export async function readInterface(
  session: DeliverySession,
  input: { languages: PublicLanguages; initialized: boolean; version?: string | undefined },
): Promise<PublicInterface> {
  const { languages, initialized, version } = input;
  const contract = session.options.messageContracts.find(
    (entry) => entry.version === (version ?? session.options.messageContracts[0]?.version),
  );
  if (
    !contract ||
    (contract.availableUntil !== null && Date.parse(contract.availableUntil) <= Date.now())
  )
    fail('temporarily_unavailable');
  const rows = await readRows(session.runtime, session.tx, {
    collection: 'message-bundles',
    locale: session.runtime.registry.get('message-bundles').locales.default,
    where: {
      and: [
        { field: 'locale', operator: 'eq', value: session.locale },
        { field: 'contractVersion', operator: 'eq', value: contract.version },
      ],
    },
  });
  if (rows.total > session.runtime.limits.maxPageSize) fail('capacity_exceeded');
  const messages = publicObject({});
  for (const row of rows.rows) {
    const namespace = text(row.data['namespace']);
    if (!namespace || Object.hasOwn(messages, namespace)) fail('temporarily_unavailable');
    messages[namespace] = publicObject(row.data['messages']);
  }
  if (initialized && !contract.validate(messages)) fail('temporarily_unavailable');
  const site = await readRows(session.runtime, session.tx, {
    collection: 'site',
    locale: session.locale,
    where: selectedLocale(session.locale),
    pageSize: 1,
  });
  return {
    languages,
    messageContractVersion: contract.version,
    messages,
    site: site.rows[0] ? await projectRecord(session, 'site', site.rows[0]) : null,
    initialized,
  };
}
export async function readHome(session: DeliverySession): Promise<PublicHomePage> {
  const home = await readRows(session.runtime, session.tx, {
    collection: 'home',
    locale: session.locale,
    where: selectedLocale(session.locale),
    pageSize: 1,
  });
  const selected = record(home.rows[0]?.data['featuredModels'])['models'];
  const ids = Array.isArray(selected)
    ? [...new Set(selected.map((item) => text(record(item)['id'])).filter(Boolean))].slice(
        0,
        session.options.policy.maxRelatedItems,
      )
    : [];
  const featured =
    ids.length === 0
      ? []
      : (
          await readRows(session.runtime, session.tx, {
            collection: 'models',
            projection: await readProjection(session, 'models', modelCardFields),
            locale: session.locale,
            where: {
              and: [selectedLocale(session.locale), { field: 'id', operator: 'in', value: ids }],
            },
            pageSize: session.options.policy.maxRelatedItems,
          })
        ).rows;
  const ordered = ids.flatMap((id) => featured.filter((row) => row.document.id === id));
  const projected = home.rows[0] ? await projectRecord(session, 'home', home.rows[0]) : null;
  if (projected) {
    const site = await readRows(session.runtime, session.tx, {
      collection: 'site',
      projection: await readProjection(session, 'site', ['apiBaseUrl']),
      locale: session.locale,
      where: selectedLocale(session.locale),
      pageSize: 1,
    });
    projected.data = projectHomeData(
      projected.data,
      text(site.rows[0]?.data['apiBaseUrl']) || null,
    );
  }
  return {
    home: projected,
    featuredModels: await projectModels(session, ordered),
  };
}
export async function readModel(
  session: DeliverySession,
  slug: string,
): Promise<PublicModelDetail> {
  const page = await readRows(session.runtime, session.tx, {
    collection: 'models',
    locale: session.locale,
    where: {
      and: [selectedLocale(session.locale), { field: 'slug', operator: 'eq', value: slug }],
    },
    pageSize: 1,
  });
  const [row] = page.rows;
  if (!row) fail('not_found');
  const [model] = await projectModels(session, [row], true);
  if (!model) fail('internal_error');
  const references = record(row.data['presentation'])['relatedModels'];
  const ids = Array.isArray(references)
    ? references
        .map((value) => text(record(value)['id']))
        .filter((id) => id !== row.document.id)
        .slice(0, session.options.policy.maxRelatedItems)
    : [];
  const related =
    ids.length === 0
      ? []
      : (
          await readRows(session.runtime, session.tx, {
            collection: 'models',
            projection: await readProjection(session, 'models', modelCardFields),
            locale: session.locale,
            where: {
              and: [selectedLocale(session.locale), { field: 'id', operator: 'in', value: ids }],
            },
            pageSize: session.options.policy.maxRelatedItems,
          })
        ).rows;
  return { model, related: await projectModels(session, related) };
}
export function documentIndex(row: {
  document: { id: string };
  data: Record<string, unknown>;
}): PublicDocumentIndexItem {
  return {
    id: row.document.id,
    slug: text(row.data['slug']),
    title: text(row.data['title']),
    navigationLabel: text(row.data['navigationLabel']) || text(row.data['title']),
    order: typeof row.data['order'] === 'number' ? row.data['order'] : 0,
  };
}
export async function readDocuments(
  session: DeliverySession,
  slug?: string,
): Promise<PublicDocumentPage> {
  const navigation = await readRows(session.runtime, session.tx, {
    collection: 'documents',
    projection: await readProjection(session, 'documents', documentNavigationFields),
    locale: session.locale,
    where: selectedLocale(session.locale),
    pageSize: session.options.policy.maxNavigationItems,
    sort: [{ field: 'order', order: 'asc' }],
  });
  let chosen = slug;
  if (chosen === undefined) {
    const site = await readRows(session.runtime, session.tx, {
      collection: 'site',
      projection: await readProjection(session, 'site', ['defaultDocumentSlug']),
      locale: session.locale,
      where: selectedLocale(session.locale),
      pageSize: 1,
    });
    chosen =
      text(site.rows[0]?.data['defaultDocumentSlug']) ||
      text(navigation.rows[0]?.data['slug']) ||
      undefined;
  }
  let document = null;
  if (chosen !== undefined) {
    const where: Where = {
      and: [selectedLocale(session.locale), { field: 'slug', operator: 'eq', value: chosen }],
    };
    const page = await readRows(session.runtime, session.tx, {
      collection: 'documents',
      locale: session.locale,
      where,
      pageSize: 1,
    });
    const [first] = page.rows;
    if (!first) fail('not_found');
    document = await projectDocument(session, first);
  }
  return {
    document,
    navigation: navigation.rows.map(documentIndex),
    total: navigation.total,
    indexUrl: `/v1/public/index?kind=documents&locale=${encodeURIComponent(session.locale)}`,
  };
}
