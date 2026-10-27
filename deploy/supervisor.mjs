import { spawn } from 'node:child_process';

const services = [
  { name: 'api', command: ['node', 'apps/api/dist/main.js'] },
  { name: 'admin', command: ['node', 'apps/admin/server.js'] },
];

const children = services.map((service) => ({
  name: service.name,
  child: spawn(service.command[0], service.command.slice(1), {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env },
  }),
}));
let shuttingDown = false;

function shutdown(status) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) child.kill('SIGTERM');
  const deadline = setTimeout(() => {
    for (const { child } of children) child.kill('SIGKILL');
    process.exit(1);
  }, 30_000);
  deadline.unref();
  const pending = [...children];
  const onExit = () => {
    if (children.length === 0) {
      clearTimeout(deadline);
      process.exit(status === 0 ? 0 : 1);
    }
  };
  for (const { child } of pending) child.once('exit', onExit);
}

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

for (const { name, child } of children) {
  child.once('exit', (code, signal) => {
    const index = children.findIndex((entry) => entry.child === child);
    if (index >= 0) children.splice(index, 1);
    if (shuttingDown) return;
    process.stderr.write(
      `${JSON.stringify({ event: 'service_exit', service: name, code, signal })}\n`,
    );
    shutdown(1);
  });
}
