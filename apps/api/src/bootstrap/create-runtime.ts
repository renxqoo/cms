import { createDatabase } from '@new-cms/database/client';
import { assertRuntimePrivileges } from '@new-cms/database/privileges';
import { applicationRuntimeProfile } from '../config/runtime-privileges.ts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { createIdentity } from '@new-cms/cms/identity/composition';
import { createAccess } from '@new-cms/cms/access/composition';
import { identityOperations, identityInputSchemas } from '@new-cms/cms/identity';
import { accessOperations, accessInputSchemas } from '@new-cms/cms/access';
import { contentOperations, contentInputSchemas } from '@new-cms/cms/content';
import { assetsOperations, assetsInputSchemas } from '@new-cms/cms/assets';
import { createScryptPasswords } from '../adapters/password/scrypt.ts';
import { createSmtpMailer, createUnavailableMailer } from '../adapters/mail/smtp.ts';
import { createApp } from '../http/create-app.ts';
import { contentHandlers } from '../http/content-handlers.ts';
import { assetHandlers, assetStreamHandlers } from '../http/assets-handlers.ts';
import type { ApplicationConfig } from './load-config.ts';
import { createAdmission } from './admission.ts';
import { contentConfiguration, createContentServices } from './create-content.ts';
import { contentLimits, contentWorkPolicy } from '../config/content-policy.ts';
import { contentOpenApiSchemas } from './openapi-schemas.ts';

function mailer(config: ApplicationConfig) {
  const options = config.smtp;
  return options.host === undefined
    ? createUnavailableMailer()
    : createSmtpMailer({ ...options, host: options.host });
}

function createCoreServices(config: ApplicationConfig, collectionKeys: readonly string[]) {
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
  const operations = [
    ...identityOperations,
    ...accessOperations,
    ...contentOperations,
    ...assetsOperations,
  ];
  const access = createAccess({
    database,
    policy: config.policy,
    identity: identity.participants,
    operations,
    collectionKeys,
    navigationPaths: config.navigation.paths,
    navigationIcons: config.navigation.icons,
  });
  return { database, identity, access, operations };
}

function createServices(config: ApplicationConfig) {
  const configuration = contentConfiguration();
  const core = createCoreServices(
    config,
    configuration.registry.list.map((collection) => collection.key),
  );
  const content = createContentServices({
    database: core.database,
    policy: config.policy,
    authorize: core.access.authorize,
    authorizeActor: core.access.authorizeActor,
    storage: config.storage,
    configuration,
  });
  return { ...core, ...content, runtimeProfile: applicationRuntimeProfile(configuration.mapping) };
}

type Services = ReturnType<typeof createServices>;

async function closeServices(services: Services): Promise<void> {
  const results = await Promise.allSettled([
    services.content.close(),
    services.assets.close(),
    services.identity.close(),
  ]);
  await services.database.close();
  const failures = results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason as unknown);
  if (failures.length > 0)
    throw new AggregateError(failures, 'CMS resources did not close cleanly');
}

async function maintainServices(services: Services): Promise<void> {
  const results = await Promise.allSettled([
    services.identity.maintenance(),
    services.content.maintenance(),
    services.assets.maintenance(),
  ]);
  if (results.some((result) => result.status === 'rejected'))
    throw new Error('CMS maintenance failed');
}

function httpServices(services: Services, config: ApplicationConfig) {
  const { uploads } = services.content;
  if (!uploads) throw new Error('Content upload services are missing');
  return {
    identity: services.identity.api,
    access: services.access.api,
    check: services.access.check,
    operations: services.operations,
    openApiSchemas: (ctx: RequestContext) => contentOpenApiSchemas(services.content.api, ctx),
    handlers: new Map([...contentHandlers(services.content.api), ...assetHandlers(uploads)]),
    streamingHandlers: assetStreamHandlers(uploads, config.http.bodyLimitBytes),
    inputSchemas: {
      ...identityInputSchemas,
      ...accessInputSchemas(config.policy),
      ...contentInputSchemas({ ...contentLimits(), ...contentWorkPolicy() }),
      ...assetsInputSchemas(config.policy),
    },
  };
}

function readiness(services: Services, config: ApplicationConfig, accepting: () => boolean) {
  async function verifyDatabaseAccess(signal?: AbortSignal): Promise<void> {
    if (config.mode === 'production')
      await services.database.transaction(
        (tx) => assertRuntimePrivileges(tx, services.runtimeProfile),
        signal ?? AbortSignal.timeout(config.policy.requestTimeoutMs),
      );
  }
  const admission = createAdmission(
    {
      database: services.database,
      policy: config.policy,
      async verifyReady(signal?: AbortSignal) {
        const deadline = AbortSignal.any([
          AbortSignal.timeout(config.policy.requestTimeoutMs),
          ...(signal ? [signal] : []),
        ]);
        await verifyDatabaseAccess(deadline);
        await services.access.verifyReady(deadline);
        await services.content.verifyReady(deadline);
        await services.assets.verifyReady(deadline);
        deadline.throwIfAborted();
      },
    },
    accepting,
  );
  return { ...admission, verifyDatabaseAccess };
}

export function createRuntime(config: ApplicationConfig) {
  const services = createServices(config);
  let accepting = true;
  let closing: Promise<void> | undefined;
  const { ready, admitIp, verifyDatabaseAccess } = readiness(services, config, () => accepting);
  const app = createApp({ ...httpServices(services, config), ready, admitIp }, config.http);
  function close(): Promise<void> {
    accepting = false;
    closing ??= closeServices(services);
    return closing;
  }
  return {
    ...services,
    app,
    ready,
    verifyDatabaseAccess,
    close,
    maintenance: () => maintainServices(services),
    maintenanceIntervalMs: config.policy.cleanupIntervalMs,
    stop: () => {
      accepting = false;
      services.content.stop();
      services.assets.stop();
    },
  };
}

export type ApplicationRuntime = ReturnType<typeof createRuntime>;
