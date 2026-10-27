import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { DockerCommand } from './docker-release';
import { sha256File, validateReleaseId } from './release-package';

interface ReleaseWorkspaceOptions {
  outputDirectory: string;
  id: string;
  signal?: AbortSignal;
  build: (directory: string) => Promise<void>;
}

interface VerificationResources {
  container: string;
  image: string;
}

export function releaseArtifactNames(id: string) {
  return ['.tar.gz', '.tar.gz.sha256', '.docker.tar.gz', '.docker.tar.gz.sha256'].map(
    (suffix) => `new-cms-${id}${suffix}`,
  );
}

export async function assertVacantRelease(output: string, id: string) {
  for (const name of releaseArtifactNames(id)) {
    const path = join(output, name);
    if (await lstat(path).catch(() => null)) throw new Error(`Refusing to overwrite ${path}`);
  }
}

async function verifyStagedRelease(stage: string, names: string[]) {
  for (const name of names.filter((file) => !file.endsWith('.sha256'))) {
    const digest = await sha256File(join(stage, name));
    if ((await readFile(join(stage, `${name}.sha256`), 'utf8')) !== `${digest}  ${name}\n`)
      throw new Error(`Staged release checksum mismatch: ${name}`);
  }
}

function throwFailures(errors: unknown[]) {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(
      errors,
      errors.map((error) => (error instanceof Error ? error.message : String(error))).join('; '),
    );
}

export async function runReleaseWorkspace(options: ReleaseWorkspaceOptions) {
  validateReleaseId(options.id);
  options.signal?.throwIfAborted();
  await assertVacantRelease(options.outputDirectory, options.id);
  await mkdir(options.outputDirectory, { recursive: true });
  const stage = await mkdtemp(join(options.outputDirectory, '.release-local-'));
  const published: string[] = [];
  const failures: unknown[] = [];
  let complete = false;
  try {
    await options.build(stage);
    options.signal?.throwIfAborted();
    const names = releaseArtifactNames(options.id);
    await verifyStagedRelease(stage, names);
    for (const name of names) {
      options.signal?.throwIfAborted();
      const target = join(options.outputDirectory, name);
      await copyFile(join(stage, name), target, constants.COPYFILE_EXCL);
      published.push(target);
    }
    options.signal?.throwIfAborted();
    complete = true;
  } catch (error) {
    failures.push(error);
  }
  const cleanups = [
    ...(!complete ? published.map((path) => rm(path, { force: true })) : []),
    rm(stage, { recursive: true, force: true }),
  ];
  for (const result of await Promise.allSettled(cleanups))
    if (result.status === 'rejected') failures.push(result.reason);
  throwFailures(failures);
}

async function removeVerificationDocker(
  runDocker: DockerCommand,
  resources: VerificationResources,
) {
  const failures: unknown[] = [];
  for (const [args, absent] of [
    [['rm', '--force', resources.container], 'No such container'],
    [['image', 'rm', resources.image], 'No such image'],
  ] as const) {
    try {
      await runDocker([...args], { cleanup: true });
    } catch (error) {
      if (!(error instanceof Error && error.message.includes(absent))) failures.push(error);
    }
  }
  return failures;
}

export async function withVerificationDocker<T>(
  runDocker: DockerCommand,
  resources: VerificationResources,
  action: () => Promise<T>,
): Promise<T> {
  let outcome: { value: T } | { error: unknown };
  try {
    outcome = { value: await action() };
  } catch (error) {
    outcome = { error };
  }
  const cleanupErrors = await removeVerificationDocker(runDocker, resources);
  throwFailures('error' in outcome ? [outcome.error, ...cleanupErrors] : cleanupErrors);
  if ('error' in outcome) throw outcome.error;
  return outcome.value;
}
