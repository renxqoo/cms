import { z } from 'zod';

export const documentOrderStateSchema = z.object({ version: z.uuid() });
