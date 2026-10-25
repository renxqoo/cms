'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@new-cms/ui/actions';
import { SortableList, Thumbnail } from '@new-cms/ui/data';
import { Checkbox, NativeSelect } from '@new-cms/ui/forms';
import { useFilePreviews } from '../../components/cms/file-previews';
import { useShell } from '../../components/shell/shell-provider';
import { LabPage } from './lab-page';
import { LabOutput, LabSection } from './lab-section';
import { DataTableExample } from './data-table-example';
import { createExampleDocuments } from './list-data';
import { useSortingLabels } from './sorting-labels';

function ThumbnailExample() {
  const t = useTranslations('data');
  const [files, setFiles] = useState<readonly File[]>([]);
  const previews = useFilePreviews(files);
  const [file] = files;
  const src = file ? (previews.get(file) ?? null) : null;
  function createImage() {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120"><rect width="160" height="120" rx="16" fill="#f5f5f5"/><circle cx="80" cy="50" r="22" fill="#171717"/><text x="80" y="99" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#171717">OneAster</text></svg>';
    setFiles([new File([svg], 'oneaster-example.svg', { type: 'image/svg+xml' })]);
  }
  return (
    <LabSection title={t('thumbnails')} description={t('thumbnailDescription')}>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={createImage}>
          {t('showImage')}
        </Button>
        <Button variant="ghost" disabled={!file} onClick={() => setFiles([])}>
          {t('removeImage')}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Thumbnail
          src={src}
          alt={t('imageAlt')}
          filename="oneaster-example.svg"
          mimeType="image/svg+xml"
          fallbackLabel={t('imageFallback')}
          className="size-24"
        />
        {(
          [
            { mime: 'text/plain', label: 'textFallback' },
            { mime: 'audio/mpeg', label: 'audioFallback' },
            { mime: 'video/mp4', label: 'videoFallback' },
            { mime: 'application/zip', label: 'archiveFallback' },
            { mime: 'application/octet-stream', label: 'unknownFallback' },
          ] as const
        ).map((item) => (
          <Thumbnail
            key={item.mime}
            alt={t(item.label)}
            filename={t(item.label)}
            mimeType={item.mime}
            fallbackLabel={t(item.label)}
          />
        ))}
      </div>
    </LabSection>
  );
}

function SortingExample() {
  const t = useTranslations('data');
  const locale = useShell((state) => state.locale);
  const [items, setItems] = useState(() => createExampleDocuments().slice(0, 3));
  const [disabled, setDisabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const labels = useSortingLabels(t('sorting'));
  return (
    <LabSection title={t('sorting')} description={t('sortingDescription')}>
      <div className="flex flex-wrap items-center gap-4">
        <Checkbox label={t('disableSorting')} checked={disabled} onCheckedChange={setDisabled} />
        <Checkbox label={t('lockFirst')} checked={locked} onCheckedChange={setLocked} />
        <NativeSelect
          aria-label={t('orientation')}
          value={orientation}
          onChange={(event) =>
            setOrientation(event.currentTarget.value === 'horizontal' ? 'horizontal' : 'vertical')
          }
        >
          <option value="vertical">{t('vertical')}</option>
          <option value="horizontal">{t('horizontal')}</option>
        </NativeSelect>
      </div>
      <SortableList
        items={items}
        getId={(item) => item.id}
        getItemLabel={(item) => item.title[locale]}
        onChange={setItems}
        labels={labels}
        disabled={disabled}
        orientation={orientation}
        className="max-w-full overflow-x-auto"
        isItemDisabled={(item) => locked && item.id === 'example-introduction'}
        renderItem={(item, handle) => (
          <div className="flex min-w-48 items-center gap-3 rounded-lg border border-border/60 bg-card p-3 text-sm">
            {handle}
            <span>{item.title[locale]}</span>
          </div>
        )}
      />
      <LabOutput label={t('order')} value={items.map((item) => item.title[locale])} />
    </LabSection>
  );
}

export function DataShowcase() {
  return (
    <LabPage category="data">
      <DataTableExample />
      <ThumbnailExample />
      <SortingExample />
    </LabPage>
  );
}
