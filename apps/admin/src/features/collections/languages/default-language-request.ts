import { requestApi } from '../../../api/client';
import { failure } from '../../../api/result';
import { documentPageSchema, documentSchema } from '../../../contracts/documents';
import type { Document } from '../../../contracts/documents';
export interface DefaultLanguageIntent {
  expectedDefaultCode: string;
  key: string;
}
export async function readDefaultLanguage(signal: AbortSignal) {
  const result = await requestApi({
    operation: 'documents.list',
    params: { collection: 'languages' },
    query: { pageSize: 1, where: { field: 'default', operator: 'eq', value: true } },
    response: documentPageSchema,
    signal,
  });
  if (!result.ok) return result;
  const [row] = result.data.rows;
  if (
    result.data.total !== 1 ||
    row?.collection !== 'languages' ||
    row.data['enabled'] !== true ||
    row.data['default'] !== true ||
    typeof row.data['code'] !== 'string'
  )
    return failure('invalid_response', 502);
  return { ...result, data: row.data['code'] };
}
export function requestDefaultLanguage(
  document: Document,
  intent: DefaultLanguageIntent,
  signal: AbortSignal,
) {
  return requestApi({
    operation: 'languages.setDefault',
    params: { collection: 'languages', id: document.id },
    body: { revision: document.revision, expectedDefaultCode: intent.expectedDefaultCode },
    idempotencyKey: intent.key,
    response: documentSchema,
    signal,
  });
}
