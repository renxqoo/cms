'use client';

import { useTranslations } from 'next-intl';
import { buttonStyles } from '@new-cms/ui/actions';
import { AppLink } from '../../components/shell/navigation/app-link';
import { AdvancedInputsShowcase } from './advanced-inputs-showcase';
import { TextInputsExample, ChoiceInputsExample, MultiTextExample } from './input-fields';
import {
  PillSelectionExample,
  SelectInputsExample,
  AsyncSelectionExample,
  TimezoneExample,
} from './input-selection';
import { SearchInputsExample } from './input-search';
import { LoginExample } from './login-example';
import { LabPage } from './lab-page';
import { LabSection } from './lab-section';

export function InputsShowcase() {
  const t = useTranslations('inputs');
  return (
    <LabPage category="inputs">
      <TextInputsExample />
      <ChoiceInputsExample />
      <MultiTextExample />
      <PillSelectionExample />
      <SelectInputsExample />
      <AsyncSelectionExample />
      <TimezoneExample />
      <SearchInputsExample />
      <AdvancedInputsShowcase />
      <LabSection title={t('relationships')} description={t('relationshipsDescription')}>
        <AppLink
          href="/ui/documents"
          prefetch={false}
          className={buttonStyles({ variant: 'outline' })}
        >
          {t('openRelationships')}
        </AppLink>
      </LabSection>
      <LoginExample />
    </LabPage>
  );
}
