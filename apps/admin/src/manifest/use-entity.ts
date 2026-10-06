import { useManifest } from '@/lib/queries';
import type { EntitySlug } from '@/lib/types';

export function useEntity(slug: EntitySlug) {
  const manifest = useManifest();
  return { ...manifest, entity: manifest.data?.entities.find((entity) => entity.slug === slug) };
}
