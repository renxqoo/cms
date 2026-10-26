import { expect, it } from 'vitest';
import { z } from 'zod';
import { createCmsProcess } from '../test/support/cms-process.ts';
import { createTestS3 } from '../test/support/s3.ts';
import {
  nativeChatModel,
  publishPublicDocument,
  uploadPublicLogo,
} from '../test/support/public-process.ts';
import { editorialFixture } from '../test/support/oneaster-editorial.ts';
import { contentDocument } from '../test/support/cms-api.ts';

it('keeps publications, pinned media and grant revocation consistent across two production Node processes and a primary failure', async () => {
  const storage = await createTestS3({ timeoutMs: 2000 });
  const kit = await createCmsProcess('node', {
    initializePublicContent: true,
    sharedStorage: storage.configuration,
  });
  try {
    const peer = await kit.startPeer();
    const origin = `http://127.0.0.1:${peer.port}`;
    const logo = await uploadPublicLogo(kit);
    await publishPublicDocument(kit.request, {
      ...kit.owner,
      collection: 'site',
      data: editorialFixture('site'),
    });
    const model = await publishPublicDocument(kit.request, {
      ...kit.owner,
      collection: 'models',
      data: nativeChatModel({ logo: { collection: 'media', id: logo.document.id } }),
    });
    const detailPath = '/v1/public/models/native-chat?locale=en';
    const initial = await fetch(`${origin}${detailPath}`);
    expect(initial.status).toBe(200);
    const schema = z.object({
      revision: z.string(),
      data: z.object({
        model: z.object({
          title: z.string(),
          logo: z.object({ bindingId: z.uuid(), url: z.string(), alt: z.string() }),
        }),
      }),
    });
    const first = schema.parse(await initial.json());
    expect(first.data.model.title).toBe('Native chat');
    expect(first.data.model.logo.alt).toBe('Blue logo');
    const changed = await kit.request('PATCH', `/v1/collections/models/documents/${model.id}`, {
      ...kit.owner,
      body: { revision: model.revision, locale: 'en', data: { title: 'Private next title' } },
    });
    expect(changed.status).toBe(200);
    const draft = contentDocument.parse(await changed.json());
    expect(
      (
        await fetch(`${origin}${detailPath}`, {
          headers: { 'if-none-match': initial.headers.get('etag') ?? '' },
        })
      ).status,
    ).toBe(304);
    const ticketResponse = await kit.request(
      'POST',
      `/v1/collections/models/documents/${model.id}/preview-tickets`,
      { ...kit.owner, body: { locale: 'en', expectedRevision: draft.revision } },
    );
    expect(ticketResponse.status).toBe(201);
    const ticket = z.object({ url: z.string() }).parse(await ticketResponse.json());
    const grant = new URL(ticket.url).searchParams.get('grant');
    if (!grant) throw new Error('Missing grant');
    const preview = await fetch(`${origin}/v1/preview/models/native-chat?locale=en`, {
      headers: { authorization: `Bearer ${grant}` },
    });
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
      data: { model: { title: 'Private next title' } },
    });
    const examples = await fetch(
      `${origin}/v1/public/models/native-chat/integrations?locale=en&bindingKey=chat&scenarioKey=hello&recipeKey=core.http`,
    );
    expect(examples.status).toBe(200);
    const code = z
      .object({
        data: z.object({
          modelId: z.string(),
          examples: z.array(
            z.object({
              key: z.string(),
              language: z.string(),
              code: z.string(),
              requirements: z.array(z.string()),
            }),
          ),
        }),
      })
      .parse(await examples.json()).data;
    expect(code.modelId).toBe('Native/Chat');
    expect(code.examples.map((entry) => entry.language)).toEqual([
      'bash',
      'python',
      'javascript',
      'typescript',
      'go',
      'java',
      'php',
    ]);
    expect(
      code.examples.every(
        (entry) =>
          entry.code.length > 0 && !entry.code.includes('@@') && entry.requirements.length > 0,
      ),
    ).toBe(true);
    await kit.stop();
    expect(schema.parse(await (await fetch(`${origin}${detailPath}`)).json()).revision).toBe(
      first.revision,
    );
    const media = await fetch(`${origin}${first.data.model.logo.url}`);
    expect(media.status).toBe(200);
    expect(new Uint8Array(await media.arrayBuffer())).toEqual(new Uint8Array(logo.bytes));
    const revoked = await fetch(`${origin}/v1/preview/revoke`, {
      method: 'POST',
      headers: { authorization: `Bearer ${grant}` },
    });
    expect(revoked.status).toBe(200);
    expect(
      (
        await fetch(`${origin}/v1/preview/models/native-chat?locale=en`, {
          headers: { authorization: `Bearer ${grant}` },
        })
      ).status,
    ).toBe(401);
  } finally {
    await kit.close();
    await storage.close();
  }
});
