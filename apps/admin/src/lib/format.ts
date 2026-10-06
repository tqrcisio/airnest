const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const shortDateTime = new Intl.DateTimeFormat(undefined, {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatShortDateTime = (iso: string) => shortDateTime.format(new Date(iso));

export function formatDuration(fromIso: string, toIso: string) {
  const seconds = (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds % 60)} s`;
}
