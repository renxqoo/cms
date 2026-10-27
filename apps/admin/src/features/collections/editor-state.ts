import type { ContentEditorState } from './editor-controller';

export function initialEditorState(): ContentEditorState {
  return {
    phase: 'loading',
    visibility: {},
    componentProps: {},
    choiceOptions: {},
    previewFailure: null,
    previewBusy: false,
    snapshot: null,
    value: {},
    errors: {},
    folderId: null,
    uploadId: null,
    busy: false,
    externalBusy: false,
    failure: null,
    pending: null,
    latest: null,
    saved: false,
    generation: 0,
    resetEpoch: 0,
  };
}
