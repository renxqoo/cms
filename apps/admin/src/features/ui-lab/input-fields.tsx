'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Checkbox,
  Field,
  Input,
  MultiTextInput,
  NativeSelect,
  PasswordInput,
  RadioGroup,
  Switch,
  Textarea,
} from '@new-cms/ui/forms';
import type { TextValue } from '@new-cms/ui/forms';
import { LabOutput, LabSection } from './lab-section';
import { useSortingLabels } from './sorting-labels';

export function TextInputsExample() {
  const t = useTranslations('inputs');
  const [title, setTitle] = useState('OneAster');
  const [notes, setNotes] = useState('');
  return (
    <LabSection title={t('text')}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field id="inputs-title" label={t('title')} description={t('titleDescription')} required>
          <Input
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            placeholder={t('placeholder')}
          />
        </Field>
        <Field id="inputs-password" label={t('password')}>
          <PasswordInput
            showLabel={t('showPassword')}
            hideLabel={t('hidePassword')}
            autoComplete="off"
          />
        </Field>
        <Field id="inputs-readonly" label={t('readOnly')}>
          <Input value={t('readonlyValue')} readOnly />
        </Field>
        <Field id="inputs-disabled" label={t('disabled')}>
          <Input value={t('disabledValue')} disabled />
        </Field>
      </div>
      <Field id="inputs-notes" label={t('notes')}>
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.currentTarget.value)}
          placeholder={t('placeholder')}
        />
      </Field>
      <LabOutput label={t('values')} value={{ title, notes }} />
    </LabSection>
  );
}

export function ChoiceInputsExample() {
  const t = useTranslations('inputs');
  const [checked, setChecked] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [density, setDensity] = useState<string | null>('compact');
  const [native, setNative] = useState('design');
  return (
    <LabSection title={t('choices')}>
      <div className="flex flex-wrap items-center gap-5">
        <Checkbox label={t('checkbox')} checked={checked} onCheckedChange={setChecked} />
        <Switch label={t('switch')} checked={enabled} onCheckedChange={setEnabled} />
        <Checkbox label={t('unavailable')} disabled />
      </div>
      <RadioGroup
        label={t('radio')}
        value={density}
        onValueChange={setDensity}
        options={[
          { value: 'compact', label: t('compact') },
          { value: 'comfortable', label: t('comfortable') },
          { value: 'unavailable', label: t('unavailable'), disabled: true },
        ]}
      />
      <Field id="inputs-native" label={t('native')}>
        <NativeSelect value={native} onChange={(event) => setNative(event.currentTarget.value)}>
          <option value="design">{t('design')}</option>
          <option value="engineering">{t('engineering')}</option>
        </NativeSelect>
      </Field>
      <LabOutput label={t('values')} value={{ checked, enabled, density, native }} />
    </LabSection>
  );
}

export function MultiTextExample() {
  const t = useTranslations('inputs');
  const [value, setValue] = useState<readonly TextValue[]>([
    { id: 'tag-oneaster', value: 'OneAster' },
    { id: 'tag-cms', value: 'CMS' },
  ]);
  const [readOnly, setReadOnly] = useState(false);
  const sorting = useSortingLabels(t('multiText'));
  return (
    <LabSection title={t('multiText')}>
      <Checkbox label={t('lock')} checked={readOnly} onCheckedChange={setReadOnly} />
      <MultiTextInput
        value={value}
        onChange={setValue}
        createId={() => crypto.randomUUID()}
        readOnly={readOnly}
        sorting={sorting}
        labels={{
          inputLabel: t('textDraft'),
          addLabel: t('addText'),
          itemLabel: (item) => t('item', { value: item.value }),
          removeLabel: (item) => t('removeItem', { value: item.value }),
        }}
      />
      <LabOutput label={t('values')} value={value.map((item) => item.value)} />
    </LabSection>
  );
}
