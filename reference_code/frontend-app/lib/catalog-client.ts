// U13: /api/catalog(BFF) fetch → GovernanceBadge 소스. 실패는 조용히 무시(뱃지 생략 G4).
import type { CatalogResponse } from './types';

export async function fetchCatalog(): Promise<CatalogResponse | null> {
  try {
    const res = await fetch('/api/catalog', { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return (await res.json()) as CatalogResponse;
  } catch {
    return null; // degrade: 뱃지 생략, 지도는 정상
  }
}
