import { createDatabase } from '@new-cms/database/client';
import { assertRuntimePrivileges } from '@new-cms/database/privileges';
import { createIdentity } from '@new-cms/cms/identity/composition';
import { createAccess } from '@new-cms/cms/access/composition';
import { identityOperations, identityInputSchemas } from '@new-cms/cms/identity';
import { accessOperations, accessInputSchemas } from '@new-cms/cms/access';
import { createScryptPasswords } from '../adapters/password/scrypt.ts';
import { createSmtpMailer, createUnavailableMailer } from '../adapters/mail/smtp.ts';
import { createApp } from '../http/create-app.ts';
import type { ApplicationConfig } from './load-config.ts';
import { createAdmission } from './admission.ts';

function mailer(config: ApplicationConfig) {
  const options = config.smtp;
  if (options.host === undefined) return createUnavailableMailer();
  return createSmtpMailer({ ...options, host: options.host });
}

function createServices(config: ApplicationConfig) {
  const database = createDatabase({
    ...config.database,
    statementTimeoutMs: config.policy.statementTimeoutMs,
    lockTimeoutMs: config.policy.lockTimeoutMs,
    connectionTimeoutMs: config.policy.connectionTimeoutMs,
  });
  const identity = createIdentity({
    database,
    policy: config.policy,
    passwords: createScryptPasswords({ policy: config.policy, settings: config.password }),
    mailer: mailer(config),
  });
  const operations = [...identityOperations, ...accessOperations];
  const access = createAccess({
    database,
    policy: config.policy,
    identity: identity.participants,
    operations,
    collectionKeys: [],
    navigationPaths: config.navigation.paths,
    navigationIcons: config.navigation.icons,
  });
  return { database, identity, access, operations };
}

function createReadiness(
  services: ReturnType<typeof createServices>,
  config: ApplicationConfig,
  accepting: () => boolean,
) {
  const { database, access } = services;
  async function verifyDatabaseAccess(): Promise<void> {
    if (config.mode === 'production') await assertRuntimePrivileges(database);
  }
  const { ready, admitIp } = createAdmission(
    {
      database,
      policy: config.policy,
      verifyReady: async () => {
        await verifyDatabaseAccess();
        await access.verifyReady();
      },
    },
    accepting,
  );
  return { ready, admitIp, verifyDatabaseAccess };
}

export function createRuntime(config: ApplicationConfig) {
  const services = createServices(config);
  const { database, identity, access, operations } = services;
  let accepting = true;
  let closing: Promise<void> | undefined;
  const { ready, admitIp, verifyDatabaseAccess } = createReadiness(
    services,
    config,
    () => accepting,
  );
  const app = createApp(
    {
      identity: identity.api,
      access: access.api,
      check: access.check,
      operations,
      inputSchemas: { ...identityInputSchemas, ...accessInputSchemas(config.policy) },
      ready,
      admitIp,
    },
    config.http,
  );
  async function closeResources(): Promise<void> {
    accepting = false;
    try {
      await identity.close();
    } finally {
      await database.close();
    }
  }
  function close(): Promise<void> {
    closing ??= closeResources();
    return closing;
  }
  return {
    app,
    access,
    identity,
    database,
    ready,
    verifyDatabaseAccess,
    close,
    maintenanceIntervalMs: config.policy.cleanupIntervalMs,
    stop: () => {
      accepting = false;
    },
  };
}

export type ApplicationRuntime = ReturnType<typeof createRuntime>;
