import { verifyReleaseArchive } from './lib/release-verification';

const args = process.argv.slice(2).filter((argument, index) => argument !== '--' || index !== 0);
if (args.length !== 1 || !args[0])
  throw new Error('Usage: bun scripts/verify-release.ts <release.tar.gz>');
if (Bun.version !== '1.4.4') throw new Error('Release verification requires Bun 1.4.4');
await verifyReleaseArchive(args[0]);
console.log(
  'Release checksum, configuration, Node.js startup, health, anonymous protection and static assets passed.',
);
