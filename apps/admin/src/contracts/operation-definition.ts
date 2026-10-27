export interface OperationDefinition {
  id: string;
  target: 'backend' | 'frontend';
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  access: 'public' | 'protected';
  bodyKind: 'none' | 'json' | 'bytes';
  queryKeys: readonly string[];
  idempotency: 'required' | 'none';
  responseKind: 'json' | 'empty' | 'stream';
}

export function defineOperation<const Id extends string>(
  id: Id,
  route: readonly [OperationDefinition['method'], string],
  options: Partial<Omit<OperationDefinition, 'id' | 'method' | 'path'>> = {},
): OperationDefinition & { id: Id } {
  const [method, path] = route;
  return {
    id,
    target: 'backend',
    method,
    path,
    access: 'protected',
    bodyKind: method === 'GET' || method === 'DELETE' ? 'none' : 'json',
    queryKeys: [],
    idempotency: 'none',
    responseKind: 'json',
    ...options,
  };
}
