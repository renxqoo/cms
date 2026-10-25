import { connect } from 'node:net';
import { expect, it } from 'vitest';
import { createAdminMailbox } from '../../test/support/admin-mailbox.ts';
import { extractFrontendUrl } from '../../test/support/smtp.ts';

it('keeps the test SMTP feed behind a random capability and permits only a bounded read', async () => {
  const messages = ['To: example@example.test\r\nfirst'];
  const mailbox = await createAdminMailbox({ messages, maximumBytes: 100 });
  const { origin, capability } = mailbox.connection;
  const headers = { authorization: `Bearer ${capability}` };
  try {
    expect((await fetch(`${origin}/messages`)).status).toBe(401);
    expect(
      (await fetch(`${origin}/messages`, { headers: { authorization: 'Bearer wrong' } })).status,
    ).toBe(401);
    for (const path of ['/other', '/messages?recipient=all']) {
      expect((await fetch(`${origin}${path}`, { headers })).status).toBe(404);
    }
    expect((await fetch(`${origin}/messages`, { method: 'POST', headers })).status).toBe(404);
    const response = await fetch(`${origin}/messages`, { headers });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ messages: ['To: example@example.test\r\nfirst'] });
    messages.push('x'.repeat(100));
    expect((await fetch(`${origin}/messages`, { headers })).status).toBe(413);
  } finally {
    await mailbox.close();
  }
  await expect(fetch(`${origin}/messages`, { headers })).rejects.toThrow(/fetch|connect|socket/i);
});

it('closes active mailbox sockets instead of leaving a keepalive process behind', async () => {
  const mailbox = await createAdminMailbox({ messages: [], maximumBytes: 100 });
  const address = new URL(mailbox.connection.origin);
  const socket = connect(Number(address.port), address.hostname);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  const closed = new Promise<void>((resolve) => {
    socket.once('close', resolve);
  });
  await mailbox.close();
  await closed;
  expect(socket.destroyed).toBe(true);
});

it('reads the actual complete SMTP frontend URL across quoted-printable wrapping', () => {
  const token = 'A'.repeat(43);
  expect(
    extractFrontendUrl(
      `To: a@example.test\r\nhttp://127.0.0.1:9912/reset-=\r\npassword#token=3D${token}\r\n`,
    ),
  ).toBe(`http://127.0.0.1:9912/reset-password#token=${token}`);
  expect(() => extractFrontendUrl(`#token=${token}`)).toThrow('complete frontend URL');
});
