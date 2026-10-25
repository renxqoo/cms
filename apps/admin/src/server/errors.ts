import 'server-only';

export class TransportError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super('The request could not be completed.');
  }
}
