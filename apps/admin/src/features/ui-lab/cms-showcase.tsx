'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { FilesIcon } from 'lucide-react';
import { Banner } from '@new-cms/ui/feedback';
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from '@new-cms/ui/layout';
import { UnsavedChangesGuard } from '../../components/cms/unsaved-changes';
import type { NavigationAdapter } from '../../components/shell/navigation/types';
import { getCmsMessages } from './cms-messages';
import { RelationshipShowcase } from './cms-showcase/relationship-showcase';
import { DocumentShowcase } from './cms-showcase/document-showcase';
import { UploadShowcase } from './cms-showcase/upload-showcase';
import { ImageShowcase } from './cms-showcase/image-showcase';

export function CmsShowcase({
  navigation,
  onNavigate,
}: {
  navigation: NavigationAdapter;
  onNavigate(this: void, href: string): void;
}) {
  const locale = useLocale();
  const copy = getCmsMessages(locale === 'zh' ? 'zh' : 'en');
  const [dirty, setDirty] = useState({
    relationships: false,
    document: false,
    uploads: false,
    images: false,
  });
  function changed(section: keyof typeof dirty, value: boolean) {
    setDirty((current) => ({ ...current, [section]: value }));
  }
  return (
    <UnsavedChangesGuard
      dirty={Object.values(dirty).some(Boolean)}
      navigation={navigation}
      labels={copy.unsaved}
    >
      <div className="flex flex-col gap-4 md:gap-6">
        <PageHeader title={copy.title} description={copy.description} icon={<FilesIcon />} />
        <Banner>{copy.notice}</Banner>
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <Card role="region" aria-label={copy.relationships}>
            <CardHeader>
              <CardTitle>{copy.relationships}</CardTitle>
            </CardHeader>
            <CardContent>
              <RelationshipShowcase
                copy={copy}
                onDirtyChange={(value) => changed('relationships', value)}
              />
            </CardContent>
          </Card>
          <Card role="region" aria-label={copy.document}>
            <CardHeader>
              <CardTitle>{copy.document}</CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentShowcase
                copy={copy}
                onDirtyChange={(value) => changed('document', value)}
                onNavigate={onNavigate}
              />
            </CardContent>
          </Card>
          <Card role="region" aria-label={copy.uploads}>
            <CardHeader>
              <CardTitle>{copy.uploads}</CardTitle>
            </CardHeader>
            <CardContent>
              <UploadShowcase copy={copy} onDirtyChange={(value) => changed('uploads', value)} />
            </CardContent>
          </Card>
          <Card role="region" aria-label={copy.images}>
            <CardHeader>
              <CardTitle>{copy.images}</CardTitle>
            </CardHeader>
            <CardContent>
              <ImageShowcase copy={copy} onDirtyChange={(value) => changed('images', value)} />
            </CardContent>
          </Card>
        </div>
      </div>
    </UnsavedChangesGuard>
  );
}
