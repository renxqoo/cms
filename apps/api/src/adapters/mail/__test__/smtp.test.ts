import { describe, expect, it, vi } from 'vitest';
import { createSmtpMailer, createUnavailableMailer } from '../smtp.ts';
import { smtpServer } from './smtp-server.ts';

function options(port: number) {
  return {
    host: '127.0.0.1',
    port,
    secure: false,
    requireTLS: false,
    from: 'cms@example.com',
    frontendUrl: 'https://cms.example.com/',
    timeoutMs: 1000,
  };
}

function message(signal = new AbortController().signal) {
  return {
    to: 'editor@example.com',
    purpose: 'invitation' as const,
    token: 'opaque-test-token',
    signal,
  };
}

describe('real SMTP mail adapter', () => {
  it.each(['accepted', 'rejected', 'unknown'] as const)(
    'reports actual SMTP outcome %s',
    async (mode) => {
      const server = await smtpServer(mode);
      const mailer = createSmtpMailer(options(server.port));
      try {
        await expect(mailer.send(message())).resolves.toBe(mode);
      } finally {
        await mailer.close();
        await server.close();
      }
    },
  );

  it('puts the invitation secret only in the frontend URL fragment', async () => {
    const server = await smtpServer();
    const mailer = createSmtpMailer(options(server.port));
    try {
      await expect(mailer.send(message())).resolves.toBe('accepted');
      const mail = server.messages.join('').replaceAll('=\r\n', '').replaceAll('=3D', '=');
      expect(mail).toContain('CMS account invitation');
      expect(mail).toContain('https://cms.example.com/accept-invitation#token=opaque-test-token');
      expect(mail).not.toContain('?token');
    } finally {
      await mailer.close();
      await server.close();
    }
  });

  it('enforces required STARTTLS rather than sending a plaintext reset message', async () => {
    const server = await smtpServer();
    const mailer = createSmtpMailer({ ...options(server.port), requireTLS: true });
    try {
      expect(await mailer.send({ ...message(), purpose: 'password_reset' })).not.toBe('accepted');
      expect(server.messages).toHaveLength(0);
    } finally {
      await mailer.close();
      await server.close();
    }
  });

  it('destroys stalled connections at the absolute deadline and on cancellation', async () => {
    const server = await smtpServer('stall');
    const mailer = createSmtpMailer({ ...options(server.port), timeoutMs: 20 });
    try {
      await expect(mailer.send(message())).resolves.toBe('unknown');
      const controller = new AbortController();
      const sending = mailer.send(message(controller.signal));
      await vi.waitFor(() => expect(server.sockets.size).toBe(1));
      controller.abort();
      await expect(sending).resolves.toBe('unknown');
      await vi.waitFor(() => expect(server.sockets.size).toBe(0));
      await mailer.close();
      await mailer.close();
      await expect(mailer.send(message())).resolves.toBe('rejected');
    } finally {
      await mailer.close();
      await server.close();
    }
  });

  it('returns explicit failure for an unavailable provider or a pre-cancelled request', async () => {
    const unavailable = createUnavailableMailer();
    await expect(unavailable.send(message())).resolves.toBe('rejected');
    await unavailable.close();
    const controller = new AbortController();
    controller.abort();
    const mailer = createSmtpMailer(options(1));
    await expect(mailer.send(message(controller.signal))).resolves.toBe('rejected');
    await expect(mailer.send(message())).resolves.toBe('rejected');
    await mailer.close();
  });
});
