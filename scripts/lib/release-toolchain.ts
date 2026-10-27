import { appendFile, copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256File } from './release-package';

const archives = [
  {
    name: 'bun.zip',
    url: 'https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/bun-linux-x64.zip',
    sha256: 'bf8ccbfb2b0b80159e0f9a6d15c55317add8077534dbc6130a3edb52fccb395c',
  },
  {
    name: 'node.tar.xz',
    url: 'https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-x64.tar.xz',
    sha256: '6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6',
  },
];

type Run = (command: string[]) => Promise<unknown>;

interface DownloadChunk {
  start: number;
  end: number;
  path: string;
}

async function downloadRange(url: string, job: DownloadChunk, run: Run) {
  const length = job.end - job.start + 1;
  const status = await run([
    'curl',
    '--fail',
    '--silent',
    '--show-error',
    '--location',
    '--connect-timeout',
    '10',
    '--max-time',
    '90',
    '--retry',
    '2',
    '--retry-all-errors',
    '--range',
    `${job.start}-${job.end}`,
    '--max-filesize',
    String(length),
    '--output',
    job.path,
    '--write-out',
    '%{http_code}',
    url,
  ]);
  if (status !== '206' || (await stat(job.path)).size !== length)
    throw new Error(`Official toolchain server did not honor the requested range: ${job.path}`);
}

async function downloadArchive(directory: string, archive: (typeof archives)[number], run: Run) {
  const response = await fetch(archive.url, {
    method: 'HEAD',
    headers: { 'Accept-Encoding': 'identity' },
    signal: AbortSignal.timeout(15_000),
  });
  const size = Number(response.headers.get('content-length'));
  if (!response.ok || !Number.isSafeInteger(size) || size <= 0 || size > 128 * 1024 * 1024)
    throw new Error(`Invalid official toolchain archive metadata: ${archive.name}`);
  if (new URL(response.url).protocol !== 'https:')
    throw new Error('Official toolchain downloads require HTTPS');
  const chunks = join(directory, `${archive.name}.chunks`);
  await mkdir(chunks);
  const chunkSize = 256 * 1024;
  const jobs = Array.from({ length: Math.ceil(size / chunkSize) }, (_, index) => ({
    start: index * chunkSize,
    end: Math.min(size, (index + 1) * chunkSize) - 1,
    path: join(chunks, String(index)),
  }));
  let next = 0;
  try {
    const results = await Promise.allSettled(
      Array.from({ length: Math.min(32, jobs.length) }, async () => {
        while (next < jobs.length) {
          const job = jobs[next++];
          await downloadRange(response.url, job, run);
        }
      }),
    );
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    const target = join(directory, archive.name);
    await writeFile(target, '', { flag: 'wx' });
    for (const job of jobs) await appendFile(target, await readFile(job.path));
    if ((await sha256File(target)) !== archive.sha256)
      throw new Error(`Official toolchain checksum mismatch: ${archive.name}`);
  } finally {
    await rm(chunks, { recursive: true, force: true });
  }
}

export async function prepareReleaseToolchain(
  directory: string,
  run: Run,
  cacheDirectory?: string,
) {
  if (cacheDirectory) await mkdir(cacheDirectory, { recursive: true });
  for (const archive of archives) {
    const cached = cacheDirectory && join(cacheDirectory, archive.name);
    if (cached && (await sha256File(cached).catch(() => null)) === archive.sha256) {
      await copyFile(cached, join(directory, archive.name));
      continue;
    }
    await downloadArchive(directory, archive, run);
    if (cached) await copyFile(join(directory, archive.name), cached);
  }
  await writeFile(
    join(directory, 'toolchain.sha256'),
    `${archives.map((archive) => `${archive.sha256}  /tmp/${archive.name}`).join('\n')}\n`,
    { flag: 'wx', mode: 0o600 },
  );
}
