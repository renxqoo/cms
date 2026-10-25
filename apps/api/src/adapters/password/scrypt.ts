import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { PasswordHasher } from '@new-cms/cms/identity/composition';
import { createPasswordExecutor } from './executor.ts';

export interface ScryptSettings {
  N: number;
  r: number;
  p: number;
  saltBytes: number;
  keyBytes: number;
  maxmemBytes: number;
}

interface EncodedHash {
  salt: Buffer;
  key: Buffer;
}

function derive(input: {
  password: string;
  salt: Buffer;
  settings: ScryptSettings;
}): Promise<Buffer> {
  const { password, salt, settings } = input;
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      settings.keyBytes,
      { N: settings.N, r: settings.r, p: settings.p, maxmem: settings.maxmemBytes },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

function decode(value: string | null, settings: ScryptSettings): EncodedHash | null {
  if (value === null || value.length > 512) return null;
  const parts = value.split('$');
  const [name, n, r, p, saltText, keyText] = parts;
  if (parts.length !== 6) return null;
  if (
    name !== 'scrypt' ||
    n !== String(settings.N) ||
    r !== String(settings.r) ||
    p !== String(settings.p) ||
    !saltText ||
    !keyText
  )
    return null;
  const salt = decodePart(saltText, settings.saltBytes);
  const key = decodePart(keyText, settings.keyBytes);
  return salt && key ? { salt, key } : null;
}

function decodePart(value: string, size: number): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== size || decoded.toString('base64url') !== value) return null;
  return decoded;
}

function checkSettings(settings: ScryptSettings): void {
  if (
    settings.N !== 32768 ||
    settings.r !== 8 ||
    settings.p !== 3 ||
    settings.saltBytes !== 16 ||
    settings.keyBytes !== 64 ||
    settings.maxmemBytes < 64 * 1024 * 1024
  )
    fail('invalid_input');
}

export function createScryptPasswords(options: {
  policy: CmsPolicy;
  settings: ScryptSettings;
}): PasswordHasher {
  const { policy, settings } = options;
  checkSettings(settings);
  const executor = createPasswordExecutor(policy);
  const dummy = { salt: randomBytes(settings.saltBytes), key: randomBytes(settings.keyBytes) };
  async function hash(password: string, signal?: AbortSignal): Promise<string> {
    return executor.run(async () => {
      const salt = randomBytes(settings.saltBytes);
      const key = await derive({ password, salt, settings });
      return [
        'scrypt',
        settings.N,
        settings.r,
        settings.p,
        salt.toString('base64url'),
        key.toString('base64url'),
      ].join('$');
    }, signal);
  }
  async function verify(
    password: string,
    value: string | null,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const parsed = decode(value, settings);
    const selected = parsed ?? dummy;
    return executor.run(async () => {
      const key = await derive({ password, salt: selected.salt, settings });
      return timingSafeEqual(key, selected.key) && parsed !== null;
    }, signal);
  }
  return { hash, verify, close: executor.close };
}
