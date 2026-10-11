import { cookies } from "next/headers";
import CategoriesPageClient from "@/components/frontend/categories-page-client";
import { COOKIE_BRANCH_ID_KEY } from "@/components/frontend/branch-session";
import { apiUrl } from "@/lib/api";
import type { CategoriesPageData } from "@/lib/order-types";

type SearchParamValue = string | string[] | undefined;

type PageProps = {
  searchParams?: Promise<Record<string, SearchParamValue>>;
};

function readSearchParam(
  searchParams: Record<string, SearchParamValue>,
  key: string,
) {
  const value = searchParams[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function readCookieValue(value?: string) {
  if (!value) {
    return "";
  }

  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

async function fetchCategoriesPageData(branchId: string): Promise<CategoriesPageData | null> {
  try {
    const url = apiUrl(`/api/categories-data${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ""}`);
    const response = await fetch(url, { next: { revalidate: 60 } });
    if (!response.ok) return null;
    return (await response.json()) as CategoriesPageData;
  } catch (error) {
    console.warn("[CategoriesPage] Failed to fetch initialPageData during SSR:", error);
    return null;
  }
}

export default async function CategoriesPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const cookieStore = await cookies();

  const requestedBranchId = readSearchParam(resolvedSearchParams, "branchId");
  const cookieBranchId = readCookieValue(cookieStore.get(COOKIE_BRANCH_ID_KEY)?.value);
  const initialBranchId = requestedBranchId || cookieBranchId || "";
  const initialPageData = initialBranchId ? await fetchCategoriesPageData(initialBranchId) : null;

  return (
    <CategoriesPageClient
      initialPageData={initialPageData}
      initialBranchId={initialBranchId || null}
    />
  );
}
