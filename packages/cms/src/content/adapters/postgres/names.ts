import { createHash } from 'node:crypto';
export function physicalName(prefix: string, identity: string): string {
  return `${prefix}_${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
}
