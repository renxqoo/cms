'use client';
import { useState } from 'react';
import { ListFilter } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Field, Input, NativeSelect } from '@new-cms/ui/forms';
import { ColumnSelector } from '@new-cms/ui/data';
import { Popover, PopoverTrigger, PopoverContent } from '@new-cms/ui/overlays';
import type { Collection } from '../../contracts/content';
import type { FolderTree } from '../../contracts/folders';
import type { DocumentQuery } from './query';
import type { ContentMessages } from './messages';
import { flattenFolders } from './folders';
interface ListControlsProps {
  collection: Collection;
  query: DocumentQuery;
  folders: readonly FolderTree[] | null;
  visible: readonly string[];
  setVisible: (updater: (current: string[]) => string[]) => void;
  t: ContentMessages;
  change: (changes: Partial<DocumentQuery>) => void;
}
export function DocumentListControls({
  collection,
  query,
  folders,
  visible,
  setVisible,
  t,
  change,
}: ListControlsProps) {
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <Button variant="outline" onClick={() => change({ trashed: !query.trashed })}>
          {query.trashed ? t.active : t.trash}
        </Button>
        <Field id="list-locale" label={t.locale}>
          <NativeSelect
            value={query.locale}
            onChange={(event) => change({ locale: event.currentTarget.value })}
          >
            {collection.locales.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {collection.mode === 'drafts' && !query.trashed ? (
          <Field id="list-mode" label={t.mode}>
            <NativeSelect
              value={query.mode}
              onChange={(event) => change({ mode: event.currentTarget.value })}
            >
              <option value="editing">{t.editing}</option>
              <option value="published">{t.published}</option>
            </NativeSelect>
          </Field>
        ) : null}
        {folders ? (
          <Field id="list-folder" label={t.folder}>
            <NativeSelect
              value={query.folderId === null ? 'root' : (query.folderId ?? 'all')}
              onChange={(event) =>
                change({
                  folderId: selectedFolder(event.currentTarget.value),
                })
              }
            >
              <option value="all">{t.allFolders}</option>
              <option value="root">{t.rootFolder}</option>
              {flattenFolders(folders).map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {'— '.repeat(folder.depth)}
                  {folder.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="outline">
                <ListFilter aria-hidden="true" />
                {t.filters}
                {query.filterField ? ' · 1' : ''}
              </Button>
            }
          />
          <PopoverContent className="w-80">
            <DocumentFilter
              key={`${query.filterField}:${query.filterValue}`}
              query={query}
              collection={collection}
              t={t}
              change={change}
            />
          </PopoverContent>
        </Popover>
        <ColumnSelector
          columns={collection.fields.map((field) => ({ key: field.path, label: field.label }))}
          selectedKeys={visible}
          onChange={(keys) => setVisible(() => keys)}
          label={t.columns}
        />
      </div>
    </>
  );
}
function DocumentFilter({
  query,
  collection,
  t,
  change,
}: {
  query: DocumentQuery;
  collection: Collection;
  t: ContentMessages;
  change: (patch: Partial<DocumentQuery>) => void;
}) {
  const [field, setField] = useState(query.filterField);
  const [value, setValue] = useState(query.filterValue);
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        change({ filterField: field, filterValue: value });
      }}
    >
      <Field id="list-filter-field" label={t.filterField}>
        <NativeSelect value={field} onChange={(event) => setField(event.currentTarget.value)}>
          <option value="">{t.noFilter}</option>
          {collection.fields
            .filter((candidate) => candidate.queryable)
            .map((candidate) => (
              <option key={candidate.path} value={candidate.path}>
                {candidate.label}
              </option>
            ))}
        </NativeSelect>
      </Field>
      {field ? (
        <Field id="list-filter-value" label={t.filterValue}>
          <Input value={value} onChange={(event) => setValue(event.currentTarget.value)} />
        </Field>
      ) : null}
      <Button variant="outline" type="submit">
        {t.apply}
      </Button>
      {query.filterField ? (
        <Button variant="ghost" onClick={() => change({ filterField: '', filterValue: '' })}>
          {t.clearFilter}
        </Button>
      ) : null}
    </form>
  );
}

function selectedFolder(value: string) {
  if (value === 'root') return null;
  return value === 'all' ? undefined : value;
}
