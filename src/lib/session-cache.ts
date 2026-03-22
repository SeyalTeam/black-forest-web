import type { CategoriesPageData, ProductsPageData } from "@/lib/order-types";

const PAGE_CACHE_TTL_MS = 5 * 60 * 1000;
export const CATEGORIES_CACHE_KEY_PREFIX = "blackforest-order-web-categories-v2:";
export const PRODUCTS_CACHE_KEY_PREFIX = "blackforest-order-web-products:";

type CachedPayload<T> = {
  savedAt?: number;
  data?: T;
};

function buildProductsDataUrl({
  branchId,
  categoryId,
  categoryName,
}: {
  branchId: string;
  categoryId: string;
  categoryName?: string;
}) {
  const query = new URLSearchParams({
    branchId,
    categoryId,
  });
  if (categoryName?.trim()) {
    query.set("categoryName", categoryName.trim());
  }
  return `/api/products-data?${query.toString()}`;
}

async function fetchApiPayload<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed for ${url}`);
  }
  return (await response.json()) as T;
}

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

export function getCategoriesCacheKey(branchId: string) {
  return `${CATEGORIES_CACHE_KEY_PREFIX}${branchId.trim()}`;
}

export function getProductsCacheKey(branchId: string, categoryId: string) {
  return `${PRODUCTS_CACHE_KEY_PREFIX}${branchId.trim()}:${categoryId.trim()}`;
}

export async function prefetchCategoriesPageData(branchId: string) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedBranchId = branchId.trim();
  if (!normalizedBranchId) {
    return;
  }

  const cacheKey = getCategoriesCacheKey(normalizedBranchId);
  if (readSessionCache<CategoriesPageData>(cacheKey)) {
    return;
  }

  try {
    const payload = await fetchApiPayload<CategoriesPageData>(
      `/api/categories-data?branchId=${encodeURIComponent(normalizedBranchId)}`,
    );
    writeSessionCache(cacheKey, payload);
  } catch {
    // Ignore prefetch failures and let the target page do the normal fetch.
  }
}

export async function prefetchProductsPageData({
  branchId,
  categoryId,
  categoryName,
}: {
  branchId: string;
  categoryId: string;
  categoryName?: string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedBranchId = branchId.trim();
  const normalizedCategoryId = categoryId.trim();
  if (!normalizedBranchId || !normalizedCategoryId) {
    return;
  }

  const cacheKey = getProductsCacheKey(normalizedBranchId, normalizedCategoryId);
  if (readSessionCache<ProductsPageData>(cacheKey)) {
    return;
  }

  try {
    const payload = await fetchApiPayload<ProductsPageData>(
      buildProductsDataUrl({
        branchId: normalizedBranchId,
        categoryId: normalizedCategoryId,
        categoryName,
      }),
    );
    writeSessionCache(cacheKey, payload);
  } catch {
    // Ignore prefetch failures and let the target page do the normal fetch.
  }
}
