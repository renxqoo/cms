import { expect, it } from 'vitest';
import { createFixture } from './support.ts';

it('refuses readiness when the cleanup generation column from the UI migration is missing', async () => {
  const kit = await createFixture();
  await kit.assets.verifyReady();
  await kit.database.query('ALTER TABLE asset_objects DROP COLUMN cleanup_generation');
  await expect(kit.assets.verifyReady()).rejects.toMatchObject({ code: '42703' });
});

it('refuses readiness when the UI migration ledger is missing even if the columns remain', async () => {
  const kit = await createFixture();
  await kit.assets.verifyReady();
  await kit.database.query("DELETE FROM cms_migrations WHERE name='0011_ui_api.sql'");
  await expect(kit.assets.verifyReady()).rejects.toMatchObject({ code: 'temporarily_unavailable' });
});
