import { expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderLab } from './lab-support';
import { OverlaysShowcase } from '../overlays-showcase';

it('the form keeps failed input, retries locally and a nested Escape closes only its top layer', async () => {
  const user = userEvent.setup();
  renderLab(<OverlaysShowcase />, { locale: 'en', pathname: '/ui/overlays' });
  const trigger = screen.getByRole('button', { name: 'Open example form' });
  await user.click(trigger);
  const form = await screen.findByRole('dialog', { name: 'Local example form' });
  await user.type(
    within(form).getByRole('textbox', { name: 'Example title' }),
    'Synthetic article',
  );
  const nested = within(form).getByRole('button', { name: 'Open nested dialog' });
  await user.click(nested);
  expect(await screen.findByRole('dialog', { name: 'Nested dialog' })).toBeInTheDocument();
  await user.keyboard('{Escape}');
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Nested dialog' })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('dialog', { name: 'Local example form' })).toBeInTheDocument();
  expect(nested).toHaveFocus();
  await user.click(within(form).getByRole('checkbox', { name: 'Demonstrate submission failure' }));
  await user.click(within(form).getByRole('button', { name: 'Apply local input' }));
  expect(await within(form).findByText(/This is a synthetic error/)).toBeInTheDocument();
  expect(within(form).getByRole('textbox', { name: 'Example title' })).toHaveValue(
    'Synthetic article',
  );
  await user.click(within(form).getByRole('checkbox', { name: 'Demonstrate submission failure' }));
  await user.click(within(form).getByRole('button', { name: 'Apply local input' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Local example form' })).not.toBeInTheDocument(),
  );
  expect(screen.getByLabelText('Latest local submission')).toHaveTextContent('Synthetic article');
  expect(trigger).toHaveFocus();
});

it('the drawer restores focus and destructive confirmation can fail and retry without counting a failure', async () => {
  const user = userEvent.setup();
  renderLab(<OverlaysShowcase />, { locale: 'en', pathname: '/ui/overlays' });
  const drawerTrigger = screen.getByRole('button', { name: 'Open details drawer' });
  await user.click(drawerTrigger);
  expect(await screen.findByRole('dialog', { name: 'Example details' })).toBeInTheDocument();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(drawerTrigger).toHaveFocus());
  await user.click(screen.getByRole('button', { name: 'Open local confirmation' }));
  const dialog = await screen.findByRole('dialog', { name: 'Confirm the local example action' });
  await user.click(
    within(dialog).getByRole('checkbox', { name: 'Demonstrate submission failure' }),
  );
  await user.click(within(dialog).getByRole('button', { name: 'Confirm local action' }));
  expect(await within(dialog).findByText(/This is a synthetic error/)).toBeInTheDocument();
  await user.click(
    within(dialog).getByRole('checkbox', { name: 'Demonstrate submission failure' }),
  );
  await user.click(within(dialog).getByRole('button', { name: 'Confirm local action' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByText('1 local confirmations recorded')).toBeInTheDocument();
});

it('menu actions open their own dialogs, popovers retain choices and tooltips respond to focus', async () => {
  const user = userEvent.setup();
  renderLab(<OverlaysShowcase />, { locale: 'en', pathname: '/ui/overlays' });
  const menu = screen.getByRole('button', { name: 'Open row actions' });
  await user.click(menu);
  expect(await screen.findByRole('menuitem', { name: 'Unavailable action' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await user.click(screen.getByRole('menuitem', { name: 'View example details' }));
  expect(await screen.findByRole('dialog', { name: 'Example details' })).toBeInTheDocument();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(menu).toHaveFocus());
  await user.click(menu);
  await user.click(await screen.findByRole('menuitem', { name: 'Destructive-style confirmation' }));
  await user.click(await screen.findByRole('button', { name: 'Confirm local action' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByLabelText('Confirmation and recovery')).toHaveTextContent(
    '1 local confirmations recorded',
  );
  await user.click(screen.getByRole('button', { name: 'Open popover' }));
  const popup = await screen.findByRole('dialog', { name: 'Filter information' });
  await user.click(within(popup).getByRole('checkbox', { name: 'Enable local option' }));
  await user.click(within(popup).getByRole('button', { name: 'Close' }));
  await user.click(screen.getByRole('button', { name: 'Open popover' }));
  expect(await screen.findByRole('checkbox', { name: 'Enable local option' })).toBeChecked();
  await user.keyboard('{Escape}');
  screen.getByRole('button', { name: 'Show tooltip' }).focus();
  expect(await screen.findByRole('tooltip')).toHaveTextContent(
    'Tooltips support both pointer hover and keyboard focus.',
  );
});
