import { describe, expect, it, vi } from 'vitest';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/result';
import type { Document } from '../../../contracts/documents';
import { createContentEditor, editorDirty } from '../editor-controller';
import {
  deferred,
  document,
  documentId,
  editor,
  folderId,
  nextVersionId,
  snapshot,
  success,
  versionId,
} from './support';

type Options = Parameters<typeof createContentEditor>[0];

function setup(overrides: Partial<Options> = {}) {
  const load = vi.fn<Options['load']>().mockResolvedValue(success(snapshot()));
  const write = vi
    .fn<Options['write']>()
    .mockResolvedValue(
      success(document({ revision: 2, versionId: nextVersionId, data: { title: 'Saved title' } })),
    );
  const onCreated = vi.fn<Options['onCreated']>();
  const onArchived = vi.fn<Options['onArchived']>();
  const report = vi.fn<Options['report']>();
  const controller = createContentEditor({
    target: { collection: 'articles', id: documentId, locale: 'en', intent: 'update' },
    load,
    readArchived: () => Promise.resolve(success(null)),
    write,
    createId: () => '55555555-5555-4555-8555-555555555555',
    onCreated,
    onArchived,
    report,
    ...overrides,
  });
  return { controller, load, write, onCreated, onArchived, report };
}

describe('content editor write channel', () => {
  it('verifies an unknown archive through the real trash view before returning to the trash list', async () => {
    const readArchived = vi
      .fn<Options['readArchived']>()
      .mockResolvedValue(success(document({ trashedAt: '2026-10-26T00:00:00.000Z' })));
    const write = vi
      .fn<Options['write']>()
      .mockResolvedValue(failure('request_failed', 0, { uncertain: true }));
    const { controller, onArchived } = setup({ readArchived, write });
    await controller.start();
    await controller.submit('archive');
    await controller.retry();
    expect(readArchived).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledOnce();
    expect(onArchived).toHaveBeenCalledOnce();
    expect(controller.store.getState().pending).toBeNull();
  });

  it('replays an unknown multilingual copy with the original payload and key rather than a new edited request', async () => {
    const write = vi
      .fn<Options['write']>()
      .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
      .mockResolvedValue(success(document()));
    const { controller } = setup({ write });
    await controller.start();
    expect(await controller.copy({ en: { slug: 'first-en' }, 'zh-CN': { slug: 'first-zh' } })).toBe(
      false,
    );
    expect(await controller.copy({ en: { slug: 'different-intent' } })).toBe(true);
    expect(write.mock.calls[1]?.[0]).toEqual(write.mock.calls[0]?.[0]);
    expect(write.mock.calls[1]?.[2]).toBe(true);
  });
  it('regression: an unknown non-idempotent update reads current data without replaying the PATCH', async () => {
    const write = vi
      .fn<Options['write']>()
      .mockResolvedValue(failure('request_failed', 0, { uncertain: true }));
    const load = vi
      .fn<Options['load']>()
      .mockResolvedValueOnce(success(snapshot()))
      .mockResolvedValue(success(snapshot({ document: document({ revision: 3 }) })));
    const { controller } = setup({ write, load });
    await controller.start();
    controller.change({ title: 'Preserved' });
    await controller.submit('save');
    await controller.retry();
    expect(write).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledTimes(2);
    expect(controller.store.getState().latest?.document?.revision).toBe(3);
    expect(controller.store.getState().value).toEqual({ title: 'Preserved' });
    expect(controller.store.getState().pending).not.toBeNull();
    await controller.rebaseCurrent();
    expect(controller.store.getState().pending).toBeNull();
  });

  it('regression: invalid text entered during saving keeps its error and field instance epoch after the late response', async () => {
    const pending = deferred<ApiResult<Document>>();
    const { controller } = setup({ write: () => pending.promise });
    await controller.start();
    controller.change({ title: 'Valid submission' });
    const epoch = controller.store.getState().resetEpoch;
    const saving = controller.submit('save');
    controller.validity('raw-json', 'Invalid JSON text');
    pending.resolve(success(document()));
    await saving;
    expect(controller.store.getState().errors).toEqual({ 'raw-json': 'Invalid JSON text' });
    expect(controller.store.getState().resetEpoch).toBe(epoch);
    expect(controller.store.getState().saved).toBe(false);
  });

  it('regression: singleton create conflicts can discover the actual existing identity without discarding the new draft', async () => {
    const singleton = snapshot({
      collection: { ...snapshot().collection, singleton: true },
      document: null,
      editor: editor({ intent: 'create', document: null }),
    });
    const load = vi
      .fn<Options['load']>()
      .mockResolvedValueOnce(success(singleton))
      .mockResolvedValue(success(snapshot()));
    const { controller } = setup({
      target: { collection: 'articles', id: null, locale: 'en', intent: 'create' },
      load,
      write: () => Promise.resolve(failure('identifier_taken', 409)),
    });
    await controller.start();
    controller.change({ title: 'My new singleton draft' });
    await controller.submit('save');
    expect(controller.store.getState().latest?.document?.id).toBe(documentId);
    expect(controller.store.getState().value).toEqual({ title: 'My new singleton draft' });
  });

  it('copies an explicit field patch while keeping the source draft clean until the actual response', async () => {
    const { controller, write } = setup();
    await controller.start();
    expect(await controller.copy({ en: { slug: 'unique-copy' } })).toBe(true);
    expect(write.mock.calls[0]?.[0]).toMatchObject({
      action: 'copy',
      dataByLocale: { en: { slug: 'unique-copy' } },
    });
  });
  it('regression: folder-only edits do not trigger empty autosave or lose their unsaved destination', async () => {
    const { controller, write } = setup();
    await controller.start();
    controller.setFolder(folderId);
    await controller.submit('autosave');
    expect(write).not.toHaveBeenCalled();
    expect(controller.store.getState().folderId).toBe(folderId);
    expect(editorDirty(controller.store.getState())).toBe(true);
  });

  it('regression: autosaving fields preserves the separate manual folder move and does not claim everything saved', async () => {
    const latest = snapshot({
      document: document({ revision: 2, versionId: nextVersionId, data: { title: 'Autosaved' } }),
    });
    const load = vi
      .fn<Parameters<typeof createContentEditor>[0]['load']>()
      .mockResolvedValueOnce(success(snapshot()))
      .mockResolvedValue(success(latest));
    const { controller } = setup({ load });
    await controller.start();
    controller.setFolder(folderId);
    controller.change({ title: 'Autosaved' });
    await controller.submit('autosave');
    expect(controller.store.getState().value).toEqual({ title: 'Autosaved' });
    expect(controller.store.getState().folderId).toBe(folderId);
    expect(controller.store.getState().saved).toBe(false);
    expect(editorDirty(controller.store.getState())).toBe(true);
  });
  it('loads confirmed data and submits only changed writable fields with the current revision', async () => {
    const { controller, write } = setup();
    await controller.start();
    expect(editorDirty(controller.store.getState())).toBe(false);
    controller.change({ title: 'Edited title', hidden: 'must not leave browser' });
    await controller.submit('save');
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'save',
        data: { title: 'Edited title' },
      }),
      expect.any(AbortSignal),
    );
    expect(write.mock.calls[0]?.[0].snapshot.document?.revision).toBe(1);
    expect(controller.store.getState().saved).toBe(true);
  });

  it('regression: late save response preserves edits made after the submitted draft', async () => {
    const pending = deferred<ApiResult<Document>>();
    const next = snapshot({
      document: document({
        revision: 2,
        versionId: nextVersionId,
        data: { title: 'First change' },
      }),
      editor: editor({
        document: { id: documentId, revision: 2, versionId: nextVersionId, trashedAt: null },
      }),
    });
    const load = vi
      .fn<Options['load']>()
      .mockResolvedValueOnce(success(snapshot()))
      .mockResolvedValue(success(next));
    const { controller } = setup({ load, write: () => pending.promise });
    await controller.start();
    controller.change({ title: 'First change' });
    const saving = controller.submit('save');
    controller.change({ title: 'Later unsaved change' });
    pending.resolve(success(next.document ?? document()));
    await saving;
    expect(controller.store.getState().value).toEqual({ title: 'Later unsaved change' });
    expect(controller.store.getState().snapshot?.document?.revision).toBe(2);
    expect(editorDirty(controller.store.getState())).toBe(true);
  });

  it('does not overlap manual save, autosave, and publication on one revision', async () => {
    const pending = deferred<ApiResult<Document>>();
    const write = vi.fn<Options['write']>(() => pending.promise);
    const { controller } = setup({ write });
    await controller.start();
    controller.change({ title: 'Changed' });
    const saving = controller.submit('save');
    await controller.submit('autosave');
    await controller.submit('publish');
    expect(write).toHaveBeenCalledTimes(1);
    pending.resolve(success(document()));
    await saving;
  });

  it('regression: external replacement and image processing keep all document writes occupied', async () => {
    const { controller, write } = setup();
    await controller.start();
    controller.setExternalBusy(true);
    controller.change({ title: 'Local edits during processing' });
    await controller.submit('save');
    expect(write).not.toHaveBeenCalled();
    controller.setExternalBusy(false);
    await controller.submit('save');
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('regression: invalid text remains dirty and cannot silently save the last parsed value', async () => {
    const { controller, write } = setup();
    await controller.start();
    controller.validity('json-field', 'Invalid JSON');
    expect(editorDirty(controller.store.getState())).toBe(true);
    await controller.submit('save');
    expect(write).not.toHaveBeenCalled();
    controller.validity('json-field', null);
    expect(editorDirty(controller.store.getState())).toBe(false);
  });

  it('regression: retrying an unknown write preserves edits made after the original intent', async () => {
    const write = vi
      .fn<Options['write']>()
      .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
      .mockResolvedValue(success(document()));
    const { controller } = setup({ write });
    await controller.start();
    controller.change({ title: 'First intent' });
    await controller.submit('autosave');
    controller.change({ title: 'Further local edits' });
    await controller.submit('publish');
    expect(write).toHaveBeenCalledTimes(1);
    await controller.retry();
    const [first] = write.mock.calls[0] ?? [];
    const [second] = write.mock.calls[1] ?? [];
    expect(second).toEqual(first);
    expect(controller.store.getState().value).toEqual({ title: 'Further local edits' });
  });

  it('keeps a CAS-conflicting draft separate until the user explicitly rebases', async () => {
    const latest = snapshot({
      document: document({ revision: 4, data: { title: 'Other administrator' } }),
    });
    const load = vi
      .fn<Options['load']>()
      .mockResolvedValueOnce(success(snapshot()))
      .mockResolvedValue(success(latest));
    const write = vi.fn<Options['write']>().mockResolvedValue(failure('version_conflict', 409));
    const { controller } = setup({ load, write });
    await controller.start();
    controller.change({ title: 'My draft' });
    await controller.submit('save');
    expect(controller.store.getState().value).toEqual({ title: 'My draft' });
    expect(controller.store.getState().latest?.document?.revision).toBe(4);
    await controller.submit('save');
    await controller.rebaseCurrent();
    expect(controller.store.getState().snapshot?.document?.revision).toBe(4);
    expect(controller.store.getState().value).toEqual({ title: 'My draft' });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('adopting current data discards a conflicting draft only after explicit selection', async () => {
    const latest = snapshot({ document: document({ revision: 3, data: { title: 'Latest' } }) });
    const load = vi
      .fn<Options['load']>()
      .mockResolvedValueOnce(success(snapshot()))
      .mockResolvedValue(success(latest));
    const { controller } = setup({
      load,
      write: () => Promise.resolve(failure('version_conflict', 409)),
    });
    await controller.start();
    controller.change({ title: 'Old draft' });
    await controller.submit('save');
    await controller.adoptCurrent();
    expect(controller.store.getState().value).toEqual({ title: 'Latest' });
    expect(editorDirty(controller.store.getState())).toBe(false);
  });

  it('creates a document with a ready upload and navigates to the returned identity', async () => {
    const fresh = snapshot({
      document: null,
      editor: editor({ intent: 'create', document: null }),
    });
    const load = vi
      .fn<Options['load']>()
      .mockResolvedValueOnce(success(fresh))
      .mockResolvedValue(success(snapshot()));
    const { controller, write, onCreated } = setup({
      target: { collection: 'articles', id: null, locale: 'en', intent: 'create' },
      load,
    });
    await controller.start();
    controller.change({ title: 'New file' });
    controller.setUpload(folderId);
    await controller.submit('save');
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({ uploadId: folderId }),
      expect.any(AbortSignal),
    );
    expect(controller.store.getState().uploadId).toBeNull();
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: documentId }));
  });

  it('does not resend a consumed upload when later text edits survive the write', async () => {
    const pending = deferred<ApiResult<Document>>();
    const { controller } = setup({ write: () => pending.promise });
    await controller.start();
    controller.setUpload(folderId);
    const saving = controller.submit('save');
    controller.change({ title: 'Later' });
    pending.resolve(success(document()));
    await saving;
    expect(controller.store.getState().uploadId).toBeNull();
    expect(controller.store.getState().value).toEqual({ title: 'Later' });
  });

  it('requires saving local edits before copy, publish, archive, or full-history restore', async () => {
    const { controller, write } = setup();
    await controller.start();
    controller.change({ title: 'Unsaved' });
    await controller.copy({ en: { title: 'Copy' } });
    for (const action of ['publish', 'archive', 'restore'] as const)
      await controller.submit(action, versionId);
    expect(write).not.toHaveBeenCalled();
    expect(controller.store.getState().failure?.error.code).toBe('unsaved_changes');
  });

  it.each(['publish', 'unpublish', 'restore'] as const)(
    'refreshes metadata and the document after %s',
    async (action) => {
      const { controller, load, write } = setup();
      await controller.start();
      await controller.submit(action, versionId);
      expect(write).toHaveBeenCalledWith(
        expect.objectContaining({ action, versionId }),
        expect.any(AbortSignal),
      );
      expect(load).toHaveBeenCalledTimes(2);
    },
  );

  it('copy returns the new identity and archive returns to the trash list', async () => {
    const first = setup();
    await first.controller.start();
    await first.controller.copy({ en: { title: 'Copy' } });
    expect(first.onCreated).toHaveBeenCalledOnce();
    const second = setup();
    await second.controller.start();
    await second.controller.submit('archive');
    expect(second.onArchived).toHaveBeenCalledOnce();
  });

  it('does not save an unchanged document but does save an explicit folder move', async () => {
    const { controller, write } = setup();
    await controller.start();
    await controller.submit('save');
    expect(write).not.toHaveBeenCalled();
    controller.setFolder(folderId);
    await controller.submit('save');
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({ folderId, data: {} }),
      expect.any(AbortSignal),
    );
  });

  it('regression: failed metadata refresh blocks writes instead of pairing old layout with new revision', async () => {
    const load = vi
      .fn<Options['load']>()
      .mockResolvedValueOnce(success(snapshot()))
      .mockResolvedValue(failure('request_failed', 503));
    const { controller, write } = setup({ load });
    await controller.start();
    controller.change({ title: 'Draft' });
    await controller.submit('save');
    controller.change({ title: 'Another edit' });
    await controller.submit('save');
    expect(write).toHaveBeenCalledTimes(1);
    expect(controller.store.getState().phase).toBe('failed');
  });

  it('reports loading errors without manufacturing an editor snapshot', async () => {
    const { controller } = setup({ load: () => Promise.resolve(failure('forbidden', 403)) });
    await controller.start();
    expect(controller.store.getState()).toMatchObject({
      phase: 'failed',
      snapshot: null,
      busy: false,
    });
    await controller.readCurrent();
    await controller.adoptCurrent();
    await controller.rebaseCurrent();
    await controller.retry();
  });

  it('regression: disposing during the post-save refresh aborts the outstanding request', async () => {
    const pending = deferred<ApiResult<ReturnType<typeof snapshot>>>();
    const signals: AbortSignal[] = [];
    let reads = 0;
    const { controller } = setup({
      load: async (_target, signal) => {
        signals.push(signal);
        reads += 1;
        return reads === 1 ? success(snapshot()) : pending.promise;
      },
    });
    await controller.start();
    controller.change({ title: 'Changed' });
    const saving = controller.submit('save');
    await vi.waitFor(() => expect(signals).toHaveLength(2));
    controller.dispose();
    expect(signals[1]?.aborted).toBe(true);
    pending.resolve(success(snapshot()));
    await saving;
    expect(controller.store.getState().saved).toBe(false);
  });

  it('can restart after React strict lifecycle cleanup without retaining cancelled work', async () => {
    const { controller } = setup();
    await controller.start();
    controller.dispose();
    await controller.start();
    expect(controller.store.getState().phase).toBe('ready');
  });
});
