import type { EditorNode } from '../../contracts/editor';

export function labelledOptions(
  options: NonNullable<EditorNode['constraints']['options']>,
  locale: string,
): { value: string; label: string }[] {
  return options.map((option) => {
    if (typeof option === 'string') return { value: option, label: option };
    const label =
      typeof option.label === 'string'
        ? option.label
        : (option.label[locale] ?? option.label[locale.split('-')[0] ?? ''] ?? option.value);
    return { value: option.value, label };
  });
}
