'use client';

import { useSearchParams } from 'next/navigation';
import { useShell } from '../../components/shell/shell-provider';

export function useContentLocale(): string {
  const params = useSearchParams();
  const language = useShell((state) => state.locale);
  return params.get('locale') ?? language;
}
