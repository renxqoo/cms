import type { JobDetail } from '../../contracts/jobs';
import type { UploadSession } from '../../contracts/assets';
import { WorkValues, workTime } from './work-values';
import { workMessages, workStatus } from './messages';

type Detail = JobDetail | UploadSession;

export function WorkDetailValues({
  detail,
  locale,
}: {
  detail: Detail | null;
  locale: 'en' | 'zh';
}) {
  const t = workMessages[locale];
  if (!detail) return null;
  if ('kind' in detail) return <ContentValues detail={detail} locale={locale} />;
  if ('filename' in detail)
    return (
      <WorkValues
        values={[
          [t.filename, detail.filename],
          [t.purpose, t[detail.purpose]],
          [t.mime, detail.declaredMimeType],
          [t.bytes, detail.declaredBytes],
          [t.document, detail.documentId],
          [t.revision, detail.revision],
          [t.created, workTime(detail.createdAt, locale)],
          [t.expires, workTime(detail.expiresAt, locale)],
          [t.failureCode, detail.failureCode],
        ]}
      />
    );
  return (
    <WorkValues
      values={[
        [t.action, t[detail.action]],
        [t.attempts, detail.attempts],
        [t.upload, detail.uploadId],
        [t.failureCode, detail.failureCode],
      ]}
    />
  );
}

function ContentValues({
  detail,
  locale,
}: {
  detail: Extract<JobDetail, { kind: 'content' }>;
  locale: 'en' | 'zh';
}) {
  const t = workMessages[locale];
  return (
    <>
      <WorkValues
        values={[
          [t.action, detail.publicationAction ? t[detail.publicationAction] : t[detail.action]],
          ...(detail.locale ? [[t.locale, detail.locale] as const] : []),
          [t.document, detail.documentId],
          [t.revision, detail.expectedRevision],
          [t.version, detail.requestedVersionId],
          [t.executeAt, workTime(detail.executeAt, locale)],
          [t.created, workTime(detail.createdAt, locale)],
          [t.finished, workTime(detail.finishedAt, locale)],
          [t.total, detail.total],
          [t.succeeded, detail.succeeded],
          [t.failed, detail.failed],
        ]}
      />
      <ol className="max-h-64 space-y-3 overflow-auto" aria-label={t.total}>
        {detail.items.map((item) => (
          <li key={item.position} className="rounded-lg border p-3">
            <WorkValues
              values={[
                [t.position, item.position + 1],
                [t.document, item.id],
                [t.status, workStatus(item.status, t)],
                [t.resultId, item.resultId],
                [t.versionId, item.versionId],
                [t.failureCode, item.error?.code],
              ]}
            />
          </li>
        ))}
      </ol>
    </>
  );
}
