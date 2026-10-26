import type { PublicObject } from './contracts.ts';
import { publicObject } from './value.ts';

function withLogo(value: unknown): PublicObject {
  const source = publicObject(value);
  return { ...source, logo: source['logo'] ?? null };
}
export function projectSiteData(value: PublicObject): PublicObject {
  return {
    ...value,
    brand: withLogo(value['brand']),
    apiBaseUrl: value['apiBaseUrl'] ?? null,
    footer: {
      ...publicObject(value['footer']),
      disclaimer: publicObject(value['footer'])['disclaimer'] ?? null,
    },
  };
}
export function projectHomeData(value: PublicObject, baseUrl: string | null): PublicObject {
  const hero = publicObject(value['hero']);
  const faq = publicObject(value['faq']);
  const featured = publicObject(value['featuredModels']);
  delete featured['models'];
  return {
    ...value,
    hero: {
      ...hero,
      apiExample: { ...publicObject(hero['apiExample']), baseUrl },
      providers: Array.isArray(hero['providers']) ? hero['providers'].map(withLogo) : [],
      routingProviders: Array.isArray(hero['routingProviders'])
        ? hero['routingProviders'].map(withLogo)
        : [],
    },
    featuredModels: featured,
    faq: {
      ...faq,
      items: Array.isArray(faq['items'])
        ? faq['items'].map((item) => {
            const source = publicObject(item);
            return {
              ...source,
              link: source['link'] ?? null,
              afterLink: source['afterLink'] ?? null,
            };
          })
        : [],
    },
  };
}
