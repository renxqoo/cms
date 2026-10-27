import { execFileSync } from 'node:child_process';
import { packageRelease } from './lib/release-package';

const args = process.argv.slice(2).filter((argument, index) => argument !== '--' || index !== 0);
if (
  (args.length !== 1 && args.length !== 2) ||
  !args[0] ||
  (args[1] && !/^--commit=[a-f0-9]{40,64}$/.test(args[1]))
)
  throw new Error('Usage: bun scripts/package-release.ts <release-id> [--commit=<source-commit>]');
if (Bun.version !== '1.4.4') throw new Error('Release packaging requires Bun 1.4.4');
const root = process.cwd();
const commit =
  args[1]?.slice('--commit='.length) ??
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const result = await packageRelease({ root, id: args[0], commit, bunVersion: Bun.version });
console.log(`Release package: ${result.archive}\nSHA-256: ${result.checksum}`);
