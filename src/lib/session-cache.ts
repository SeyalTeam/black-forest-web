const PAGE_CACHE_TTL_MS = 5 * 60 * 1000;

type CachedPayload<T> = {
  savedAt?: number;
  data?: T;
};

export function readSessionCache<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as CachedPayload<T>;
    if (
      !parsed.data ||
      !parsed.savedAt ||
      Date.now() - parsed.savedAt > PAGE_CACHE_TTL_MS
    ) {
      window.sessionStorage.removeItem(key);
      return null;
    }

    return parsed.data;
  } catch {
    window.sessionStorage.removeItem(key);
    return null;
  }
}

export function writeSessionCache<T>(key: string, data: T) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    key,
    JSON.stringify({
      savedAt: Date.now(),
      data,
    }),
  );
}
