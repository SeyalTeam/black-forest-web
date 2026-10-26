/**
 * API URL helper for the standalone frontend.
 * All API calls go to the PayloadCMS backend.
 */

export const DEFAULT_API_URL = (
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
  'https://blackforest-api.vseyal.com'
).replace(/\/+$/, '');

/**
 * Resolve the active API Base URL.
 * Checks for runtime override in sessionStorage/localStorage first (e.g. from table QR redirect ?apiDomain=...),
 * then falls back to NEXT_PUBLIC_API_URL configured via .env.local.
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    try {
      // 1. Check if an emergency/live apiDomain was passed in the URL (e.g. from QR scan redirect)
      const urlParams = new URLSearchParams(window.location.search);
      const queryDomain = urlParams.get('apiDomain') || urlParams.get('apiUrl');
      if (queryDomain && /^https?:\/\//i.test(queryDomain)) {
        const clean = queryDomain.trim().replace(/\/+$/, '');
        sessionStorage.setItem('bf_runtime_api_url', clean);
        localStorage.setItem('bf_runtime_api_url', clean);
        return clean;
      }

      // 2. Check if a runtime override exists in session/local storage
      const override =
        sessionStorage.getItem('bf_runtime_api_url') ||
        localStorage.getItem('bf_runtime_api_url');
      if (override && /^https?:\/\//i.test(override)) {
        return override.replace(/\/+$/, '');
      }
    } catch {}
  }
  return DEFAULT_API_URL;
}

/**
 * Backward compatibility export
 */
export const API_URL = DEFAULT_API_URL;

/**
 * Build a full API endpoint URL using the active runtime base.
 */
export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}

/**
 * Programmatically set the runtime API URL (used for emergency failover).
 */
export function setRuntimeApiUrl(url: string): void {
  if (typeof window !== 'undefined' && url && /^https?:\/\//i.test(url)) {
    try {
      const clean = url.trim().replace(/\/+$/, '');
      sessionStorage.setItem('bf_runtime_api_url', clean);
      localStorage.setItem('bf_runtime_api_url', clean);
    } catch {}
  }
}
