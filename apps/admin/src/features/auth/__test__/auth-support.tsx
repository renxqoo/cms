import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { parsePreferences } from '../../../config/preferences';

export function renderAuth(content: ReactNode, locale: 'zh' | 'en' = 'en') {
  return render(<ShellProvider initial={parsePreferences({ locale })}>{content}</ShellProvider>);
}
