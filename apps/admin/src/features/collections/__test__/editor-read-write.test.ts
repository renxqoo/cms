import { beforeEach, expect, it, vi } from 'vitest';
import { requestApi } from '../../../api/client';
import { failure } from '../../../api/result';
import { matchingEditor, readEditor, readArchivedDocument } from '../editor-read';
import { writeEditor } from '../editor-write';
import type { EditorWrite } from '../editor-controller';
import {
  catalog,
  document,
  documentId,
  editor,
  folderId,
  nextVersionId,
  snapshot,
  success,
  versionId,
} from './support';

vi.mock('../../../api/client', () => ({ requestApi: vi.fn<typeof requestApi>() }));
const request = vi.mocked(requestApi);
const target = { collection: 'articles', id: documentId, locale: 'en', intent: 'update' } as const;
beforeEach(() => {
  request.mockReset();
});

it('pairs catalog, safe write metadata, and no-fallback depth-zero document reads', async () => {
  request
    .mockResolvedValueOnce(success(catalog()))
    .mockResolvedValueOnce(success(editor()))
    .mockResolvedValueOnce(success(document()));
  const result = await readEditor(target, new AbortController().signal);
  expect(result.ok).toBe(true);
  expect(request.mock.calls[1]?.[0].query).toEqual({
    intent: 'update',
    id: documentId,
    locale: 'en',
    mode: 'editing',
  });
  expect(request.mock.calls[2]?.[0].query).toEqual({
    locale: 'en',
    fallback: [],
    depth: 0,
    mode: 'editing',
  });
});

it('requests read intent with explicit no-fallback but does not reject a legitimate write fallback chain', async () => {
  expect(matchingEditor(snapshot(), target)).toBe(true);
  request
    .mockResolvedValueOnce(success(catalog()))
    .mockResolvedValueOnce(success(editor({ intent: 'read', fallback: [] })))
    .mockResolvedValueOnce(success(document()));
  expect((await readEditor({ ...target, intent: 'read' }, new AbortController().signal)).ok).toBe(
    true,
  );
  expect(request.mock.calls[1]?.[0].query).toEqual({
    intent: 'read',
    id: documentId,
    locale: 'en',
    mode: 'editing',
    fallback: [],
  });
});

it('retries an interleaved metadata revision once and rejects persistent mismatches', async () => {
  for (let index = 0; index < 2; index += 1)
    request
      .mockResolvedValueOnce(success(catalog()))
      .mockResolvedValueOnce(success(editor()))
      .mockResolvedValueOnce(success(document({ revision: 2 })));
  expect(await readEditor(target, new AbortController().signal)).toMatchObject({
    ok: false,
    status: 409,
  });
  expect(request).toHaveBeenCalledTimes(6);
});

it('recovers when a second paired read sees a stable revision', async () => {
  request
    .mockResolvedValueOnce(success(catalog()))
    .mockResolvedValueOnce(success(editor()))
    .mockResolvedValueOnce(success(document({ versionId: nextVersionId })))
    .mockResolvedValueOnce(success(catalog()))
    .mockResolvedValueOnce(success(editor()))
    .mockResolvedValueOnce(success(document()));
  expect((await readEditor(target, new AbortController().signal)).ok).toBe(true);
});

it.each(['schemaVersion', 'behaviorHash', 'mappingFingerprint'] as const)(
  'refuses a stale %s before writes can be enabled',
  (field) => {
    const value = snapshot();
    expect(
      matchingEditor(
        {
          ...value,
          collection: { ...value.collection, [field]: field === 'schemaVersion' ? 2 : 'different' },
        },
        target,
      ),
    ).toBe(false);
  },
);

it('rejects wrong locale, intent, collection, identity, trash, and missing document', () => {
  expect(matchingEditor(snapshot({ editor: editor({ locale: 'zh-CN' }) }), target)).toBe(false);
  expect(matchingEditor(snapshot({ editor: editor({ intent: 'read' }) }), target)).toBe(false);
  expect(matchingEditor(snapshot({ editor: editor({ collection: 'pages' }) }), target)).toBe(false);
  expect(matchingEditor(snapshot({ document: document({ id: folderId }) }), target)).toBe(false);
  expect(matchingEditor(snapshot({ document: document({ trashedAt: 'time' }) }), target)).toBe(
    false,
  );
  expect(matchingEditor(snapshot({ document: null }), target)).toBe(false);
  expect(
    matchingEditor(snapshot({ editor: editor({ intent: 'read', fallback: ['zh-CN'] }) }), {
      ...target,
      intent: 'read',
    }),
  ).toBe(false);
});

it('loads create metadata without an id and uses the catalog default locale', async () => {
  request
    .mockResolvedValueOnce(success(catalog()))
    .mockResolvedValueOnce(success(editor({ intent: 'create', document: null })));
  expect(
    (
      await readEditor(
        { collection: 'articles', id: null, locale: null, intent: 'create' },
        new AbortController().signal,
      )
    ).ok,
  ).toBe(true);
  expect(request.mock.calls[1]?.[0].query).toEqual({
    intent: 'create',
    mode: 'editing',
  });
  expect(request).toHaveBeenCalledTimes(2);
});

it('regression: omitted locale uses the server-declared default instead of the first supported language', async () => {
  request
    .mockResolvedValueOnce(success(catalog({ locales: ['zh-CN', 'en'] })))
    .mockResolvedValueOnce(success(editor({ intent: 'create', document: null, locale: 'en' })));
  expect(
    (
      await readEditor(
        { collection: 'articles', id: null, locale: null, intent: 'create' },
        new AbortController().signal,
      )
    ).ok,
  ).toBe(true);
  expect(request.mock.calls[1]?.[0].query).not.toHaveProperty('locale');
});

it('regression: a singleton new route discovers its real unfiltered record instead of creating a guessed identity', async () => {
  request
    .mockResolvedValueOnce(success(catalog({ singleton: true })))
    .mockResolvedValueOnce(success({ rows: [document()], total: 1, page: 1, pageSize: 1 }))
    .mockResolvedValueOnce(success(editor({ intent: 'read', fallback: [] })))
    .mockResolvedValueOnce(success(document()));
  const result = await readEditor(
    { collection: 'articles', id: null, locale: 'en', intent: 'create' },
    new AbortController().signal,
  );
  expect(result).toMatchObject({ ok: true, data: { document: { id: documentId } } });
  expect(request.mock.calls[1]?.[0]).toMatchObject({
    operation: 'documents.list',
    query: { page: 1, pageSize: 1, mode: 'editing', fallback: [], depth: 0 },
  });
  expect(request.mock.calls[1]?.[0].query).not.toHaveProperty('q');
  expect(request.mock.calls[2]?.[0].query).toMatchObject({ intent: 'read', id: documentId });
});

it('regression: autosave uses its own field authorization and rejects a patch it cannot fully write', async () => {
  request.mockResolvedValueOnce(success(editor({ intent: 'autosave', layout: [] })));
  const result = await writeEditor(write('autosave'), new AbortController().signal);
  expect(result).toMatchObject({ ok: false, status: 403 });
  expect(request).toHaveBeenCalledOnce();
});

it('does not copy after a changed revision, schema, denied action, or metadata read failure', async () => {
  request.mockResolvedValueOnce(success(editor({ intent: 'copy', mappingFingerprint: 'changed' })));
  expect(await writeEditor(write('copy'), new AbortController().signal)).toMatchObject({
    ok: false,
    status: 409,
  });
  request.mockResolvedValueOnce(
    success(
      editor({ intent: 'copy', actions: [{ operationId: 'documents.copy', state: 'denied' }] }),
    ),
  );
  expect(await writeEditor(write('copy'), new AbortController().signal)).toMatchObject({
    ok: false,
    status: 403,
  });
  request.mockResolvedValueOnce(failure('forbidden', 403));
  expect(await writeEditor(write('copy'), new AbortController().signal)).toMatchObject({
    ok: false,
    status: 403,
  });
  expect(request).toHaveBeenCalledTimes(3);
});

it('does not continue reading after a real catalog, metadata, or document failure', async () => {
  request.mockResolvedValueOnce(failure('forbidden', 403));
  expect(await readEditor(target, new AbortController().signal)).toMatchObject({
    ok: false,
    status: 403,
  });
  request
    .mockResolvedValueOnce(success(catalog()))
    .mockResolvedValueOnce(failure('forbidden', 403))
    .mockResolvedValueOnce(failure('forbidden', 403));
  expect(await readEditor(target, new AbortController().signal)).toMatchObject({
    ok: false,
    status: 403,
  });
  request
    .mockResolvedValueOnce(success(catalog()))
    .mockResolvedValueOnce(success(editor()))
    .mockResolvedValueOnce(failure('not_found', 404));
  expect(await readEditor(target, new AbortController().signal)).toMatchObject({
    ok: false,
    status: 404,
  });
});

it.each([
  ['unauthenticated', 401],
  ['temporarily_unavailable', 503],
  ['invalid_response', 200],
  ['not_found', 503],
] as const)(
  'does not downgrade %s HTTP %s failures into read-only success',
  async (code, status) => {
    request.mockResolvedValueOnce(success(catalog())).mockResolvedValueOnce(failure(code, status));
    expect(await readEditor(target, new AbortController().signal)).toMatchObject({
      ok: false,
      status,
    });
    expect(request).toHaveBeenCalledTimes(2);
  },
);

it.each([403, 404])(
  'reads a safe no-fallback projection after a genuine update denial HTTP %s',
  async (status) => {
    request
      .mockResolvedValueOnce(success(catalog()))
      .mockResolvedValueOnce(failure(status === 403 ? 'forbidden' : 'not_found', status))
      .mockResolvedValueOnce(
        success(
          editor({
            intent: 'read',
            fallback: [],
            actions: [{ operationId: 'documents.update', state: 'denied' }],
          }),
        ),
      )
      .mockResolvedValueOnce(success(document()));
    expect(await readEditor(target, new AbortController().signal)).toMatchObject({
      ok: true,
      data: { editor: { intent: 'read' } },
    });
    expect(request.mock.calls[2]?.[0].query).toMatchObject({
      intent: 'read',
      fallback: [],
      id: documentId,
    });
    expect(request.mock.calls[3]?.[0].query).toMatchObject({ fallback: [], depth: 0 });
  },
);

it('rejects a contradictory read-only fallback instead of presenting a stale editing authorization', async () => {
  request
    .mockResolvedValueOnce(success(catalog()))
    .mockResolvedValueOnce(failure('not_found', 404))
    .mockResolvedValueOnce(success(editor({ intent: 'read', fallback: [] })));
  expect(await readEditor(target, new AbortController().signal)).toMatchObject({
    ok: false,
    status: 409,
  });
  expect(request).toHaveBeenCalledTimes(3);
});

it('cancels without starting a fallback read after the update request is aborted', async () => {
  const controller = new AbortController();
  request.mockResolvedValueOnce(success(catalog())).mockImplementationOnce(() => {
    controller.abort();
    return Promise.resolve(failure('forbidden', 403));
  });
  expect(await readEditor(target, controller.signal)).toMatchObject({ ok: false });
  expect(request).toHaveBeenCalledTimes(2);
});

function write(action: EditorWrite['action'], changes: Partial<EditorWrite> = {}): EditorWrite {
  return {
    action,
    snapshot: snapshot(),
    data: { title: 'Patch' },
    folderId,
    uploadId: null,
    key: folderId,
    generation: 1,
    ...(action === 'copy' ? { dataByLocale: { en: { title: 'Copy title' } } } : {}),
    ...changes,
  };
}

it('writes a new document with explicit locale and consumes the actual ready upload', async () => {
  request.mockResolvedValue(success(document()));
  await writeEditor(
    write('save', { snapshot: snapshot({ document: null }), uploadId: versionId }),
    new AbortController().signal,
  );
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'documents.create',
    params: { collection: 'articles' },
    body: { data: { title: 'Patch' }, locale: 'en', folderId, uploadId: versionId },
    idempotencyKey: folderId,
  });
});

it('sends PATCH folder moves and data using CAS without inventing an idempotency protocol', async () => {
  request.mockResolvedValue(success(document()));
  await writeEditor(write('save'), new AbortController().signal);
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'documents.update',
    body: { revision: 1, locale: 'en', data: { title: 'Patch' }, folderId },
  });
  expect(request.mock.calls[0]?.[0]).not.toHaveProperty('idempotencyKey');
});

it('autosave sends data and a stable intent key without unsupported folder input', async () => {
  request
    .mockResolvedValueOnce(success(editor({ intent: 'autosave' })))
    .mockResolvedValueOnce(success(document()));
  await writeEditor(write('autosave'), new AbortController().signal);
  expect(request.mock.calls[1]?.[0]).toMatchObject({
    operation: 'documents.autosave',
    body: { revision: 1, locale: 'en', data: { title: 'Patch' } },
    idempotencyKey: folderId,
  });
  expect(request.mock.calls[1]?.[0].body).not.toHaveProperty('folderId');
});

it.each([
  ['archive', 'documents.archive'],
  ['unpublish', 'documents.unpublish'],
] as const)('sends %s revision in the DELETE query', async (action, operation) => {
  request.mockResolvedValue(success(document()));
  await writeEditor(write(action), new AbortController().signal);
  expect(request.mock.calls[0]?.[0]).toMatchObject({ operation, query: { revision: 1 } });
  expect(request.mock.calls[0]?.[0]).not.toHaveProperty('body');
});

it.each([
  ['publish', 'documents.publish'],
  ['copy', 'documents.copy'],
] as const)('uses the actual %s action body and required intent', async (action, operation) => {
  if (action === 'copy')
    request
      .mockResolvedValueOnce(success(editor({ intent: 'copy' })))
      .mockResolvedValueOnce(success(document()));
  request.mockResolvedValue(success(document()));
  await writeEditor(write(action), new AbortController().signal);
  expect(request.mock.calls.at(-1)?.[0]).toMatchObject({
    operation,
    idempotencyKey: folderId,
    body: { revision: 1 },
  });
});

it('restores a complete historical version without claiming a single-locale restore', async () => {
  request.mockResolvedValue(success(document()));
  expect(await writeEditor(write('restore'), new AbortController().signal)).toMatchObject({
    ok: false,
    status: 400,
  });
  await writeEditor(write('restore', { versionId }), new AbortController().signal);
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'versions.restore',
    body: { revision: 1, versionId },
    idempotencyKey: folderId,
  });
  expect(request.mock.calls[0]?.[0].body).not.toHaveProperty('locale');
});

it('regression: a required-idempotency replay does not reject its own already-applied revision in a new metadata preflight', async () => {
  request.mockResolvedValueOnce(success(document()));
  const input = write('autosave');
  expect((await writeEditor(input, new AbortController().signal, true)).ok).toBe(true);
  expect(request).toHaveBeenCalledOnce();
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'documents.autosave',
    body: { revision: 1, locale: 'en', data: { title: 'Patch' } },
    idempotencyKey: folderId,
  });
});

it('does not permit the idempotency replay path to resend a non-idempotent update', async () => {
  expect(await writeEditor(write('save'), new AbortController().signal, true)).toMatchObject({
    ok: false,
    status: 400,
  });
  expect(request).not.toHaveBeenCalled();
});

it('reads a specific archived document with the registered trash filter and does not guess a successful result', async () => {
  request.mockResolvedValueOnce(success({ rows: [], total: 0, page: 1, pageSize: 1 }));
  expect(await readArchivedDocument(target, new AbortController().signal)).toMatchObject({
    ok: true,
    data: null,
  });
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'documents.list',
    query: {
      trashed: true,
      page: 1,
      pageSize: 1,
      fallback: [],
      depth: 0,
      where: { field: 'id', operator: 'eq', value: documentId },
    },
  });
});
