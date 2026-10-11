/**
 * API URL helper for the standalone frontend.
 * All API calls go to the PayloadCMS backend.
 */
export const API_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
  'http://localhost:3000';

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_URL}${normalizedPath}`;
}
