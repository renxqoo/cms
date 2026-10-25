import type { Locale } from '../../config/preferences';
import type { ListQuery } from './list-query';

export interface ExampleDocument {
  id: string;
  title: { zh: string; en: string };
  category: { zh: string; en: string };
  status: 'draft' | 'published';
  updatedAt: string;
}

const examples: readonly ExampleDocument[] = [
  {
    id: 'example-introduction',
    title: { zh: '欢迎使用 OneAster', en: 'Welcome to OneAster' },
    category: { zh: '产品介绍', en: 'Product' },
    status: 'published',
    updatedAt: '2026-10-26T08:30:00Z',
  },
  {
    id: 'example-guide',
    title: { zh: '内容编辑指南', en: 'Content editing guide' },
    category: { zh: '使用指南', en: 'Guides' },
    status: 'draft',
    updatedAt: '2026-10-25T10:00:00Z',
  },
  {
    id: 'example-design',
    title: { zh: '设计系统与组件规范', en: 'Design system and component conventions' },
    category: { zh: '设计文档', en: 'Design' },
    status: 'published',
    updatedAt: '2026-10-24T06:15:00Z',
  },
  {
    id: 'example-media',
    title: { zh: '媒体资源管理', en: 'Managing media assets' },
    category: { zh: '使用指南', en: 'Guides' },
    status: 'draft',
    updatedAt: '2026-10-23T04:20:00Z',
  },
  {
    id: 'example-localization',
    title: { zh: '多语言内容工作流', en: 'Multilingual content workflows' },
    category: { zh: '内容运营', en: 'Editorial' },
    status: 'published',
    updatedAt: '2026-10-22T03:10:00Z',
  },
  {
    id: 'example-release',
    title: { zh: '发布前检查清单', en: 'Pre-publication checklist' },
    category: { zh: '内容运营', en: 'Editorial' },
    status: 'draft',
    updatedAt: '2026-10-21T09:40:00Z',
  },
];

export function createExampleDocuments(): ExampleDocument[] {
  return examples.map((row) => ({
    ...row,
    title: { ...row.title },
    category: { ...row.category },
  }));
}

export function queryExampleDocuments<Row extends ExampleDocument>(
  rows: readonly Row[],
  query: ListQuery,
  locale: Locale,
) {
  const needle = query.q.trim().toLocaleLowerCase(locale);
  const matching = rows.filter(
    (row) =>
      (query.status === 'all' || row.status === query.status) &&
      `${row.title[locale]} ${row.category[locale]}`.toLocaleLowerCase(locale).includes(needle),
  );
  const { sort } = query;
  if (!sort) return matching;
  const collator = new Intl.Collator(locale);
  return matching.toSorted((left, right) => {
    const leftValue = sort.key === 'title' ? left.title[locale] : left.updatedAt;
    const rightValue = sort.key === 'title' ? right.title[locale] : right.updatedAt;
    const compared = collator.compare(leftValue, rightValue);
    return sort.direction === 'asc' ? compared : -compared;
  });
}
