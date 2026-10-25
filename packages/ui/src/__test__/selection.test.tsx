import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import {
  Checkbox,
  Field,
  MultiTextInput,
  PasswordInput,
  PillSelector,
  RadioGroup,
  Select,
  Switch,
  TimezonePicker,
} from '../forms.tsx';
import type { SelectOptionsResult, SelectCreateResult, SelectProps, TextValue } from '../forms.tsx';
import type { SortableLabels } from '../data.tsx';

const sorting: SortableLabels = {
  listLabel: 'Selected values',
  roleDescription: 'Sortable item',
  invalidItemsLabel: 'Invalid selection',
  handleLabel: (value) => `Move ${value}`,
  instructions: 'Press Space to sort',
  start: (value) => `Moving ${value}`,
  move: (value, position, total) => `${value} ${position} of ${total}`,
  end: (value, position, total) => `${value} now ${position} of ${total}`,
  cancel: (value) => `Cancelled ${value}`,
};
const options = [
  { value: 'draft', label: 'Draft', group: 'States' },
  { value: 'live', label: 'Published', group: 'States' },
  { value: 'locked', label: 'Locked', disabled: true },
  { value: 'other', label: 'Other' },
];
const selectLabels = {
  label: 'State',
  placeholder: 'Choose a state',
  emptyLabel: 'No matching states',
  loadingLabel: 'Loading options',
  errorLabel: 'Options failed',
  clearLabel: 'Clear state',
  removeLabel: (label: string) => `Remove ${label}`,
};

async function openSelect(user: ReturnType<typeof userEvent.setup>, label = 'State') {
  if (!screen.queryByRole('dialog', { name: label }))
    await user.click(screen.getByRole('combobox', { name: label }));
  return within(await screen.findByRole('dialog', { name: label })).findByRole('combobox', {
    name: label,
  });
}

function Choices() {
  const [checked, setChecked] = useState(false);
  const [radio, setRadio] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  return (
    <>
      <Checkbox label="Accept changes" checked={checked} onCheckedChange={setChecked} />
      <Checkbox label="Mixed" indeterminate />
      <Checkbox label="Readonly" checked readOnly />
      <RadioGroup
        label="Visibility"
        value={radio}
        onValueChange={setRadio}
        options={[
          { value: 'private', label: 'Private' },
          { value: 'public', label: 'Public' },
          { value: 'locked', label: 'Locked', disabled: true },
        ]}
      />
      <Switch label="Enabled" checked={enabled} onCheckedChange={setEnabled} />
    </>
  );
}

it('uses checkbox, radio and switch keyboard semantics with readonly and disabled choices', async () => {
  const user = userEvent.setup();
  render(<Choices />);
  await user.click(screen.getByRole('checkbox', { name: 'Accept changes' }));
  expect(screen.getByRole('checkbox', { name: 'Accept changes' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Mixed' })).toBePartiallyChecked();
  await user.click(screen.getByRole('checkbox', { name: 'Readonly' }));
  expect(screen.getByRole('checkbox', { name: 'Readonly' })).toBeChecked();
  await user.click(screen.getByRole('radio', { name: 'Private' }));
  expect(screen.getByRole('radio', { name: 'Private' })).toBeChecked();
  await user.click(screen.getByRole('radio', { name: 'Public' }));
  expect(screen.getByRole('radio', { name: 'Public' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Locked' })).toHaveAttribute('aria-disabled', 'true');
  await user.click(screen.getByRole('switch', { name: 'Enabled' }));
  expect(screen.getByRole('switch', { name: 'Enabled' })).toBeChecked();
});

it('keeps password content while toggling visibility and preserves field association', async () => {
  const user = userEvent.setup();
  render(
    <Field id="password" label="Password">
      <PasswordInput
        showLabel="Show password"
        hideLabel="Hide password"
        defaultValue="some-value"
      />
    </Field>,
  );
  const input = screen.getByLabelText('Password');
  expect(input).toHaveAttribute('type', 'password');
  await user.click(screen.getByRole('button', { name: 'Show password' }));
  expect(input).toHaveAttribute('type', 'text');
  expect(input).toHaveValue('some-value');
  await user.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(input).toHaveAttribute('type', 'password');
});

function TextValues({ readOnly = false }: { readOnly?: boolean }) {
  const [value, setValue] = useState<TextValue[]>([
    { id: 'one', value: 'Alpha' },
    { id: 'two', value: 'Beta' },
  ]);
  return (
    <MultiTextInput
      value={value}
      onChange={setValue}
      createId={() => 'three'}
      sorting={sorting}
      readOnly={readOnly}
      labels={{
        inputLabel: 'Add a value',
        addLabel: 'Add',
        itemLabel: (item) => `Value ${item.id}`,
        removeLabel: (item) => `Remove ${item.value}`,
      }}
    />
  );
}

it('adds, edits, removes and reorders text values without losing their stable IDs', async () => {
  const user = userEvent.setup();
  render(<TextValues />);
  await user.type(screen.getByRole('textbox', { name: 'Add a value' }), 'Gamma{Enter}');
  expect(screen.getByRole('textbox', { name: 'Value three' })).toHaveValue('Gamma');
  await user.clear(screen.getByRole('textbox', { name: 'Value one' }));
  await user.type(screen.getByRole('textbox', { name: 'Value one' }), 'Changed');
  expect(screen.getByRole('textbox', { name: 'Value one' })).toHaveValue('Changed');
  await user.click(screen.getByRole('button', { name: 'Remove Beta' }));
  expect(screen.queryByRole('textbox', { name: 'Value two' })).not.toBeInTheDocument();
  screen.getByRole('button', { name: 'Move Value three' }).focus();
  await user.keyboard('[Space][ArrowUp][Space]');
  expect(
    within(screen.getByRole('list', { name: 'Selected values' }))
      .getAllByRole('textbox')
      .map((input) => input.getAttribute('aria-label')),
  ).toEqual(['Value three', 'Value one']);
});

it('prevents readonly text additions and duplicate generated IDs', async () => {
  const change = vi.fn<(value: TextValue[]) => void>();
  const user = userEvent.setup();
  const props = {
    value: [{ id: 'one', value: 'Alpha' }],
    onChange: change,
    createId: () => 'one',
    sorting,
    labels: {
      inputLabel: 'New value',
      addLabel: 'Add',
      itemLabel: (item: TextValue) => item.id,
      removeLabel: (item: TextValue) => `Remove ${item.id}`,
    },
  };
  const view = render(<MultiTextInput {...props} />);
  await user.type(screen.getByRole('textbox', { name: 'New value' }), 'Duplicate');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(change).not.toHaveBeenCalled();
  view.rerender(<MultiTextInput {...props} readOnly />);
  expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  expect(screen.getByRole('textbox', { name: 'New value' })).toHaveAttribute('readonly');
});

function Pills({ multiple = true }: { multiple?: boolean }) {
  const [value, setValue] = useState<string[]>([]);
  return (
    <PillSelector
      options={options}
      value={value}
      onChange={setValue}
      multiple={multiple}
      sorting={sorting}
      removeLabel={(label) => `Remove ${label}`}
    />
  );
}

it('selects multiple pills, removes values and respects single selection', async () => {
  const user = userEvent.setup();
  const view = render(<Pills />);
  await user.click(screen.getByRole('button', { name: 'Draft' }));
  await user.click(screen.getByRole('button', { name: 'Published' }));
  expect(screen.getByRole('button', { name: 'Draft' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: 'Remove Draft' }));
  expect(screen.getByRole('button', { name: 'Draft' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'Locked' })).toBeDisabled();
  view.rerender(<Pills multiple={false} />);
  await user.click(screen.getByRole('button', { name: 'Draft' }));
  expect(screen.getByRole('button', { name: 'Published' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

function SingleSelect() {
  const [value, setValue] = useState<string | null>(null);
  return <Select {...selectLabels} options={options} value={value} onChange={setValue} />;
}

it('searches grouped options by display label, selects and clears a single value', async () => {
  const user = userEvent.setup();
  render(<SingleSelect />);
  await openSelect(user);
  expect(await screen.findByText('States')).toBeVisible();
  await user.type(await openSelect(user), 'Pub');
  expect(screen.queryByRole('option', { name: 'Draft' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('option', { name: 'Published' }));
  await user.click(screen.getByRole('button', { name: 'Clear state' }));
  expect(screen.getByRole('combobox', { name: 'State' })).toHaveAccessibleDescription(
    'Choose a state',
  );
});

function MultiSelect() {
  const [value, setValue] = useState<string[]>(['draft', 'live']);
  return (
    <Select
      {...selectLabels}
      options={options}
      multiple
      value={value}
      onChange={setValue}
      sorting={sorting}
    />
  );
}

it('removes and sorts multi-select tags through the shared sorting mechanism', async () => {
  const user = userEvent.setup();
  render(<MultiSelect />);
  screen.getByRole('button', { name: 'Move Published' }).focus();
  await user.keyboard('[Space][ArrowLeft][Space]');
  expect(
    within(screen.getByRole('list', { name: 'Selected values' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['Published', 'Draft']);
  await user.click(screen.getByRole('button', { name: 'Remove Draft' }));
  expect(screen.queryByRole('button', { name: 'Remove Draft' })).not.toBeInTheDocument();
});

it('cancels obsolete option searches and ignores late responses', async () => {
  const requests: {
    query: string;
    signal: AbortSignal;
    finish: (result: SelectOptionsResult) => void;
  }[] = [];
  const load = vi.fn<
    (input: { query: string; signal: AbortSignal }) => Promise<SelectOptionsResult>
  >(
    (input) =>
      new Promise((finish) => {
        requests.push({ ...input, finish });
      }),
  );
  const user = userEvent.setup();
  const view = render(
    <Select
      {...selectLabels}
      options={[]}
      value={null}
      onChange={vi.fn<(value: string | null) => void>()}
      loadOptions={load}
    />,
  );
  await openSelect(user);
  expect(screen.getByRole('status')).toHaveTextContent('Loading options');
  fireEvent.change(await openSelect(user), { target: { value: 'new' } });
  expect(requests[0]?.signal.aborted).toBe(true);
  await act(async () => {
    requests
      .at(-1)
      ?.finish({ status: 'success', options: [{ value: 'new', label: 'New option' }] });
    await Promise.resolve();
  });
  expect(await screen.findByRole('option', { name: 'New option' })).toBeVisible();
  await act(async () => {
    requests[0]?.finish({ status: 'success', options: [{ value: 'old', label: 'Old option' }] });
    await Promise.resolve();
  });
  expect(screen.queryByRole('option', { name: 'Old option' })).not.toBeInTheDocument();
  view.unmount();
  expect(requests.at(-1)?.signal.aborted).toBe(true);
});

function RemoteSelect({ loadOptions }: { loadOptions: NonNullable<SelectProps['loadOptions']> }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <Select
      {...selectLabels}
      options={[]}
      value={value}
      onChange={setValue}
      loadOptions={loadOptions}
    />
  );
}

it('keeps a selected remote label after closing and a parent rerender instead of exposing its ID', async () => {
  const load = vi.fn<NonNullable<SelectProps['loadOptions']>>().mockResolvedValue({
    status: 'success',
    options: [{ value: 'id-123', label: 'Human readable' }],
  });
  const user = userEvent.setup();
  const view = render(<RemoteSelect loadOptions={load} />);
  await openSelect(user);
  await user.click(await screen.findByRole('option', { name: 'Human readable' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  view.rerender(<RemoteSelect loadOptions={load} />);
  expect(screen.getByRole('combobox', { name: 'State' })).toHaveTextContent('Human readable');
  expect(screen.getByRole('combobox', { name: 'State' })).toHaveAccessibleDescription(
    'Human readable',
  );
});

it('keeps selected remote tag labels across new searches and releases metadata after deselection', async () => {
  const load = vi.fn<NonNullable<SelectProps['loadOptions']>>(({ query }) =>
    Promise.resolve({
      status: 'success',
      options:
        query === 'Second'
          ? [{ value: 'second-id', label: 'Second label' }]
          : [{ value: 'first-id', label: 'First label' }],
    }),
  );
  const change = vi.fn<(value: string[]) => void>();
  const props = {
    ...selectLabels,
    options: [],
    multiple: true as const,
    sorting,
    loadOptions: load,
    onChange: change,
  };
  const user = userEvent.setup();
  const view = render(<Select {...props} value={[]} />);
  await openSelect(user);
  await user.click(await screen.findByRole('option', { name: 'First label' }));
  expect(change).toHaveBeenLastCalledWith(['first-id']);
  view.rerender(<Select {...props} value={['first-id']} />);
  await user.type(await openSelect(user), 'Second');
  expect(await screen.findByRole('option', { name: 'Second label' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Remove First label' })).toBeVisible();
  await user.keyboard('{Escape}');
  view.rerender(<Select {...props} value={['first-id']} />);
  expect(screen.getByRole('combobox', { name: 'State' })).toHaveAccessibleDescription(
    'First label',
  );
  view.rerender(<Select {...props} value={[]} />);
  view.rerender(<Select {...props} value={['first-id']} />);
  expect(screen.getByRole('button', { name: 'Remove first-id' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Remove First label' })).not.toBeInTheDocument();
});

it('does not replace selected metadata with a late response from an aborted search', async () => {
  const requests: {
    signal: AbortSignal;
    finish: (result: SelectOptionsResult) => void;
  }[] = [];
  const load = vi.fn<NonNullable<SelectProps['loadOptions']>>(
    ({ signal }) =>
      new Promise((finish) => {
        requests.push({ signal, finish });
      }),
  );
  const props = {
    ...selectLabels,
    options: [],
    multiple: true as const,
    sorting,
    loadOptions: load,
    value: ['shared-id'],
    onChange: vi.fn<(value: string[]) => void>(),
  };
  const user = userEvent.setup();
  const view = render(<Select {...props} />);
  const input = await openSelect(user);
  fireEvent.change(input, { target: { value: 'Old' } });
  const obsolete = requests.at(-1);
  fireEvent.change(input, { target: { value: 'Newest' } });
  expect(obsolete?.signal.aborted).toBe(true);
  await act(async () => {
    requests.at(-1)?.finish({
      status: 'success',
      options: [{ value: 'shared-id', label: 'Newest readable label' }],
    });
    await Promise.resolve();
  });
  expect(screen.getByRole('button', { name: 'Remove Newest readable label' })).toBeVisible();
  await act(async () => {
    obsolete?.finish({
      status: 'success',
      options: [{ value: 'shared-id', label: 'Obsolete readable label' }],
    });
    await Promise.resolve();
  });
  await user.keyboard('{Escape}');
  view.rerender(<Select {...props} />);
  expect(screen.getByRole('button', { name: 'Remove Newest readable label' })).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Remove Obsolete readable label' }),
  ).not.toBeInTheDocument();
});

it('shows errors for rejected and explicit failed option requests', async () => {
  const user = userEvent.setup();
  const change = vi.fn<(value: string | null) => void>();
  const props = { ...selectLabels, options: [], value: null, onChange: change };
  const view = render(
    <Select {...props} loadOptions={() => Promise.reject(new Error('private'))} />,
  );
  await openSelect(user);
  expect(await screen.findByRole('alert')).toHaveTextContent('Options failed');
  expect(screen.queryByText('private')).not.toBeInTheDocument();
  view.rerender(
    <Select
      {...props}
      loadOptions={() => Promise.resolve({ status: 'error', message: 'Search unavailable' })}
    />,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Search unavailable');
});

it('creates a choice once and reports the returned selection', async () => {
  let finish: ((result: SelectCreateResult) => void) | undefined;
  const create = vi.fn<
    (input: { query: string; signal: AbortSignal }) => Promise<SelectCreateResult>
  >(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const change = vi.fn<(value: string | null) => void>();
  const user = userEvent.setup();
  render(
    <Select
      {...selectLabels}
      options={[]}
      value={null}
      onChange={change}
      onCreate={create}
      createLabel={(query) => `Create ${query}`}
    />,
  );
  await user.type(await openSelect(user), 'Review');
  await user.dblClick(screen.getByRole('button', { name: 'Create Review' }));
  expect(create).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish?.({ status: 'success', option: { value: 'review', label: 'Review' } });
    await Promise.resolve();
  });
  expect(change).toHaveBeenCalledWith('review');
});

it('aborts a new-option operation when the popup closes and keeps failures visible until dismissed', async () => {
  let signal: AbortSignal | undefined;
  let finish: ((result: SelectCreateResult) => void) | undefined;
  const user = userEvent.setup();
  const change = vi.fn<(value: string | null) => void>();
  render(
    <Select
      {...selectLabels}
      options={[]}
      value={null}
      onChange={change}
      onCreate={({ signal: next }) => {
        signal = next;
        return new Promise((resolve) => {
          finish = resolve;
        });
      }}
      createLabel={(query) => `Create ${query}`}
    />,
  );
  await user.type(await openSelect(user), 'Review');
  await user.click(screen.getByRole('button', { name: 'Create Review' }));
  await user.keyboard('{Escape}');
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish?.({ status: 'success', option: { value: 'review', label: 'Review' } });
    await Promise.resolve();
  });
  expect(change).not.toHaveBeenCalled();
});

it('preserves the exact configured IANA timezone identifier', async () => {
  const change = vi.fn<(value: string | null) => void>();
  const user = userEvent.setup();
  render(
    <TimezonePicker
      {...selectLabels}
      label="Timezone"
      timezones={[
        { value: 'Asia/Singapore', label: 'Singapore' },
        { value: 'Europe/Paris', label: 'Paris' },
      ]}
      value={null}
      onChange={change}
    />,
  );
  await user.type(await openSelect(user, 'Timezone'), 'Paris');
  await user.click(screen.getByRole('option', { name: 'Paris' }));
  expect(change).toHaveBeenCalledWith('Europe/Paris');
});

function CreatedMultiSelect() {
  const [value, setValue] = useState<string[]>(['draft']);
  return (
    <Select
      {...selectLabels}
      options={options}
      multiple
      value={value}
      onChange={setValue}
      sorting={sorting}
      onCreate={() =>
        Promise.resolve({ status: 'success', option: { value: 'review', label: 'Review' } })
      }
      createLabel={(query) => `Create ${query}`}
    />
  );
}

it('selects additional multiple options and creates a new tag without replacing existing choices', async () => {
  const user = userEvent.setup();
  render(<CreatedMultiSelect />);
  await openSelect(user);
  await user.click(screen.getByRole('option', { name: 'Other' }));
  expect(screen.getByRole('button', { name: 'Remove Other' })).toBeVisible();
  await user.type(await openSelect(user), 'Review');
  await user.click(screen.getByRole('button', { name: 'Create Review' }));
  expect(await screen.findByRole('button', { name: 'Remove Review' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Remove Draft' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Remove Other' })).toBeVisible();
});

it('shows failed creation feedback and clears the previous popup session errors on close', async () => {
  const create = vi
    .fn<(input: { query: string; signal: AbortSignal }) => Promise<SelectCreateResult>>()
    .mockResolvedValueOnce({ status: 'error', message: 'Choice already exists' })
    .mockRejectedValueOnce(new Error('private failure'));
  const user = userEvent.setup();
  render(
    <Select
      {...selectLabels}
      options={[]}
      value={null}
      onChange={vi.fn<(value: string | null) => void>()}
      onCreate={create}
      createLabel={(query) => `Create ${query}`}
    />,
  );
  await user.type(await openSelect(user), 'Review');
  await user.click(screen.getByRole('button', { name: 'Create Review' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Choice already exists');
  await user.click(screen.getByRole('button', { name: 'Create Review' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Options failed');
  expect(screen.queryByText('private failure')).not.toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('keeps missing values visible until explicit removal and enforces readonly selection', async () => {
  const change = vi.fn<(value: string[]) => void>();
  const user = userEvent.setup();
  const props = {
    ...selectLabels,
    options,
    multiple: true as const,
    value: ['missing'],
    onChange: change,
    sorting,
  };
  const view = render(<Select {...props} />);
  expect(screen.getByRole('combobox', { name: 'State' })).toHaveAccessibleDescription('missing');
  await user.click(screen.getByRole('button', { name: 'Remove missing' }));
  expect(change).toHaveBeenLastCalledWith([]);
  view.rerender(<Select {...props} readOnly />);
  expect(screen.getByRole('button', { name: 'Remove missing' })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: 'State' })).toBeDisabled();
});

it('reorders pill values and preserves missing selected IDs until removed', async () => {
  const user = userEvent.setup();
  const view = render(<Pills />);
  await user.click(screen.getByRole('button', { name: 'Draft' }));
  await user.click(screen.getByRole('button', { name: 'Published' }));
  screen.getByRole('button', { name: 'Move Published' }).focus();
  await user.keyboard('[Space][ArrowLeft][Space]');
  expect(
    within(screen.getByRole('list', { name: 'Selected values' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['Published', 'Draft']);
  const change = vi.fn<(values: string[]) => void>();
  view.rerender(
    <PillSelector
      options={[]}
      value={['missing']}
      onChange={change}
      sorting={sorting}
      removeLabel={(label) => `Remove ${label}`}
    />,
  );
  expect(screen.getByText('missing')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Remove missing' }));
  expect(change).toHaveBeenCalledWith([]);
});

it('does not expose an untranslated private dismiss control when selecting values', async () => {
  const user = userEvent.setup();
  render(<SingleSelect />);
  await openSelect(user);
  expect(screen.queryAllByRole('button', { name: 'Dismiss' })).toHaveLength(0);
});

it('keeps search text out of form data and restores focus after popup dismissal', async () => {
  const user = userEvent.setup();
  const change = vi.fn<(value: string | null) => void>();
  const props = { ...selectLabels, options, value: 'draft', onChange: change };
  const view = render(
    <form aria-label="Document form">
      <Field id="state" label="State">
        <Select {...props} />
      </Field>
    </form>,
  );
  const form = screen.getByRole('form', { name: 'Document form' });
  if (!(form instanceof HTMLFormElement)) throw new Error('Expected form');
  const input = await openSelect(user);
  await waitFor(() => expect(input).toHaveFocus());
  await user.type(input, 'Published');
  expect(new FormData(form).getAll('state')).toEqual(['draft']);
  await user.keyboard('{Escape}');
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'State' })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('combobox', { name: 'State' })).toHaveFocus();
  view.rerender(
    <form aria-label="Document form">
      <Field id="state" label="State">
        <Select {...props} readOnly />
      </Field>
    </form>,
  );
  expect(new FormData(form).getAll('state')).toEqual(['draft']);
  view.rerender(
    <form aria-label="Document form">
      <Field id="state" label="State">
        <Select {...props} disabled />
      </Field>
    </form>,
  );
  expect(new FormData(form).has('state')).toBe(false);
});

it('uses supplied Chinese labels without private English dismissal controls', async () => {
  const user = userEvent.setup();
  render(
    <Select
      {...selectLabels}
      label="状态"
      placeholder="请选择状态"
      emptyLabel="没有匹配项"
      loadingLabel="正在加载"
      errorLabel="加载失败"
      clearLabel="清空状态"
      options={[{ value: 'draft', label: '草稿' }]}
      value={null}
      onChange={vi.fn<(value: string | null) => void>()}
    />,
  );
  const input = await openSelect(user, '状态');
  await waitFor(() => expect(input).toHaveFocus());
  expect(screen.getByRole('option', { name: '草稿' })).toBeVisible();
  expect(screen.queryAllByRole('button', { name: 'Dismiss' })).toHaveLength(0);
});
