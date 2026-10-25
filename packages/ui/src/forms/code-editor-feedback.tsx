import { Button } from '../primitives/button.tsx';
import { Spinner } from '../feedback/status.tsx';
import type { CodeEditorProps } from './code-editor-types.ts';

export function CodeEditorLoading({
  loadingLabel,
  minHeight,
}: Pick<CodeEditorProps, 'loadingLabel' | 'minHeight'>) {
  return (
    <div
      role="status"
      style={{ minHeight }}
      className="flex items-center justify-center gap-2 bg-muted/30 text-sm text-muted-foreground"
    >
      <Spinner />
      {loadingLabel}
    </div>
  );
}

export function CodeEditorFailure({
  errorLabel,
  retryLabel,
  onRetry,
}: Pick<CodeEditorProps, 'errorLabel' | 'retryLabel' | 'onRetry'>) {
  return (
    <div className="grid gap-3 p-4">
      <p role="alert" className="text-sm text-destructive">
        {errorLabel}
      </p>
      <Button variant="outline" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}
