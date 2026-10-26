import { useSyncExternalStore } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import type { AssetManifest, UploadSession } from '../../../contracts/assets';
import type { CollectionEditor } from '../../../contracts/editor';
import type {
  AssetPreviewProps,
  AssetDocumentControlsProps,
  AssetWriteLease,
} from '../../assets/document-asset-types';
import type { AssetUploadQueueProps } from '../../assets/asset-upload-types';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { parsePreferences } from '../../../config/preferences';
import { DocumentMedia, HistoricalFile, bindingPreview } from '../document-media';
import { createDocumentChannel } from '../document-channel';
import type { DocumentChannel } from '../channel-types';
import type { EditorSnapshot } from '../read-editor';
import { contentMessages } from '../content-messages';
import { snapshot, newSnapshot, id, versionId, time } from './support';
const controls = vi.hoisted(() => ({
  request:
    vi.fn<
      (input: {
        operation: string;
        params?: Readonly<Record<string, string>>;
        body?: unknown;
        signal: AbortSignal;
      }) => Promise<ApiResult<unknown>>
    >(),
  preview: vi.fn<(props: AssetPreviewProps) => void>(),
  document: vi.fn<(props: AssetDocumentControlsProps) => void>(),
  queue: vi.fn<(props: AssetUploadQueueProps) => void>(),
  upload: null as UploadSession | null,
  leases: [] as (AssetWriteLease | null)[],
  denied: new Set<string>(),
}));
vi.mock('../../../api/client', () => ({ requestApi: controls.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({ can: (operation: string) => !controls.denied.has(operation) }),
}));
vi.mock('../../assets/asset-preview', () => ({
  AssetPreview: (props: AssetPreviewProps) => {
    controls.preview(props);
    return <span>Private preview</span>;
  },
}));
vi.mock('../../assets/asset-document-controls', () => ({
  AssetDocumentControls: (props: AssetDocumentControlsProps) => {
    controls.document(props);
    return (
      <button
        disabled={props.busy || props.readOnly}
        onClick={() => controls.leases.push(props.begin('reprocess'))}
      >
        Reserve reprocess
      </button>
    );
  },
}));
vi.mock('../../assets/asset-upload-queue', () => ({
  AssetUploadQueue: (props: AssetUploadQueueProps) => {
    controls.queue(props);
    return (
      <>
        <button
          disabled={props.disabled}
          onClick={() => {
            if (controls.upload) props.onReady?.(controls.upload);
          }}
        >
          Ready file
        </button>
        <button onClick={() => props.onActivityChange?.(true)}>Start transfer</button>
        <button onClick={() => props.onActivityChange?.(false)}>Finish transfer</button>
        <button
          onClick={() => {
            if (controls.upload) props.onTerminal?.({ ...controls.upload, status: 'cancelled' });
          }}
        >
          Cancel selected upload
        </button>
      </>
    );
  },
}));
const channels: DocumentChannel[] = [];
afterEach(() => {
  cleanup();
  channels.forEach((channel) => channel.dispose());
  channels.length = 0;
  vi.resetAllMocks();
});
beforeEach(() => {
  controls.denied = new Set();
  controls.leases = [];
  controls.upload = readyUpload();
  controls.request.mockResolvedValue({
    ok: true,
    status: 200,
    requestId: '',
    data: controls.upload,
  });
});
function manifest(): AssetManifest {
  return {
    id: '40000000-0000-4000-8000-000000000001',
    filename: 'image.png',
    mimeType: 'image/png',
    bytes: 100,
    digest: 'digest',
    width: 10,
    height: 10,
    orientation: 1,
    processorVersion: 'test',
    recipe: { variants: [] },
    objects: [],
  };
}
function budget(): NonNullable<CollectionEditor['upload']> {
  return {
    mimeTypes: ['image/png'],
    maxBytes: 1024,
    recipe: { variants: [] },
    maxOutputBytes: 2048,
    maxPixels: 10000,
    maxFrames: 1,
    maxWidth: 100,
    maxHeight: 100,
    maxVariants: 3,
    directUpload: false,
    multipart: false,
  };
}
function readyUpload(): UploadSession {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    collection: 'articles',
    purpose: 'create',
    filename: 'image.png',
    declaredMimeType: 'image/png',
    declaredBytes: 100,
    createdAt: time,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    documentId: null,
    revision: null,
    status: 'ready',
    failureCode: null,
    manifest: manifest(),
    jobId: null,
  };
}
function setup(initial: EditorSnapshot) {
  initial.collection.upload = true;
  initial.editor.upload = budget();
  let latest = initial;
  const created = vi.fn<(id: string) => void>();
  const channel = createDocumentChannel({
    initial,
    can: (operation) => !controls.denied.has(operation),
    report: vi.fn<(result: ApiResult<unknown>) => void>(),
    load: () => Promise.resolve({ ok: true, status: 200, requestId: '', data: latest }),
    created,
    archived: vi.fn<() => void>(),
  });
  channels.push(channel);
  return {
    channel,
    created,
    setLatest(value: EditorSnapshot) {
      latest = value;
    },
  };
}
function MediaView({ channel }: { channel: DocumentChannel }) {
  const state = useSyncExternalStore(channel.subscribe, channel.getSnapshot, channel.getSnapshot);
  return <DocumentMedia channel={channel} state={state} readReady messages={contentMessages.en} />;
}
function view(channel: DocumentChannel) {
  return render(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>
      <MediaView channel={channel} />
    </ShellProvider>,
  );
}
it('pins current media controls and private previews to the actual document version and reserves the same shared write channel', () => {
  const initial = snapshot();
  if (initial.document) initial.document.file = manifest();
  const test = setup(initial);
  view(test.channel);
  expect(controls.document.mock.calls.at(-1)?.[0]).toMatchObject({
    documentId: id,
    versionId,
    revision: 3,
    manifest: { filename: 'image.png' },
  });
  expect(controls.preview.mock.calls.at(-1)?.[0].target).toEqual({
    kind: 'document',
    collection: 'articles',
    id,
    versionId,
    mode: 'editing',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reserve reprocess' }));
  expect(test.channel.getSnapshot().phase).toBe('writing');
  expect(controls.leases.at(-1)?.revision).toBe(3);
});
it('uses the historical source binding and collection identity instead of the resource current file', () => {
  const initial = snapshot();
  if (!initial.document) throw new Error('Missing document');
  const document = {
    ...initial.document,
    versionId: '20000000-0000-4000-8000-000000000002',
    mediaBindings: [
      {
        bindingId: '70000000-0000-4000-8000-000000000001',
        sourcePath: 'en:photo',
        mediaDocumentId: '80000000-0000-4000-8000-000000000001',
        mediaCollectionKey: 'media',
        manifest: manifest(),
      },
    ],
  };
  const preview = bindingPreview(document);
  render(
    preview({
      reference: { collection: 'media', id: '80000000-0000-4000-8000-000000000001' },
      sourcePath: 'en:photo',
      path: ['photo'],
    }),
  );
  expect(controls.preview.mock.calls.at(-1)?.[0].target).toEqual({
    kind: 'binding',
    collection: 'articles',
    id,
    versionId: '20000000-0000-4000-8000-000000000002',
    bindingId: '70000000-0000-4000-8000-000000000001',
    mode: 'editing',
  });
  expect(
    preview({
      reference: { collection: 'other', id: '80000000-0000-4000-8000-000000000001' },
      sourcePath: 'en:photo',
      path: ['photo'],
    }),
  ).toBeNull();
  expect(
    preview({
      reference: { collection: 'media', id: '80000000-0000-4000-8000-000000000001' },
      sourcePath: 'en:other',
      path: ['photo'],
    }),
  ).toBeNull();
});
it('does not request a current-file fallback when an immutable historical binding is absent', () => {
  const initial = snapshot();
  const preview = bindingPreview(initial.document);
  expect(
    preview({ reference: { collection: 'media', id }, path: ['photo'], sourcePath: 'en:photo' }),
  ).toBeNull();
  expect(controls.preview).not.toHaveBeenCalled();
});
it('renders a historical upload file with its explicit version and leaves documents without files empty', () => {
  const initial = snapshot();
  if (!initial.document) throw new Error('Missing document');
  render(
    <HistoricalFile
      document={{
        ...initial.document,
        file: manifest(),
        versionId: '20000000-0000-4000-8000-000000000003',
      }}
      label="Historical file"
    />,
  );
  expect(controls.preview.mock.calls.at(-1)?.[0].target).toMatchObject({
    versionId: '20000000-0000-4000-8000-000000000003',
  });
  cleanup();
  render(<HistoricalFile document={initial.document} label="No file" />);
  expect(screen.queryByText('Private preview')).not.toBeInTheDocument();
});
it('verifies a selected ready upload through the API, preserves the field draft and consumes it only after saving', async () => {
  const test = setup(newSnapshot());
  test.channel.edit({ title: 'My document draft', slug: 'new' });
  view(test.channel);
  fireEvent.click(screen.getByRole('button', { name: 'Ready file' }));
  expect(controls.request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  await waitFor(() =>
    expect(test.channel.getSnapshot().snapshot.upload?.id).toBe(
      '30000000-0000-4000-8000-000000000001',
    ),
  );
  expect(test.channel.getSnapshot().draft['title']).toBe('My document draft');
  expect(controls.request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'assets.readUpload',
    params: { collection: 'articles', uploadId: '30000000-0000-4000-8000-000000000001' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Start transfer' }));
  await act(async () => {
    await test.channel.execute({ kind: 'save' });
  });
  expect(
    controls.request.mock.calls.filter(([input]) => input.operation === 'documents.create'),
  ).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Finish transfer' }));
  const after = snapshot(1, 'My document draft');
  after.collection.upload = true;
  after.editor.upload = budget();
  if (after.document) after.document.file = manifest();
  test.setLatest(after);
  controls.request.mockResolvedValue({
    ok: true,
    status: 201,
    requestId: '',
    data: after.document,
  });
  await act(async () => {
    await test.channel.execute({ kind: 'save' });
  });
  expect(controls.request.mock.calls.at(-1)?.[0]).toMatchObject({
    operation: 'documents.create',
    body: {
      locale: 'en',
      data: { title: 'My document draft', slug: 'new' },
      uploadId: '30000000-0000-4000-8000-000000000001',
    },
  });
  expect(test.created).toHaveBeenCalledExactlyOnceWith(id);
  expect(test.channel.getSnapshot().snapshot.upload).toBeNull();
});
it('clears only the selected upload when the queue reports its real terminal cancellation', async () => {
  const test = setup(newSnapshot());
  test.channel.edit({ title: 'Keep draft' });
  view(test.channel);
  fireEvent.click(screen.getByRole('button', { name: 'Ready file' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  await waitFor(() => expect(test.channel.getSnapshot().snapshot.upload).not.toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Cancel selected upload' }));
  expect(test.channel.getSnapshot().snapshot.upload).toBeNull();
  expect(test.channel.getSnapshot().draft['title']).toBe('Keep draft');
});
it('refuses a forged ready notification when the actual server session belongs to another collection', async () => {
  const test = setup(newSnapshot());
  test.channel.edit({ title: 'Keep draft' });
  if (!controls.upload) throw new Error('Missing upload');
  controls.request.mockResolvedValue({
    ok: true,
    status: 200,
    requestId: '',
    data: { ...controls.upload, collection: 'other' },
  });
  view(test.channel);
  fireEvent.click(screen.getByRole('button', { name: 'Ready file' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  await waitFor(() => expect(test.channel.getSnapshot().error?.status).toBe(409));
  expect(test.channel.getSnapshot().snapshot.upload).toBeNull();
  expect(test.channel.getSnapshot().draft['title']).toBe('Keep draft');
});
