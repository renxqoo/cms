import { writeContentArtifacts } from './content-artifacts.ts';
import { readFile } from 'node:fs/promises';
import { parseGenerationCommand } from './content-migration.ts';

async function main(): Promise<void> {
  const { check, migration, reviewedPath } = parseGenerationCommand(process.argv.slice(2));
  const reviewedSql = reviewedPath === undefined ? undefined : await readFile(reviewedPath, 'utf8');
  await writeContentArtifacts({
    root: process.cwd(),
    check,
    ...(migration ? { migration } : {}),
    ...(reviewedSql === undefined ? {} : { reviewedSql }),
  });
  process.stdout.write(
    check
      ? 'Content artifacts verified.\n'
      : 'Content artifacts generated. Review schema and migrations before applying.\n',
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(
    error instanceof Error ? `${error.message}\n` : 'Content generation failed.\n',
  );
  process.exitCode = 1;
});
