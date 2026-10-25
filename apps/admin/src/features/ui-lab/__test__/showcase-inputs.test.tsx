import { expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderLab } from './lab-support';
import { ChoiceInputsExample, MultiTextExample, TextInputsExample } from '../input-fields';
import {
  AsyncSelectionExample,
  PillSelectionExample,
  SelectInputsExample,
  TimezoneExample,
} from '../input-selection';
import { SearchInputsExample } from '../input-search';
import { LoginExample } from '../login-example';

it('text fields preserve labels, local values, password visibility and read-only states', async () => {
  const user = userEvent.setup();
  renderLab(<TextInputsExample />, { locale: 'en', pathname: '/ui/inputs' });
  await user.clear(screen.getByRole('textbox', { name: 'Example title' }));
  await user.type(screen.getByRole('textbox', { name: 'Example title' }), 'Article title');
  await user.type(screen.getByRole('textbox', { name: 'Multiline notes' }), 'Local notes');
  const password = screen.getByLabelText('Example password');
  expect(password).toHaveAttribute('type', 'password');
  await user.click(screen.getByRole('button', { name: 'Show example password' }));
  expect(password).toHaveAttribute('type', 'text');
  await user.click(screen.getByRole('button', { name: 'Hide example password' }));
  expect(password).toHaveAttribute('type', 'password');
  expect(screen.getByRole('textbox', { name: 'Read-only input' })).toHaveAttribute('readonly');
  expect(screen.getByRole('textbox', { name: 'Disabled input' })).toBeDisabled();
  expect(screen.getByLabelText('Current local field values')).toHaveTextContent('Article title');
  expect(screen.getByLabelText('Current local field values')).toHaveTextContent('Local notes');
});

it('choice controls produce their actual boolean, radio and native option values', async () => {
  const user = userEvent.setup();
  renderLab(<ChoiceInputsExample />, { locale: 'en' });
  await user.click(screen.getByRole('checkbox', { name: 'Enable local option' }));
  await user.click(screen.getByRole('switch', { name: 'Enable example switch' }));
  await user.click(screen.getByRole('radio', { name: 'Comfortable' }));
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Native selection' }),
    'engineering',
  );
  expect(screen.getByRole('checkbox', { name: 'Unavailable option' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  expect(screen.getByLabelText('Current local field values')).toHaveTextContent('"checked": true');
  expect(screen.getByLabelText('Current local field values')).toHaveTextContent('"enabled": false');
  expect(screen.getByLabelText('Current local field values')).toHaveTextContent(
    '"density": "comfortable"',
  );
  expect(screen.getByLabelText('Current local field values')).toHaveTextContent(
    '"native": "engineering"',
  );
});

it('multi-text items can be edited, appended and removed before locking the entire editor', async () => {
  const user = userEvent.setup();
  renderLab(<MultiTextExample />, { locale: 'en' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Text item: CMS' }), {
    target: { value: 'Content' },
  });
  await user.type(screen.getByRole('textbox', { name: 'New text item' }), 'Media');
  await user.click(screen.getByRole('button', { name: 'Add text item' }));
  expect(screen.getByRole('textbox', { name: 'Text item: Media' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Remove text item: OneAster' }));
  expect(screen.getByLabelText('Current local field values')).toHaveTextContent(
    '[ "Content", "Media" ]',
  );
  await user.click(screen.getByRole('checkbox', { name: 'Read-only mode' }));
  expect(screen.getByRole('textbox', { name: 'Text item: Content' })).toHaveAttribute('readonly');
  expect(screen.getByRole('button', { name: 'Remove text item: Media' })).toBeDisabled();
});

it('pill selection switches from multiple values to one value and permits removal', async () => {
  const user = userEvent.setup();
  renderLab(<PillSelectionExample />, { locale: 'en' });
  await user.click(screen.getByRole('button', { name: 'Design' }));
  expect(screen.getByLabelText('Current local field values')).toHaveTextContent(
    '[ "editorial", "design" ]',
  );
  await user.click(screen.getByRole('checkbox', { name: 'Allow multiple selections' }));
  expect(screen.getByLabelText('Current local field values')).toHaveTextContent('[ "editorial" ]');
  await user.click(screen.getByRole('button', { name: 'Engineering' }));
  expect(screen.getByLabelText('Current local field values')).toHaveTextContent(
    '[ "engineering" ]',
  );
  await user.click(screen.getByRole('button', { name: 'Remove Engineering' }));
  expect(screen.getByLabelText('Current local field values')).toHaveTextContent('[]');
});

it('grouped single and multiple select examples expose searchable popup controls and retained selections', async () => {
  const user = userEvent.setup();
  renderLab(<SelectInputsExample />, { locale: 'en' });
  await user.click(screen.getByRole('combobox', { name: 'Single selection' }));
  const single = await screen.findByRole('dialog', { name: 'Single selection' });
  await user.type(
    within(single).getByRole('combobox', { name: 'Single selection' }),
    'Engineering',
  );
  await user.click(await within(single).findByRole('option', { name: 'Engineering' }));
  expect(screen.getByLabelText('Current local field values')).toHaveTextContent(
    '"single": "engineering"',
  );
  await user.click(screen.getByRole('combobox', { name: 'Multiple selection' }));
  const multiple = await screen.findByRole('dialog', { name: 'Multiple selection' });
  await user.click(within(multiple).getByRole('option', { name: 'Design' }));
  await user.keyboard('{Escape}');
  expect(screen.getByLabelText('Current local field values')).toHaveTextContent(
    '"editorial", "design"',
  );
  await user.click(screen.getByRole('button', { name: 'Remove Editorial' }));
  expect(screen.getByLabelText('Current local field values')).not.toHaveTextContent('editorial');
});

it('async selection loads and creates a local option while failure remains visible and recoverable', async () => {
  const user = userEvent.setup();
  renderLab(<AsyncSelectionExample />, { locale: 'en' });
  await user.click(screen.getByRole('combobox', { name: 'Async selection' }));
  const popup = await screen.findByRole('dialog', { name: 'Async selection' });
  const search = within(popup).getByRole('combobox', { name: 'Async selection' });
  await user.type(search, 'Local team');
  const create = await within(popup).findByRole('button', {
    name: 'Create local option “Local team”',
  });
  await waitFor(() => expect(create).not.toBeDisabled());
  await user.click(create);
  await waitFor(() =>
    expect(screen.getByLabelText('Current local field values')).toHaveTextContent('local-'),
  );
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('checkbox', { name: 'Demonstrate option loading failure' }));
  await user.click(screen.getByRole('combobox', { name: 'Async selection' }));
  const failing = await screen.findByRole('dialog', { name: 'Async selection' });
  await user.type(within(failing).getByRole('combobox', { name: 'Async selection' }), 'Missing');
  expect(
    (await within(failing).findAllByText('The local option example is unavailable.')).length,
  ).toBeGreaterThan(0);
  await user.click(within(failing).getByRole('button', { name: 'Create local option “Missing”' }));
  await waitFor(() =>
    expect(within(failing).getByRole('combobox', { name: 'Async selection' })).not.toBeDisabled(),
  );
  expect(screen.getByLabelText('Current local field values')).toHaveTextContent('local-');
  await user.keyboard('{Escape}');
});

it('timezone selection retains the exact IANA ID rather than converting dates', async () => {
  const user = userEvent.setup();
  renderLab(<TimezoneExample />, { locale: 'en' });
  await user.click(screen.getByRole('combobox', { name: 'IANA timezone selection' }));
  const popup = await screen.findByRole('dialog', { name: 'IANA timezone selection' });
  await user.click(within(popup).getByRole('option', { name: 'New York' }));
  expect(screen.getByLabelText('Current local field values')).toHaveTextContent('America/New_York');
});

it('search examples distinguish a draft from submitted and debounced values and clear both', async () => {
  const user = userEvent.setup();
  renderLab(<SearchInputsExample />, { locale: 'en' });
  await user.type(screen.getByRole('searchbox', { name: 'Example search' }), 'Draft');
  expect(screen.getByLabelText('Last submitted search value')).toBeEmptyDOMElement();
  await user.click(screen.getByRole('button', { name: 'Search' }));
  expect(screen.getByLabelText('Last submitted search value')).toHaveTextContent('Draft');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Search mode' }), 'debounced');
  await user.type(screen.getByRole('searchbox', { name: 'Example search' }), ' edited');
  await waitFor(() =>
    expect(screen.getByLabelText('Last submitted search value')).toHaveTextContent('Draft edited'),
  );
  await user.click(screen.getByRole('button', { name: 'Clear search' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Last submitted search value')).toBeEmptyDOMElement(),
  );
});

it('login components validate locally without serializing or displaying credentials', async () => {
  const user = userEvent.setup();
  renderLab(<LoginExample />, { locale: 'en' });
  const form = screen.getByRole('form', { name: 'Login form component' });
  fireEvent.submit(form);
  expect(screen.getByText('Check required fields and the email format.')).toBeInTheDocument();
  await user.type(
    screen.getByRole('textbox', { name: 'Example email' }),
    'synthetic@example.invalid',
  );
  await user.type(screen.getByLabelText(/Example password/), 'local-example-secret');
  expect(screen.queryByText('Check required fields and the email format.')).not.toBeInTheDocument();
  if (!(form instanceof HTMLFormElement)) throw new Error('Missing native login form');
  expect(Array.from(new FormData(form).entries())).toEqual([]);
  await user.click(screen.getByRole('button', { name: 'Validate form input' }));
  expect(
    screen.getByText('Input passed local form validation. No account was authenticated.'),
  ).toBeInTheDocument();
  expect(screen.queryByText('local-example-secret')).not.toBeInTheDocument();
});
