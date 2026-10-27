import { Button } from '@new-cms/ui/actions';
import { ManagementFeedback } from '../management-shared/feedback';
import type { failure } from '../../api/result';
import type { useContentMutation } from '../collections/use-content-mutation';
interface RenameStatus {
  mutation: ReturnType<typeof useContentMutation>;
  refreshError: ReturnType<typeof failure> | null;
}
export function RenameFeedback({ mutation, refreshError }: RenameStatus) {
  return (
    <ManagementFeedback
      error={refreshError ?? mutation.error}
      {...(mutation.replayable ? { onRetry: mutation.retry } : {})}
    />
  );
}
export function RenameRecovery(
  props: RenameStatus & { refresh: () => Promise<void>; label: string },
) {
  const { mutation, refreshError } = props;
  if (!refreshError && (!mutation.locked || mutation.replayable)) return null;
  return (
    <Button
      onClick={() => {
        void props.refresh();
      }}
    >
      {props.label}
    </Button>
  );
}
