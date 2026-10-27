import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, lstat, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { assertPackageTree, atomicWrite } from './docker-files';
import type { DockerContext, DockerManifest } from './docker-types';
import { jsonObject, jsonString, singleObject } from './docker-json';

const manifestKeys = [
  'kind',
  'id',
  'commit',
  'builtAt',
  'platform',
  'arch',
  'nodeMajor',
  'nodeVersion',
  'image',
  'imageId',
  'configId',
  'imageSha256',
];

function manifestIdentity(value: Record<string, unknown>): void {
  if (
    Object.keys(value).length !== manifestKeys.length ||
    manifestKeys.some((key) => !(key in value)) ||
    value.kind !== 'docker' ||
    value.platform !== 'linux' ||
    value.arch !== 'x64' ||
    value.nodeMajor !== 24 ||
    value.nodeVersion !== '24.22.1'
  )
    throw new Error('Invalid Docker release metadata');
}

function manifestImage(value: Record<string, unknown>, id: string) {
  const image = jsonString(value, 'image');
  const imageId = jsonString(value, 'imageId');
  const configId = jsonString(value, 'configId');
  const imageSha256 = jsonString(value, 'imageSha256');
  if (
    image !== `new-cms:${id}` ||
    !/^sha256:[a-f0-9]{64}$/.test(imageId) ||
    !/^sha256:[a-f0-9]{64}$/.test(configId) ||
    !/^[a-f0-9]{64}$/.test(imageSha256)
  )
    throw new Error('Invalid Docker release image identity');
  return { image, imageId, configId, imageSha256 };
}

export async function dockerManifest(directory: string): Promise<DockerManifest> {
  const value: unknown = JSON.parse(await readFile(join(directory, 'release.json'), 'utf8'));
  if (!jsonObject(value)) throw new Error('Invalid Docker release metadata');
  manifestIdentity(value);
  const id = jsonString(value, 'id');
  const commit = jsonString(value, 'commit');
  const builtAt = jsonString(value, 'builtAt');
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id) ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(builtAt) ||
    !Number.isFinite(Date.parse(builtAt))
  )
    throw new Error('Invalid Docker release identity');
  return {
    kind: 'docker',
    id,
    commit,
    builtAt,
    platform: 'linux',
    arch: 'x64',
    nodeMajor: 24,
    nodeVersion: '24.22.1',
    ...manifestImage(value, id),
  };
}

export async function imageHash(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    if (typeof chunk !== 'string' && !Buffer.isBuffer(chunk))
      throw new Error('Unexpected file stream chunk');
    hash.update(chunk);
  }
  return hash.digest('hex');
}

export async function verifyDockerPackage(
  directory: string,
  installed = false,
): Promise<DockerManifest> {
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error('Docker package must be a directory');
  await assertPackageTree(directory);
  const entries = await readdir(directory);
  const allowed = ['image.tar', 'release.json', 'deploy'];
  if (installed) allowed.push('image.env');
  if (
    entries.some((entry) => !allowed.includes(entry)) ||
    !['image.tar', 'release.json', 'deploy'].every((entry) => entries.includes(entry))
  )
    throw new Error('Docker package must contain image.tar, release.json and deploy only');
  const manifest = await dockerManifest(directory);
  if (
    !(await lstat(join(directory, 'image.tar'))).isFile() ||
    (await imageHash(join(directory, 'image.tar'))) !== manifest.imageSha256
  )
    throw new Error('Docker image archive checksum does not match release metadata');
  for (const file of [
    'docker.ts',
    'compose.host.yaml',
    'docker-watch.service',
    'docker-watch.timer',
    'production.env.example',
  ])
    if (!(await lstat(join(directory, 'deploy', file))).isFile())
      throw new Error(`Missing Docker deployment file: ${file}`);
  if (installed) {
    const generated = await readFile(join(directory, 'image.env'), 'utf8').catch(() => null);
    if (generated !== null && generated !== `ADMIN_IMAGE=${manifest.image}\n`)
      throw new Error('Installed Docker image environment does not match its release');
  }
  return manifest;
}

export async function copyDockerPackage(source: string, target: string): Promise<void> {
  await mkdir(target, { mode: 0o755 });
  try {
    for (const entry of ['image.tar', 'release.json', 'deploy'])
      await cp(join(source, entry), join(target, entry), { recursive: true, dereference: false });
    await verifyDockerPackage(target);
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}

export async function loadDockerImage(
  context: DockerContext,
  directory: string,
): Promise<DockerManifest> {
  const manifest = await verifyDockerPackage(directory, true);
  await context.run(['docker', 'load', '--input', join(directory, 'image.tar')]);
  const item = singleObject(
    JSON.parse(await context.run(['docker', 'image', 'inspect', manifest.image])),
  );
  if (
    !matchesDockerImage(manifest, item.Id) ||
    item.Os !== 'linux' ||
    item.Architecture !== 'amd64'
  )
    throw new Error('Loaded Docker image identity or platform does not match the verified release');
  await atomicWrite(join(directory, 'image.env'), `ADMIN_IMAGE=${manifest.image}\n`);
  return manifest;
}

export function matchesDockerImage(manifest: DockerManifest, observedId: unknown): boolean {
  return observedId === manifest.imageId || observedId === manifest.configId;
}
