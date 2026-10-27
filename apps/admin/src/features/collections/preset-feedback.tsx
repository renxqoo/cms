'use client';
import { Button } from '@new-cms/ui/actions';
import type { Collection } from '../../contracts/content';
import { queryPresetPageSchema } from '../../contracts/query-presets';
import { useShell } from '../../components/shell/shell-provider';
import { ManagementFeedback } from '../management-shared/feedback';
import type { useContentMutation } from './use-content-mutation';
import { queryMessages } from './query-messages';
export function PresetFeedback({
  mutation,
  collection,
  reload,
  contentLocale,
}: {
  mutation: ReturnType<typeof useContentMutation>;
  collection: Collection;
  reload: () => void;
  contentLocale: string;
}) {
  const locale = useShell((state) => state.locale);
  const t = queryMessages[locale];
  return (
    <>
      <ManagementFeedback
        error={mutation.error}
        {...(mutation.replayable ? { onRetry: mutation.retry } : {})}
      />
      {mutation.locked ? (
        <Button
          variant="outline"
          disabled={mutation.pending}
          onClick={() =>
            void mutation.verify(
              {
                operation: 'queryPresets.list',
                params: { collection: collection.key },
                query: { page: 1, pageSize: 20, locale: contentLocale },
                response: queryPresetPageSchema,
              },
              () => {
                mutation.resolve();
                reload();
              },
            )
          }
        >
          {t.refresh}
        </Button>
      ) : null}
    </>
  );
}
