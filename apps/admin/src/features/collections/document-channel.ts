import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import { failure } from '../../api/result';
import { writablePatch } from '../fields/writable-data';
import type { FieldData } from '../fields/types';
import {
  actionAllowed,
  documentDirty,
  mergeEditorPatch,
  fieldData,
  sameRevision,
  initialChannelState,
  failedWriteState,
  snapshotIdentityMatches,
  olderSnapshot,
} from './channel-data';
import { verifyDocumentState } from './verify-document-state';
import type { DocumentVerification } from './verify-document-state';
import type { Document } from '../../contracts/content';
import { commandOperation, makeWriteIntent, retainWriteIntent } from './write-intent';
import { contentPolicy } from './content-policy';
import type {
  DocumentChannel,
  DocumentChannelInput,
  DocumentChannelState,
  DocumentCommand,
  WriteIntent,
} from './channel-types';
import type { EditorSnapshot } from './read-editor';
import { commandExecutable, autosaveReady, canEditDraft, channelReadable } from './channel-policy';
import { selectDocumentUpload } from './document-upload-selection';
import { beginAssetWrite } from './document-asset-lease';
import type { AssetWriteKind } from '../assets/document-asset-types';
import { performDocumentWrite } from './perform-document-write';

class DocumentController implements DocumentChannel {
  private store: StoreApi<DocumentChannelState>;
  private get state() {
    return this.store.getState();
  }
  private disposed = false;
  private active: AbortController | null = null;
  private intent: WriteIntent | null = null;
  private confirmedTarget: string | undefined;
  private confirmedWrite = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private input: DocumentChannelInput) {
    this.store = createStore<DocumentChannelState>(() => initialChannelState(input.initial));
  }
  getSnapshot = () => this.store.getState();
  subscribe = (listener: () => void) => this.store.subscribe(listener);
  configure(input: Omit<DocumentChannelInput, 'initial'>) {
    this.input = { ...this.input, ...input };
    const { pending } = this.state;
    if (
      pending?.source === 'asset' &&
      !this.allowed(pending.kind === 'replace' ? 'documents.update' : 'assets.reprocess')
    )
      this.update((state) =>
        state.phase === 'blocked' &&
        state.error?.status === 403 &&
        state.error.error.code === 'forbidden'
          ? state
          : { ...state, phase: 'blocked', error: failure('forbidden', 403) },
      );
    if (!this.autosaveReady()) {
      clearTimeout(this.timer);
      this.timer = undefined;
    } else if (this.timer === undefined) this.scheduleAutosave();
  }
  private update = (change: (value: DocumentChannelState) => DocumentChannelState) => {
    if (!this.disposed) this.store.setState(change, true);
  };
  private allowed(operation: string) {
    return (
      !this.disposed &&
      channelReadable(this.input.can) &&
      (operation === 'assets.reprocess'
        ? this.input.can(operation)
        : actionAllowed(this.state, operation, this.input.can))
    );
  }
  private scheduleAutosave() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.autosaveReady()) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.execute({ kind: 'autosave' });
    }, contentPolicy.autosaveDelayMs);
  }
  private autosaveReady() {
    return !this.disposed && autosaveReady(this.state, this.allowed('documents.autosave'));
  }

  private acquire = (
    phase: 'writing' | 'checking' = 'writing',
    pending: DocumentChannelState['pending'] = null,
  ) => {
    if (this.disposed || this.active || this.state.phase !== 'idle') return null;
    clearTimeout(this.timer);
    this.active = new AbortController();
    this.update((state) => ({
      ...state,
      phase,
      pending,
      error: null,
      inspectionError: null,
      success: false,
      remote: null,
    }));
    return this.active;
  };
  private accept(snapshot: EditorSnapshot, submitted: WriteIntent | null, receipt: unknown = null) {
    const preserve = submitted && this.state.generation !== submitted.generation;
    const changes = preserve
      ? writablePatch(submitted.snapshot.editor.layout, submitted.draft, this.state.draft)
      : {};
    const draft = mergeEditorPatch(snapshot.editor.layout, fieldData(snapshot), changes);
    this.update((state) => ({
      ...state,
      snapshot,
      draft,
      phase: 'idle',
      pending: null,
      error: null,
      inspectionError: null,
      remote: null,
      success: true,
      reset: preserve ? state.reset : state.reset + 1,
      receipt,
      completion: state.completion + (submitted ? 1 : 0),
    }));
    this.active = null;
    this.intent = null;
    this.confirmedTarget = undefined;
    this.confirmedWrite = false;
    this.scheduleAutosave();
  }
  private live(controller: AbortController) {
    return !this.disposed && !controller.signal.aborted && this.active === controller;
  }
  private async send(controller: AbortController, submitted: WriteIntent) {
    const result = await performDocumentWrite({
      intent: submitted,
      signal: controller.signal,
      load: this.input.load,
      report: this.input.report,
    });
    if (!this.live(controller) || result.kind === 'cancelled') return;
    if (result.kind === 'failed') {
      this.active = null;
      this.confirmedWrite = result.confirmed;
      this.confirmedTarget = result.target;
      this.update((state) => failedWriteState(state, result.error));
      return;
    }
    if (result.kind === 'archived') {
      this.completeArchive(result.document);
      return;
    }
    this.accept(result.snapshot, submitted, result.receipt);
    if (result.createdId) this.input.created(result.createdId);
  }

  observe(snapshot: EditorSnapshot) {
    if (
      this.disposed ||
      this.active ||
      snapshot === this.state.snapshot ||
      this.state.phase === 'blocked' ||
      this.state.phase === 'checking'
    )
      return;
    if (olderSnapshot(snapshot, this.state.snapshot)) return;
    if (!snapshotIdentityMatches(snapshot, this.state.snapshot)) {
      this.update((state) => ({
        ...state,
        phase: 'blocked',
        error: failure('version_conflict', 409),
      }));
      return;
    }
    if (!documentDirty(this.state)) {
      this.accept(snapshot, null);
      return;
    }
    if (sameRevision(snapshot, this.state.snapshot))
      this.update((state) => ({ ...state, snapshot }));
    else this.update((state) => ({ ...state, remote: snapshot, phase: 'blocked' }));
  }
  edit = (draft: FieldData) => {
    if (this.disposed || !canEditDraft(this.state)) return;
    this.update((state) => ({ ...state, draft, generation: state.generation + 1, success: false }));
    this.scheduleAutosave();
  };
  validity = (identity: string, error: string | null) => {
    if ((this.state.invalid[identity] ?? null) === error) return;
    this.update((state) => ({
      ...state,
      invalid:
        error === null
          ? Object.fromEntries(Object.entries(state.invalid).filter(([key]) => key !== identity))
          : { ...state.invalid, [identity]: error },
    }));
    this.scheduleAutosave();
  };
  setUploadActivity(active: boolean) {
    if (this.state.uploading !== active) this.update((state) => ({ ...state, uploading: active }));
  }
  async selectUpload(id: string) {
    if (!this.allowed('documents.create') || !this.input.can('assets.readUpload')) return;
    await selectDocumentUpload({
      id,
      acquire: () => this.acquire('checking'),
      state: this.getSnapshot,
      live: (controller) => this.live(controller),
      update: this.update,
      report: this.input.report,
      release: (controller) => {
        if (this.active === controller) this.active = null;
      },
    });
  }
  clearUpload(id: string) {
    if (
      !this.active &&
      this.state.snapshot.document === null &&
      this.state.snapshot.upload?.id === id
    )
      this.update((state) => ({ ...state, snapshot: { ...state.snapshot, upload: null } }));
  }
  setAutosave(enabled: boolean) {
    this.update((state) => ({ ...state, autosave: enabled }));
    this.scheduleAutosave();
  }
  async execute(command: DocumentCommand) {
    const operation = commandOperation(this.state, command);
    if (!commandExecutable(this.state, command, this.allowed(operation))) return;
    const next = retainWriteIntent(this.intent, makeWriteIntent(this.state, command));
    const controller = this.acquire('writing', {
      source: 'document',
      operation: next.operation,
      kind: command.kind,
      retryable: next.key !== undefined,
    });
    if (!controller) return;
    this.intent = next;
    await this.send(controller, next);
  }

  async retry() {
    if (
      this.disposed ||
      this.active ||
      this.state.phase !== 'blocked' ||
      !this.intent?.key ||
      !this.allowed(this.intent.operation)
    )
      return;
    const next = this.intent;
    this.active = new AbortController();
    this.update((state) => ({ ...state, phase: 'writing', error: null }));
    await this.send(this.active, next);
  }
  async inspect() {
    if (!this.readable()) return;
    const id = this.confirmedTarget ?? this.state.snapshot.document?.id;
    if (!id) return;
    const controller = new AbortController();
    this.active = controller;
    this.update((state) => ({ ...state, phase: 'checking', inspectionError: null }));
    const result = await verifyDocumentState({
      state: this.state,
      intent: this.intent,
      confirmedWrite: this.confirmedWrite,
      target: id,
      signal: controller.signal,
      load: this.input.load,
      can: this.input.can,
    });
    if (!this.live(controller)) return;
    this.active = null;
    this.input.report(result);
    if (!result.ok) {
      this.update((state) => ({ ...state, phase: 'blocked', inspectionError: result }));
      return;
    }
    this.acceptInspection(result.data);
  }

  private readable() {
    return !this.disposed && !this.active && channelReadable(this.input.can);
  }
  private acceptInspection(result: DocumentVerification) {
    if (result.kind === 'archived') {
      this.completeArchive(result.document);
      return;
    }
    if (result.matches) {
      this.accept(result.snapshot, this.intent);
      if (result.createdId) this.input.created(result.createdId);
    } else this.update((state) => ({ ...state, phase: 'blocked', remote: result.snapshot }));
  }
  private completeArchive(document: Document) {
    this.update((state) => ({
      ...state,
      snapshot: { ...state.snapshot, document },
      draft: document.data,
      phase: 'idle',
      success: true,
      error: null,
      inspectionError: null,
      remote: null,
    }));
    this.active = null;
    this.intent = null;
    this.input.archived();
  }

  rebase(discard: boolean) {
    if (this.disposed || this.active || !this.state.remote) return;
    const { remote } = this.state;
    const patch = discard
      ? {}
      : writablePatch(
          this.state.snapshot.editor.layout,
          this.state.snapshot.document?.data ?? {},
          this.state.draft,
        );
    this.intent = null;
    this.confirmedWrite = false;
    this.confirmedTarget = undefined;
    this.update((state) => ({
      ...state,
      snapshot: remote,
      draft: mergeEditorPatch(remote.editor.layout, fieldData(remote), patch),
      reset: state.reset + 1,
      phase: 'idle',
      error: null,
      inspectionError: null,
      remote: null,
      success: false,
      invalid: {},
    }));
    this.scheduleAutosave();
  }
  beginAsset(kind: AssetWriteKind) {
    if (
      !this.state.snapshot.document ||
      !this.allowed(kind === 'replace' ? 'documents.update' : 'assets.reprocess')
    )
      return null;
    return beginAssetWrite({
      kind,
      acquire: () => this.acquire('writing', { source: 'asset', kind }),
      current: this.getSnapshot,
      update: this.update,
      load: this.input.load,
      report: this.input.report,
      release: (controller, outcome) => {
        if (this.active !== controller) return;
        if (outcome === 'blocked') {
          this.update((state) => ({ ...state, phase: 'blocked' }));
          return;
        }
        this.active = null;
        controller.abort();
        this.update((state) => ({
          ...state,
          phase: outcome === 'confirmed' ? 'idle' : 'blocked',
          pending: outcome === 'confirmed' ? null : state.pending,
        }));
        if (outcome === 'confirmed') this.scheduleAutosave();
      },
      disposed: () => this.disposed,
      allowed: () => this.allowed(kind === 'replace' ? 'documents.update' : 'assets.reprocess'),
      readable: () => !this.disposed && channelReadable(this.input.can),
    });
  }
  activate() {
    this.disposed = false;
    this.scheduleAutosave();
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.active)
      this.store.setState(
        {
          ...this.state,
          phase: 'blocked',
          error: failure('request_cancelled', 0, { uncertain: this.state.phase === 'writing' }),
        },
        true,
      );
    this.active?.abort();
    this.active = null;
  }
}
export function createDocumentChannel(input: DocumentChannelInput): DocumentChannel {
  return new DocumentController(input);
}
