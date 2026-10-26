import { fail } from '@new-cms/cms/platform/contracts';
import type { DeliverySession } from './types.ts';
import type { PublicIntegrationExamples, PublicModel } from './contracts.ts';
import { readModel } from './readers.ts';
import { readRows, record, text } from './source.ts';
import { selectedLocale } from './query.ts';
import { renderIntegrationExamples } from './profiles/index.ts';
interface IntegrationInput {
  slug: string;
  bindingKey?: string | undefined;
  scenarioKey?: string | undefined;
  recipeKey?: string | undefined;
}
function integrationScenario(model: PublicModel, input: IntegrationInput) {
  const binding = model.apiBindings.find(
    (entry) => entry['key'] === (input.bindingKey ?? model.defaultBindingKey),
  );
  if (!binding) fail('not_found');
  const scenarios = Array.isArray(binding['scenarios']) ? binding['scenarios'].map(record) : [];
  const scenario = scenarios.find(
    (entry) => entry['key'] === (input.scenarioKey ?? binding['defaultScenarioKey']),
  );
  const recipeKey = input.recipeKey ?? 'core.http';
  if (
    !scenario ||
    !Array.isArray(binding['recipeKeys']) ||
    !binding['recipeKeys'].includes(recipeKey) ||
    recipeKey !== 'core.http'
  )
    fail('not_found');
  return { binding, scenario, recipeKey };
}
async function integrationSite(session: DeliverySession) {
  const { rows } = await readRows(session.runtime, session.tx, {
    collection: 'site',
    locale: session.locale,
    where: selectedLocale(session.locale),
    pageSize: 1,
  });
  const [site] = rows;
  if (!site || !text(site.data['apiBaseUrl'])) fail('temporarily_unavailable');
  return site;
}
async function documentationUrl(session: DeliverySession, slug: string): Promise<string | null> {
  if (!slug) return null;
  const page = await readRows(session.runtime, session.tx, {
    collection: 'documents',
    locale: session.locale,
    where: {
      and: [selectedLocale(session.locale), { field: 'slug', operator: 'eq', value: slug }],
    },
    pageSize: 1,
  });
  return page.rows.length === 0
    ? null
    : `/${encodeURIComponent(session.locale)}/docs/${encodeURIComponent(slug)}`;
}
export async function readIntegrations(
  session: DeliverySession,
  input: IntegrationInput,
  supplied?: PublicModel,
): Promise<PublicIntegrationExamples> {
  const model = supplied ?? (await readModel(session, input.slug)).model;
  const { binding, scenario, recipeKey } = integrationScenario(model, input);
  const site = await integrationSite(session);
  const profileKey = text(binding['profileKey']);
  const flowKey = text(scenario['flowKey']);
  let examples;
  try {
    examples = renderIntegrationExamples({
      profileKey,
      flowKey,
      modelId: model.modelId,
      requestValues: scenario['requestValues'],
      baseUrl: text(site.data['apiBaseUrl']),
      policy: session.options.examplePolicy,
    });
  } catch {
    return fail('temporarily_unavailable');
  }
  return {
    modelId: model.modelId,
    bindingKey: text(binding['key']),
    profileKey,
    recipeKey,
    flowKey,
    scenarioKey: text(scenario['key']),
    examples,
    agentInstructions: [
      text(scenario['title']),
      text(scenario['description']),
      `Model: ${model.modelId}`,
      `Protocol: ${profileKey}`,
      `Flow: ${flowKey}`,
      'Use one stable idempotency key for each generation intent. Preserve that key after an uncertain response. Read each example dependency before executing it.',
    ]
      .filter(Boolean)
      .join('\n'),
    documentationUrl: await documentationUrl(session, text(site.data['defaultDocumentSlug'])),
  };
}
