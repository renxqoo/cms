import { spawn } from 'bun';
import type { Subprocess } from 'bun';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { sha256File, validateReleaseId } from './lib/release-package';
import { packageDockerRelease, validateNodeImage } from './lib/docker-release';
import { prepareReleaseToolchain } from './lib/release-toolchain';
import { verifyDockerRuntime } from './lib/docker-runtime-verification';
import {
  assertVacantRelease,
  runReleaseWorkspace,
  withVerificationDocker,
} from './lib/release-workspace';

interface CommandOptions {
  inherit?: boolean;
  cleanup?: boolean;
  includeStderr?: boolean;
  env?: NodeJS.ProcessEnv;
}

interface DockerClient {
  executable: string;
  endpoint: string;
  env: NodeJS.ProcessEnv;
}

interface ReleaseJob {
  id: string;
  commit: string;
  container: string;
  image: string;
  siteOrigin: string;
  contentOrigin: string;
}

function releaseOrigins() {
  const siteOrigin = process.env.ONEASTER_SITE_ORIGIN ?? 'https://oneaster.ai';
  const contentOrigin = process.env.ONEASTER_CONTENT_ORIGIN ?? 'http://127.0.0.1:9091';
  for (const [name, value] of [
    ['ONEASTER_SITE_ORIGIN', siteOrigin],
    ['ONEASTER_CONTENT_ORIGIN', contentOrigin],
  ] as const) {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      !['http:', 'https:'].includes(url.protocol)
    )
      throw new Error(`${name} must be a bare HTTP(S) origin: ${value}`);
  }
  return { siteOrigin, contentOrigin };
}

function originArguments(job: ReleaseJob) {
  return [
    '--env',
    `ONEASTER_SITE_ORIGIN=${job.siteOrigin}`,
    '--env',
    `ONEASTER_CONTENT_ORIGIN=${job.contentOrigin}`,
  ];
}

const cancellation = new AbortController();

function terminate(child: Subprocess, signal: 'SIGTERM' | 'SIGKILL') {
  if (process.platform === 'win32') {
    if (child.exitCode === null) child.kill(signal);
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    if (child.exitCode === null) child.kill(signal);
  }
}

async function run(command: string[], options: CommandOptions = {}) {
  const signal = options.cleanup ? AbortSignal.timeout(30_000) : cancellation.signal;
  signal.throwIfAborted();
  const common = { env: options.env, detached: process.platform !== 'win32' };
  const child = options.inherit
    ? spawn(command, { ...common, stdout: 'inherit', stderr: 'inherit' })
    : spawn(command, { ...common, stdout: 'pipe', stderr: 'pipe' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  function abort() {
    terminate(child, 'SIGTERM');
    timer = setTimeout(() => terminate(child, 'SIGKILL'), 3000);
  }
  signal.addEventListener('abort', abort, { once: true });
  try {
    const [status, output, errors] = await Promise.all([
      child.exited,
      child.stdout instanceof ReadableStream ? new Response(child.stdout).text() : '',
      child.stderr instanceof ReadableStream ? new Response(child.stderr).text() : '',
    ]);
    signal.throwIfAborted();
    if (status !== 0)
      throw new Error(`${command[0]} ${command[1] ?? ''} failed (${status}): ${output}${errors}`);
    return (options.includeStderr ? `${output}${errors}` : output).trim();
  } finally {
    signal.removeEventListener('abort', abort);
    clearTimeout(timer);
    terminate(child, 'SIGKILL');
    await child.exited;
  }
}

function localEndpoint(endpoint: string) {
  if (/^npipe:\/\/\/\/\.\/pipe\/[A-Za-z0-9._-]+$/.test(endpoint)) return endpoint;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('Docker must use a local unix or npipe socket');
  }
  if (
    url.protocol !== 'unix:' ||
    url.hostname ||
    !url.pathname.startsWith('/') ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Docker must use a local unix or npipe socket; remote Docker hosts are rejected',
    );
  return endpoint;
}

function docker(client: DockerClient, args: string[], options: CommandOptions = {}) {
  return run([client.executable, '--host', client.endpoint, ...args], {
    ...options,
    env: client.env,
  });
}

async function localDocker(): Promise<DockerClient> {
  if (process.env.DOCKER_HOST) localEndpoint(process.env.DOCKER_HOST);
  const executable = Bun.which('docker');
  if (!executable) throw new Error('Start a local Docker engine and install its Docker CLI');
  const context = process.env.DOCKER_CONTEXT ?? (await run([executable, 'context', 'show']));
  const inspected = await run([executable, 'context', 'inspect', context]);
  const contexts = z
    .array(z.object({ Endpoints: z.object({ docker: z.object({ Host: z.string() }) }) }))
    .length(1)
    .parse(JSON.parse(inspected));
  const configured = contexts[0]?.Endpoints.docker.Host;
  if (!configured) throw new Error('Docker context has no engine endpoint');
  localEndpoint(configured);
  const client = {
    executable,
    endpoint: localEndpoint(process.env.DOCKER_HOST ?? configured),
    env: {
      ...process.env,
      DOCKER_CONTEXT: undefined,
      DOCKER_HOST: undefined,
      DOCKER_TLS_VERIFY: undefined,
      DOCKER_CERT_PATH: undefined,
      BUILDX_BUILDER: undefined,
      BUILDKIT_HOST: undefined,
    },
  };
  if ((await docker(client, ['info', '--format', '{{.OSType}}'])) !== 'linux')
    throw new Error('The local Docker engine must support Linux containers');
  return client;
}

function verificationCommand(job: ReleaseJob) {
  return [
    `node -e 'if(process.platform !== "linux" || process.arch !== "x64") process.exit(1)'`,
    `node -e 'if(process.versions.node !== "24.22.1") process.exit(1)'`,
    'bun run lint',
    'bun run typecheck',
    'bun run build',
    'bun run test',
    `bun run deploy:package -- ${job.id} --commit=${job.commit}`,
    `bun run deploy:verify -- output/new-cms-${job.id}.tar.gz`,
  ].join(' && ');
}

async function buildImage(client: DockerClient, job: ReleaseJob, toolchain: string) {
  await docker(
    client,
    [
      'build',
      '--builder',
      'default',
      '--load',
      '--build-context',
      `toolchain=${toolchain}`,
      '--progress',
      'plain',
      '--platform',
      'linux/amd64',
      '--file',
      'deploy/Dockerfile.verify',
      '--target',
      'verification',
      '--tag',
      job.image,
      '.',
    ],
    { inherit: true },
  );
}

async function verifyContainer(client: DockerClient, job: ReleaseJob) {
  await docker(client, [
    'create',
    '--name',
    job.container,
    '--init',
    '--cpus=3',
    '--memory=4g',
    '--shm-size=512m',
    '--platform',
    'linux/amd64',
    ...originArguments(job),
    job.image,
    'sh',
    '-c',
    verificationCommand(job),
  ]);
  await docker(client, ['start', '--attach', job.container], { inherit: true });
  const status = await docker(client, ['inspect', '--format', '{{json .State}}', job.container]);
  const state = z.object({
    Status: z.literal('exited'),
    ExitCode: z.literal(0),
    OOMKilled: z.literal(false),
  });
  state.parse(JSON.parse(status));
}

async function copyArtifacts(client: DockerClient, job: ReleaseJob, output: string) {
  const name = `new-cms-${job.id}.tar.gz`;
  for (const file of [name, `${name}.sha256`])
    await docker(client, ['cp', `${job.container}:/app/output/${file}`, join(output, file)]);
  const digest = await sha256File(join(output, name));
  if ((await readFile(join(output, `${name}.sha256`), 'utf8')) !== `${digest}  ${name}\n`)
    throw new Error('The copied Linux release archive failed its SHA-256 check');
}

async function buildReleaseArtifacts(
  client: DockerClient,
  job: ReleaseJob,
  options: { stage: string; output: string; nodeImage?: string },
) {
  const runDocker = (args: string[], commandOptions?: CommandOptions) =>
    docker(client, args, commandOptions);
  const toolchain = await mkdtemp(join(tmpdir(), 'oneaster-release-toolchain-'));
  const failures: unknown[] = [];
  try {
    await withVerificationDocker(runDocker, job, async () => {
      await prepareReleaseToolchain(
        toolchain,
        (command) => run(command),
        join(options.output, '.toolchain-cache'),
      );
      await buildImage(client, job, toolchain);
      await verifyContainer(client, job);
      await copyArtifacts(client, job, options.stage);
      await packageDockerRelease({
        root: process.cwd(),
        outputDirectory: options.stage,
        id: job.id,
        commit: job.commit,
        nodeImage: options.nodeImage,
        runDocker,
        signal: cancellation.signal,
        verifyImage: (image) =>
          verifyDockerRuntime({ image, verificationImage: job.image, runDocker }),
      });
    });
  } catch (error) {
    failures.push(error);
  }
  try {
    await rm(toolchain, { recursive: true, force: true });
  } catch (error) {
    failures.push(error);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'Release and toolchain cleanup failed');
}

async function release(id: string, nodeImage?: string) {
  const output = join(process.cwd(), 'output');
  await assertVacantRelease(output, id);
  const commit = await run(['git', 'rev-parse', 'HEAD']);
  if (!/^[a-f0-9]{40,64}$/.test(commit))
    throw new Error('Could not identify the source Git commit');
  const client = await localDocker();
  const uuid = crypto.randomUUID();
  const origins = releaseOrigins();
  const job = {
    id,
    commit,
    ...origins,
    container: `oneaster-release-${uuid}`,
    image: `oneaster-release:${uuid}`,
  };
  await runReleaseWorkspace({
    outputDirectory: output,
    id,
    signal: cancellation.signal,
    build: (stage) => buildReleaseArtifacts(client, job, { stage, output, nodeImage }),
  });
  console.log(`Verified Linux x64 Docker release: ${join(output, `new-cms-${id}.docker.tar.gz`)}`);
}

const args = process.argv.slice(2).filter((argument, index) => argument !== '--' || index !== 0);
if (
  (args.length !== 1 && args.length !== 2) ||
  !args[0] ||
  (args[1] && !args[1].startsWith('--node-image='))
)
  throw new Error('Usage: bun run deploy:release -- <release-id> [--node-image=<reference>]');
const id = validateReleaseId(args[0]);
const nodeImage = args[1] ? validateNodeImage(args[1].slice('--node-image='.length)) : undefined;
if (Bun.version !== '1.4.4') throw new Error('Local release builds require Bun 1.4.4');
const onInterrupt = () => cancellation.abort(new Error('Local release build interrupted'));
process.on('SIGINT', onInterrupt);
process.on('SIGTERM', onInterrupt);
try {
  await release(id, nodeImage);
} finally {
  process.off('SIGINT', onInterrupt);
  process.off('SIGTERM', onInterrupt);
}
