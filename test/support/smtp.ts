import { createServer } from 'node:net';
import type { Socket } from 'node:net';

export type TestSmtpMode = 'accept' | 'reject' | 'disconnect' | 'delay';
export interface TestSmtpOptions {
  mode?: TestSmtpMode;
  delayMs?: number;
}
interface Waiter {
  resolve(message: string): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}
interface ConnectionState {
  buffer: string;
  data: string[] | null;
}

function replyCommand(options: {
  socket: Socket;
  line: string;
  state: ConnectionState;
  mode: TestSmtpMode;
}): void {
  const { socket, line, state, mode } = options;
  const command = line.split(' ')[0]?.toUpperCase();
  if (command === 'EHLO' || command === 'HELO') socket.write('250-localhost\r\n250 8BITMIME\r\n');
  else if (command === 'MAIL') socket.write('250 Sender accepted\r\n');
  else if (command === 'RCPT')
    socket.write(mode === 'reject' ? '550 Recipient rejected\r\n' : '250 Recipient accepted\r\n');
  else if (command === 'DATA') {
    state.data = [];
    socket.write('354 End with <CRLF>.<CRLF>\r\n');
  } else if (command === 'QUIT') socket.end('221 Bye\r\n');
  else if (command === 'RSET' || command === 'NOOP') socket.write('250 OK\r\n');
  else socket.write('502 Command unsupported\r\n');
}

function receiveLine(options: {
  socket: Socket;
  line: string;
  state: ConnectionState;
  mode: TestSmtpMode;
  received(message: string): void;
  accepted(): void;
}): void {
  const { socket, line, state } = options;
  if (state.data === null) replyCommand({ socket, line, state, mode: options.mode });
  else if (line === '.') {
    options.received(state.data.join('\r\n'));
    state.data = null;
    options.accepted();
  } else state.data.push(line.startsWith('..') ? line.slice(1) : line);
}

function flushWaiters(state: { messages: string[]; waiters: Waiter[]; cursor: number }): void {
  while (state.waiters.length > 0 && state.cursor < state.messages.length) {
    const waiter = state.waiters.shift();
    const message = state.messages[state.cursor++];
    if (waiter && message !== undefined) {
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  }
}

export async function createTestSmtp(options: TestSmtpOptions = {}) {
  let mode = options.mode ?? 'accept';
  let delayMs = options.delayMs ?? 10_000;
  const sockets = new Set<Socket>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const state = { messages: [] as string[], waiters: [] as Waiter[], cursor: 0 };
  const received = (message: string) => {
    state.messages.push(message);
    flushWaiters(state);
  };
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    socket.write('220 localhost ESMTP test\r\n');
    const connection = { buffer: '', data: null } as ConnectionState;
    const accepted = () => acceptMessage({ socket, mode, delayMs, timers });
    socket.on('data', (chunk: string) => {
      connection.buffer += chunk;
      let newline = connection.buffer.indexOf('\r\n');
      while (newline >= 0) {
        const line = connection.buffer.slice(0, newline);
        connection.buffer = connection.buffer.slice(newline + 2);
        receiveLine({ socket, line, state: connection, mode, received, accepted });
        newline = connection.buffer.indexOf('\r\n');
      }
    });
    socket.on('error', () => socket.destroy());
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('SMTP listener did not bind');
  return {
    host: '127.0.0.1',
    port: address.port,
    messages: state.messages,
    setMode: (next: TestSmtpMode, delay?: number) => {
      mode = next;
      if (delay !== undefined) delayMs = delay;
    },
    waitForMessage: (timeoutMs = 2000) => waitForMessage(state, timeoutMs),
    close: () => closeSmtp({ server, sockets, timers, state }),
  };
}

function acceptMessage(options: {
  socket: Socket;
  mode: TestSmtpMode;
  delayMs: number;
  timers: Set<ReturnType<typeof setTimeout>>;
}): void {
  if (options.mode === 'disconnect') options.socket.destroy();
  else if (options.mode === 'delay') {
    const timer = setTimeout(() => {
      options.timers.delete(timer);
      options.socket.write('250 Message accepted\r\n');
    }, options.delayMs);
    options.timers.add(timer);
  } else options.socket.write('250 Message accepted\r\n');
}

function waitForMessage(
  state: { messages: string[]; waiters: Waiter[]; cursor: number },
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const index = state.waiters.findIndex((waiter) => waiter.timer === timer);
      if (index >= 0) state.waiters.splice(index, 1);
      reject(new Error('Timed out waiting for SMTP message'));
    }, timeoutMs);
    state.waiters.push({ resolve, reject, timer });
    flushWaiters(state);
  });
}

async function closeSmtp(options: {
  server: ReturnType<typeof createServer>;
  sockets: Set<Socket>;
  timers: Set<ReturnType<typeof setTimeout>>;
  state: { waiters: Waiter[] };
}): Promise<void> {
  for (const timer of options.timers) clearTimeout(timer);
  options.timers.clear();
  for (const waiter of options.state.waiters.splice(0)) {
    clearTimeout(waiter.timer);
    waiter.reject(new Error('SMTP listener closed'));
  }
  for (const socket of options.sockets) socket.destroy();
  await new Promise<void>((resolve, reject) => {
    options.server.close((error) => (error ? reject(error) : resolve()));
  });
}

export function extractToken(raw: string): string {
  const decoded = decodeMail(raw);
  const result = /#token=([A-Za-z0-9_-]{43})/.exec(decoded)?.[1];
  if (!result) throw new Error('SMTP message had no token fragment');
  return result;
}

function decodeMail(raw: string): string {
  return raw
    .replaceAll(/=\r?\n/g, '')
    .replaceAll(/=([0-9A-F]{2})/g, (_value, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
}

export function extractFrontendUrl(raw: string): string {
  const candidate = /https?:\/\/[^\s<>"']+#token=[A-Za-z0-9_-]{43}/.exec(decodeMail(raw))?.[0];
  if (!candidate) throw new Error('SMTP message had no complete frontend URL.');
  return new URL(candidate).href;
}
