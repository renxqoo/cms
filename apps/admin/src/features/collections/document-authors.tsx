'use client';

import { Card, CardContent } from '@new-cms/ui/layout';
import { useShell } from '../../components/shell/shell-provider';
import type { Collection } from '../../contracts/content';
import type { Document } from '../../contracts/documents';

export function DocumentAuthors({
  collection,
  document,
}: {
  collection: Collection;
  document: Document | null;
}) {
  const language = useShell((state) => state.locale);
  if (!document || !collection.authorship?.queryable) return null;
  const labels =
    language === 'zh'
      ? { title: '作者追踪', createdBy: '创建者', updatedBy: '最后更新者', unknown: '未提供' }
      : {
          title: 'Authorship',
          createdBy: 'Created by',
          updatedBy: 'Last updated by',
          unknown: 'Not available',
        };
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <h2 className="text-sm font-medium">{labels.title}</h2>
        <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
          {(['createdBy', 'updatedBy'] as const)
            .filter((field) => collection.authorship?.[field])
            .map((field) => {
              const author = document[field];
              return (
                <div key={field} className="min-w-0 space-y-1">
                  <dt className="text-xs text-muted-foreground">{labels[field]}</dt>
                  <dd className="break-words text-sm">
                    {author ? (
                      <>
                        <span>{author.displayName ?? author.id}</span>
                        <code className="block break-all text-xs text-muted-foreground">
                          {author.id}
                        </code>
                      </>
                    ) : (
                      labels.unknown
                    )}
                  </dd>
                </div>
              );
            })}
        </dl>
      </CardContent>
    </Card>
  );
}
