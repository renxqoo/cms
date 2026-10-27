import { afterEach, expect, it } from 'vitest';
import { createTestDatabase } from '../../../../test/support/database.ts';
import { createTestRuntimeDatabase } from '../../../../test/support/runtime-database.ts';
import { assertRuntimePrivileges, grantRuntimePrivileges } from '../privileges.ts';
import cases from './fixtures/wgs84-cases.json' with { type: 'json' };
import criticalCases from './fixtures/wgs84-critical-cases.json' with { type: 'json' };

const fixtures: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.close();
});

it('matches independent GeographicLib WGS84 reference vectors across poles, antipodes and the date line', async () => {
  const kit = await createTestDatabase();
  fixtures.push(kit);
  for (const item of cases) {
    for (const coordinates of [
      item.coordinates,
      [...item.coordinates.slice(2), ...item.coordinates.slice(0, 2)],
    ]) {
      const result = await kit.database.query<{ metres: number }>(
        'SELECT cms_wgs84_distance($1,$2,$3,$4) AS metres',
        coordinates,
      );
      expect(Math.abs((result.rows[0]?.metres ?? Infinity) - item.metres), item.name).toBeLessThan(
        0.0001,
      );
    }
  }
  for (const invalid of [
    [181, 0, 0, 0],
    [0, 91, 0, 0],
    [0, 0, Infinity, 0],
    [0, 0, 0, NaN],
  ])
    await expect(
      kit.database.query('SELECT cms_wgs84_distance($1,$2,$3,$4)', invalid),
    ).rejects.toMatchObject({ code: '22023' });
});

it('evaluates 2048 independent reference points within the existing PostgreSQL statement budget', async () => {
  const kit = await createTestDatabase();
  fixtures.push(kit);
  const result = await kit.database.query<{ count: string; error: number }>(
    `SELECT count(*)::text AS count,max(abs(cms_wgs84_distance((x->'coordinates'->>0)::float8,(x->'coordinates'->>1)::float8,(x->'coordinates'->>2)::float8,(x->'coordinates'->>3)::float8)-(x->>'metres')::float8)) AS error
     FROM jsonb_array_elements($1::jsonb) x CROSS JOIN generate_series(1,32) AS repetition`,
    [JSON.stringify(cases)],
  );
  expect(result.rows[0]?.count).toBe('2048');
  expect(result.rows[0]?.error).toBeLessThan(0.0001);
});

it('regression: near-equatorial antipodal transition distances remain stable at tiny and asymmetric latitudes', async () => {
  const kit = await createTestDatabase();
  fixtures.push(kit);
  for (const item of criticalCases) {
    const result = await kit.database.query<{ metres: number }>(
      'SELECT cms_wgs84_distance($1,$2,$3,$4) AS metres',
      item.coordinates,
    );
    expect(
      Math.abs((result.rows[0]?.metres ?? Infinity) - item.metres),
      JSON.stringify(item.coordinates),
    ).toBeLessThan(0.0001);
  }
});

it('grants only the dedicated runtime role execute access and rejects PUBLIC or definer drift', async () => {
  const kit = await createTestRuntimeDatabase();
  fixtures.push(kit);
  await grantRuntimePrivileges(kit.database, { roleName: kit.roleName });
  const result = await kit.runtime.query<{ metres: number }>(
    'SELECT cms_wgs84_distance(0,0,1,0) AS metres',
  );
  expect(result.rows[0]?.metres).toBeCloseTo(111319.49079327357, 4);
  await assertRuntimePrivileges(kit.runtime);
  await kit.database.query(
    'GRANT EXECUTE ON FUNCTION cms_wgs84_distance(float8,float8,float8,float8) TO PUBLIC',
  );
  await expect(assertRuntimePrivileges(kit.runtime)).rejects.toThrow(
    'WGS84 runtime function is unavailable or unsafe',
  );
  await kit.database.query(
    'REVOKE EXECUTE ON FUNCTION cms_wgs84_distance(float8,float8,float8,float8) FROM PUBLIC',
  );
  await kit.database.query(
    `GRANT EXECUTE ON FUNCTION cms_wgs84_distance(float8,float8,float8,float8) TO ${kit.roleName} WITH GRANT OPTION`,
  );
  await expect(assertRuntimePrivileges(kit.runtime)).rejects.toThrow(
    'WGS84 runtime function is unavailable or unsafe',
  );
  await grantRuntimePrivileges(kit.database, { roleName: kit.roleName });
  await assertRuntimePrivileges(kit.runtime);
  await kit.database.query(
    `REVOKE EXECUTE ON FUNCTION cms_wgs84_distance(float8,float8,float8,float8) FROM ${kit.roleName}`,
  );
  await expect(assertRuntimePrivileges(kit.runtime)).rejects.toThrow(
    'WGS84 runtime function is unavailable or unsafe',
  );
  await grantRuntimePrivileges(kit.database, { roleName: kit.roleName });
  await kit.database.query(
    'ALTER FUNCTION cms_wgs84_distance(float8,float8,float8,float8) SECURITY DEFINER',
  );
  await expect(assertRuntimePrivileges(kit.runtime)).rejects.toThrow(
    'Runtime schema privileges are unsafe',
  );
});
