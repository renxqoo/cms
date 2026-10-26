import { createHash, randomBytes } from 'node:crypto';

export function tokenDigest(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}
