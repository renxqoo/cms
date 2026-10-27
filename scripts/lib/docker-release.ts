import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { copyReleaseDirectory, sha256File, validateReleaseId } from './release-package';
import { dockerReleaseDeployFiles } from './release-deployment';

export interface DockerCommandOptions {
  inherit?: boolean;
  cleanup?: boolean;
  includeStderr?: boolean;
}

export type DockerCommand = (args: string[], options?: DockerCommandOptions) => Promise<string>;

export interface DockerReleaseManifest {
  kind: 'docker';
  id: string;
  commit: string;
  builtAt: string;
  platform: 'linux';
  arch: 'x64';
  nodeMajor: 24;
  nodeVersion: '24.22.1';
  image: string;
  imageId: string;
  configId: string;
  imageSha256: string;
}

interface DockerReleaseOptions {
  root: string;
  id: string;
  commit: string;
  nodeImage?: string;
  outputDirectory?: string;
  runDocker: DockerCommand;
  verifyImage: (image: string) => Promise<void>;
  signal?: AbortSignal;
}

const execute = promisify(execFile);

export function validateNodeImage(image: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,254}$/.test(image))
    throw new Error(
      'Node base image must be a Docker image reference without whitespace or shell characters',
    );
  return image;
}

async function vacantOutput(path: string) {
  for (const target of [path, `${path}.sha256`]) {
    if (await lstat(target).catch(() => null)) throw new Error(`Refusing to overwrite ${target}`);
  }
}

async function extractStandalone(options: DockerReleaseOptions, directory: string) {
  const archive = join(
    options.outputDirectory ?? join(options.root, 'output'),
    `new-cms-${options.id}.tar.gz`,
  );
  const digest = await sha256File(archive);
  if ((await readFile(`${archive}.sha256`, 'utf8')) !== `${digest}  ${basename(archive)}\n`)
    throw new Error('Standalone release checksum does not match its sidecar');
  await new Bun.Archive(await Bun.file(archive).bytes()).extract(directory);
  z.object({
    id: z.literal(options.id),
    commit: z.literal(options.commit),
    platform: z.literal('linux'),
    arch: z.literal('x64'),
    nodeMajor: z.literal(24),
    nodeVersion: z.literal('24.22.1'),
  }).parse(JSON.parse(await readFile(join(directory, 'release.json'), 'utf8')));
  await lstat(join(directory, 'runtime/server.js'));
}

async function imageMetadata(options: DockerReleaseOptions, image: string) {
  const value = await options.runDocker(['image', 'inspect', '--format', '{{json .}}', image]);
  return z
    .object({
      Id: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      Os: z.literal('linux'),
      Architecture: z.literal('amd64'),
    })
    .parse(JSON.parse(value));
}

async function buildRuntimeImage(options: DockerReleaseOptions, context: string) {
  const image = `new-cms:${options.id}`;
  const args = [
    'build',
    '--builder',
    'default',
    '--load',
    '--progress',
    'plain',
    '--platform',
    'linux/amd64',
    '--file',
    join(context, 'Dockerfile'),
    '--tag',
    image,
  ];
  if (options.nodeImage)
    args.push('--build-arg', `NODE_IMAGE=${validateNodeImage(options.nodeImage)}`);
  await options.runDocker([...args, context], { inherit: true });
  const metadata = await imageMetadata(options, image);
  await options.verifyImage(image);
  options.signal?.throwIfAborted();
  return { image, imageId: metadata.Id };
}

async function copyDeployment(standalone: string, bundle: string) {
  for (const file of dockerReleaseDeployFiles) {
    const target = join(bundle, file);
    await mkdir(dirname(target), { recursive: true });
    await copyReleaseDirectory(join(standalone, file), target, {
      root: standalone,
      excludeTests: true,
    });
  }
}

async function prepareBundle(options: DockerReleaseOptions, stage: string) {
  const standalone = join(stage, 'standalone');
  await extractStandalone(options, standalone);
  const context = join(stage, 'context');
  await mkdir(context);
  await copyReleaseDirectory(join(standalone, 'runtime'), join(context, 'runtime'), {
    root: standalone,
    excludeTests: true,
  });
  await rm(join(context, 'runtime/.next/cache'), { recursive: true, force: true });
  await copyReleaseDirectory(
    join(standalone, 'deploy/Dockerfile.runtime'),
    join(context, 'Dockerfile'),
    { root: standalone },
  );
  const bundle = join(stage, 'bundle');
  await mkdir(bundle);
  await copyDeployment(standalone, bundle);
  const built = await buildRuntimeImage(options, context);
  await options.runDocker(['image', 'save', '--output', join(bundle, 'image.tar'), built.image]);
  const after = await imageMetadata(options, built.image);
  if (after.Id !== built.imageId) throw new Error('Runtime image tag changed during image export');
  const archive = join(bundle, 'image.tar');
  const configId = await archiveConfigId(archive, { ...built, signal: options.signal });
  return { bundle, ...built, configId, imageSha256: await sha256File(archive) };
}

const descriptorSchema = z.object({
  mediaType: z.enum([
    'application/vnd.oci.image.index.v1+json',
    'application/vnd.docker.distribution.manifest.list.v2+json',
    'application/vnd.oci.image.manifest.v1+json',
    'application/vnd.docker.distribution.manifest.v2+json',
  ]),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  size: z.number().int().nonnegative(),
  platform: z.object({ os: z.string(), architecture: z.string() }).optional(),
  annotations: z.record(z.string(), z.string()).optional(),
});

interface ArchiveContext {
  path: string;
  signal?: AbortSignal;
}

async function archiveJson(archive: ArchiveContext, entry: string) {
  const { stdout } = await execute('tar', ['-xOf', archive.path, entry], {
    encoding: 'buffer',
    maxBuffer: 1024 * 1024,
    signal: archive.signal,
  });
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(stdout));
  return {
    value,
    digest: `sha256:${createHash('sha256').update(stdout).digest('hex')}`,
    size: stdout.byteLength,
  };
}

async function descriptorConfigs(
  archive: ArchiveContext,
  descriptor: z.infer<typeof descriptorSchema>,
  ancestors: Set<string>,
): Promise<string[]> {
  if (ancestors.has(descriptor.digest) || ancestors.size >= 8)
    throw new Error('Docker archive has a cyclic or excessively nested image index');
  const entry = await archiveJson(archive, `blobs/sha256/${descriptor.digest.slice(7)}`);
  if (entry.digest !== descriptor.digest || entry.size !== descriptor.size)
    throw new Error('Docker archive descriptor checksum does not match its contents');
  if (descriptor.mediaType.includes('manifest.v')) {
    if (
      descriptor.platform?.os === 'unknown' &&
      descriptor.platform.architecture === 'unknown' &&
      descriptor.annotations?.['vnd.docker.reference.type'] === 'attestation-manifest'
    )
      return [];
    if (
      descriptor.platform &&
      (descriptor.platform.os !== 'linux' || descriptor.platform.architecture !== 'amd64')
    )
      throw new Error('Docker archive contains an unsupported image platform');
    const leaf = z
      .object({
        schemaVersion: z.literal(2),
        mediaType: z.literal(descriptor.mediaType),
        config: z.object({ digest: z.string().regex(/^sha256:[a-f0-9]{64}$/) }),
      })
      .parse(entry.value);
    return [leaf.config.digest];
  }
  const index = z
    .object({
      schemaVersion: z.literal(2),
      mediaType: z.literal(descriptor.mediaType),
      manifests: z.array(descriptorSchema).min(1),
    })
    .parse(entry.value);
  const next = new Set([...ancestors, descriptor.digest]);
  const configs: string[] = [];
  for (const child of index.manifests) {
    configs.push(...(await descriptorConfigs(archive, child, next)));
  }
  return configs;
}

async function archiveConfigId(
  path: string,
  identity: { image: string; imageId: string; signal?: AbortSignal },
): Promise<string> {
  const archive = { path, signal: identity.signal };
  const listing = z
    .array(
      z.object({
        Config: z.string(),
        RepoTags: z.array(z.string()).nullish(),
      }),
    )
    .parse((await archiveJson(archive, 'manifest.json')).value);
  const targets = listing.filter((entry) => entry.RepoTags?.includes(identity.image));
  if (targets.length !== 1)
    throw new Error('Docker archive must contain one manifest for its image tag');
  const configPath = targets[0].Config;
  const match = /^(?:([a-f0-9]{64})\.json|blobs\/sha256\/([a-f0-9]{64}))$/.exec(configPath);
  if (!match) throw new Error('Docker archive config path must identify a SHA-256 JSON blob');
  const config = await archiveJson(archive, configPath);
  if (config.digest !== `sha256:${match[1] ?? match[2]}`)
    throw new Error('Docker archive config checksum does not match its path');
  z.object({ os: z.literal('linux'), architecture: z.literal('amd64') }).parse(config.value);
  if (identity.imageId === config.digest) return config.digest;
  const index = z
    .object({ schemaVersion: z.literal(2), manifests: z.array(descriptorSchema) })
    .parse((await archiveJson(archive, 'index.json')).value);
  const descriptors = index.manifests.filter((entry) => entry.digest === identity.imageId);
  if (descriptors.length !== 1)
    throw new Error('Docker archive must contain one descriptor for its image identity');
  const configs = await descriptorConfigs(archive, descriptors[0], new Set());
  if (configs.length !== 1 || configs[0] !== config.digest)
    throw new Error('Docker archive image descriptor does not identify one runtime config');
  return config.digest;
}

function manifest(
  options: DockerReleaseOptions,
  image: { image: string; imageId: string; configId: string; imageSha256: string },
): DockerReleaseManifest {
  return {
    kind: 'docker',
    id: options.id,
    commit: options.commit,
    builtAt: new Date().toISOString(),
    platform: 'linux',
    arch: 'x64',
    nodeMajor: 24,
    nodeVersion: '24.22.1',
    ...image,
  };
}

async function publish(bundle: string, target: string, signal?: AbortSignal) {
  const archive = join(bundle, '..', 'docker-release.tar.gz');
  await execute('tar', ['-czf', archive, '-C', bundle, 'image.tar', 'deploy', 'release.json'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
    signal,
  });
  const digest = await sha256File(archive);
  signal?.throwIfAborted();
  await copyFile(archive, target, constants.COPYFILE_EXCL);
  let checksumWritten = false;
  try {
    signal?.throwIfAborted();
    await writeFile(`${target}.sha256`, `${digest}  ${basename(target)}\n`, { flag: 'wx' });
    checksumWritten = true;
    signal?.throwIfAborted();
  } catch (error) {
    await rm(target, { force: true });
    if (checksumWritten) await rm(`${target}.sha256`, { force: true });
    throw error;
  }
}

export async function packageDockerRelease(options: DockerReleaseOptions) {
  options.signal?.throwIfAborted();
  validateReleaseId(options.id);
  if (!/^[a-f0-9]{40,64}$/.test(options.commit)) throw new Error('Invalid source Git commit');
  if (options.nodeImage) validateNodeImage(options.nodeImage);
  const archive = join(
    options.outputDirectory ?? join(options.root, 'output'),
    `new-cms-${options.id}.docker.tar.gz`,
  );
  await vacantOutput(archive);
  const stage = await mkdtemp(join(tmpdir(), 'oneaster-docker-release-'));
  try {
    const built = await prepareBundle(options, stage);
    const metadata = manifest(options, {
      image: built.image,
      imageId: built.imageId,
      configId: built.configId,
      imageSha256: built.imageSha256,
    });
    await writeFile(join(built.bundle, 'release.json'), `${JSON.stringify(metadata, null, 2)}\n`);
    await publish(built.bundle, archive, options.signal);
    return { archive, checksum: `${archive}.sha256`, manifest: metadata };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
