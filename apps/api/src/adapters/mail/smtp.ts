import { connect } from 'node:net';
import type { Socket } from 'node:net';
import { connect as connectTls } from 'node:tls';
import { createTransport } from 'nodemailer';
import type { Mailer, MailMessage } from '@new-cms/cms/identity/composition';

export interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  user?: string;
  password?: string;
  from: string;
  frontendUrl: string;
  timeoutMs: number;
}

function emailContent(message: MailMessage, options: SmtpOptions) {
  const url = new URL(
    message.purpose === 'invitation' ? 'accept-invitation' : 'reset-password',
    options.frontendUrl,
  );
  url.hash = new URLSearchParams({ token: message.token }).toString();
  return {
    from: options.from,
    to: message.to,
    subject: message.purpose === 'invitation' ? 'CMS account invitation' : 'CMS password reset',
    text: `${message.purpose === 'invitation' ? 'Activate your CMS account' : 'Reset your CMS password'}: ${url.toString()}`,
  };
}

function connected(socket: Socket, secure: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once(secure ? 'secureConnect' : 'connect', resolve);
    socket.once('error', reject);
  });
}

function failure(error: unknown): 'rejected' | 'unknown' {
  if (typeof error !== 'object' || error === null) return 'unknown';
  if (
    'responseCode' in error &&
    typeof error.responseCode === 'number' &&
    error.responseCode >= 400
  )
    return 'rejected';
  if ('code' in error && ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(String(error.code)))
    return 'rejected';
  return 'unknown';
}

function closeSockets(sockets: Set<Socket>): Promise<void> {
  for (const socket of sockets) socket.destroy();
  return Promise.resolve();
}

function openConnection(options: SmtpOptions): Socket {
  return options.secure
    ? connectTls({
        host: options.host,
        port: options.port,
        servername: options.host,
        rejectUnauthorized: true,
      })
    : connect({ host: options.host, port: options.port });
}

export function createSmtpMailer(options: SmtpOptions): Mailer {
  const sockets = new Set<Socket>();
  let closed = false;
  async function send(message: MailMessage): Promise<'accepted' | 'rejected' | 'unknown'> {
    if (closed || message.signal.aborted) return 'rejected';
    const socket = openConnection(options);
    sockets.add(socket);
    const abort = () => socket.destroy(new Error('SMTP operation interrupted'));
    const timer = setTimeout(abort, options.timeoutMs);
    message.signal.addEventListener('abort', abort, { once: true });
    try {
      await connected(socket, options.secure);
      const transport = createTransport({
        host: options.host,
        port: options.port,
        connection: socket,
        secure: options.secure,
        secured: options.secure,
        requireTLS: options.requireTLS,
        connectionTimeout: options.timeoutMs,
        greetingTimeout: options.timeoutMs,
        socketTimeout: options.timeoutMs,
        ...(options.user && options.password
          ? { auth: { user: options.user, pass: options.password } }
          : {}),
      });
      const info = await transport.sendMail(emailContent(message, options));
      return info.accepted.length > 0 ? 'accepted' : 'rejected';
    } catch (error) {
      return failure(error);
    } finally {
      clearTimeout(timer);
      message.signal.removeEventListener('abort', abort);
      sockets.delete(socket);
      socket.destroy();
    }
  }
  return {
    send,
    close: () => {
      closed = true;
      return closeSockets(sockets);
    },
  };
}

export function createUnavailableMailer(): Mailer {
  return { send: () => Promise.resolve('rejected'), close: () => Promise.resolve() };
}
