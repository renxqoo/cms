import { z } from 'zod';
export const previewTicketSchema = z.strictObject({
  ticketId: z.uuid(),
  expiresAt: z.iso.datetime({ offset: true }),
  url: z.url().refine((value) => {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname === '/api/content-preview'
    );
  }),
});
export const previewRevocationSchema = z.strictObject({ revoked: z.literal(true) });
export type PreviewTicket = z.infer<typeof previewTicketSchema>;
export interface PreviewTarget {
  collection: string;
  id: string;
  revision: number;
  locale: string;
}
