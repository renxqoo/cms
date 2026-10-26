import { createHash } from 'node:crypto';
import type { PublicEnvelope } from './contracts.ts';
import { publicContentContract } from './contracts.ts';

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .toSorted()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(Reflect.get(value, key))}`)
      .join(',')}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('Cannot encode public content');
  return encoded;
}
export function envelope<T>(locale: string, data: T): PublicEnvelope<T> {
  const revision = createHash('sha256')
    .update(canonicalJson({ contractVersion: publicContentContract, locale, data }))
    .digest('hex');
  return { contractVersion: publicContentContract, locale, revision, data };
}
export function sitemapBucket(path: string): number {
  return createHash('sha256').update(path).digest().readUInt8(0) % 16;
}
