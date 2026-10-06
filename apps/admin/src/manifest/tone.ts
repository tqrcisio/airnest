import type { FieldManifest, Tone } from '@/lib/types';

export const toneBadge: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  success: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  danger: 'bg-destructive/12 text-destructive',
};

export const toneSwatch: Record<Tone, string> = {
  neutral: 'bg-muted-foreground/25',
  info: 'bg-sky-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-destructive',
};

export function optionOf(field: FieldManifest | undefined, value: string) {
  return field?.options?.find((option) => option.value === value);
}
