import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { identityInputSchemas } from '@new-cms/cms/identity';
import { accessInputSchemas } from '@new-cms/cms/access';
import { contentInputSchemas } from '@new-cms/cms/content';
import { assetsInputSchemas } from '@new-cms/cms/assets';
import { applicationOperations } from '../apps/api/src/config/operations.ts';
import { defaultPolicy } from '../apps/api/src/bootstrap/load-config.ts';
import { contentLimits, contentWorkPolicy } from '../apps/api/src/config/content-policy.ts';
import { publicContentInputSchemas } from '../apps/api/src/config/public-content-operations.ts';

const schemas: Record<string, z.ZodType> = {
  ...identityInputSchemas,
  ...accessInputSchemas(defaultPolicy('build-time-schema-only')),
  ...contentInputSchemas({ ...contentLimits(), ...contentWorkPolicy() }),
  ...assetsInputSchemas(defaultPolicy('build-time-schema-only')),
  ...publicContentInputSchemas,
};
const rows = applicationOperations.map((operation) => {
  const schema = schemas[operation.id];
  if (!schema) throw new Error(`Missing input schema: ${operation.id}`);
  return {
    ...operation,
    command: operation.id
      .replaceAll('.', ' ')
      .replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
    tool: operation.id.replaceAll('.', '_'),
    transport: transport(operation.id),
    inputSchema: z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }),
  };
});
const target = new URL('../packages/api-client/src/operations.generated.json', import.meta.url);
const formatted = spawnSync(process.execPath, ['x', 'oxfmt', '--stdin-filepath', target.pathname], {
  input: JSON.stringify(rows),
  encoding: 'utf8',
});
if (formatted.error) throw formatted.error;
if (formatted.status !== 0) throw new Error('API operation formatting failed');
const output = formatted.stdout;
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8')) !== output)
    throw new Error('API client operations have drifted');
} else await writeFile(target, output);

function transport(id: string): string {
  if (id === 'assets.writeUpload') return 'upload';
  if (
    [
      'assets.download',
      'assets.downloadBinding',
      'publicContent.media',
      'previewContent.media',
      'publicContent.index',
      'publicContent.sitemap',
    ].includes(id)
  )
    return 'download';
  return 'json';
}
