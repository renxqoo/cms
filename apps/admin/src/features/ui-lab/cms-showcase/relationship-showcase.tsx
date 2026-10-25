'use client';

import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { RelationshipInput } from '../../../components/cms/relationship-input';
import type { RelationshipValue } from '../../../components/cms/relationship-input';
import { UploadInput } from '../../../components/cms/upload-input';
import type { CmsCopy } from '../cms-messages';

export function RelationshipShowcase({
  copy,
  onDirtyChange,
}: {
  copy: CmsCopy;
  onDirtyChange(this: void, dirty: boolean): void;
}) {
  const [selected, setSelected] = useState<RelationshipValue[]>([]);
  const [media, setMedia] = useState<RelationshipValue | null>(null);
  const [event, setEvent] = useState('');
  const mediaCollection = { id: 'media', label: copy.media };
  const mediaOption = { collection: 'media', id: '1', label: copy.hero };
  const collections = [{ id: 'articles', label: copy.article }, mediaCollection];
  const options = [{ collection: 'articles', id: '1', label: copy.welcome }, mediaOption];
  return (
    <div className="space-y-5">
      <RelationshipInput
        mode="multiple"
        label={copy.related}
        collections={collections}
        options={options}
        value={selected}
        onChange={(value) => {
          setSelected(value);
          onDirtyChange(true);
        }}
        appearance="select"
        maxRows={3}
        labels={copy.relationship}
        onCreate={(collection) => setEvent(`${copy.relationship.create}: ${collection}`)}
        onEdit={(value) => setEvent(`${copy.relationship.edit}: ${value.collection}/${value.id}`)}
      />
      <UploadInput
        mode="single"
        label={copy.mediaRelation}
        collections={[mediaCollection]}
        options={[mediaOption]}
        value={media}
        onChange={(value) => {
          setMedia(value);
          onDirtyChange(true);
        }}
        appearance="drawer"
        maxRows={1}
        labels={copy.relationship}
        allowCreate
        displayPreview
        fileLimits={{ maxFiles: 1, maxBytes: 5 * 1024 * 1024, accept: ['image/*'] }}
        dropzoneLabels={copy.dropzone}
        onFiles={(files) =>
          setEvent(`${copy.readyHint} ${files.map((file) => file.name).join(', ')}`)
        }
        onCreate={(collection) => setEvent(`${copy.relationship.create}: ${collection}`)}
      />
      {event ? (
        <output aria-label={copy.event} className="block break-words text-sm text-muted-foreground">
          {event}
        </output>
      ) : null}
      <Button
        variant="outline"
        onClick={() => {
          setSelected([]);
          setMedia(null);
          setEvent('');
          onDirtyChange(false);
        }}
      >
        {copy.reset}
      </Button>
    </div>
  );
}
