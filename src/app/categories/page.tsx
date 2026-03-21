import { cookies } from "next/headers";
import CategoriesPageClient from "@/components/categories-page-client";
import { COOKIE_BRANCH_ID_KEY } from "@/components/branch-session";
import { getCategoriesPageData } from "@/lib/home-data";

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

export default async function CategoriesPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const cookieStore = await cookies();

  const requestedBranchId = readSearchParam(resolvedSearchParams, "branchId");
  const cookieBranchId = readCookieValue(cookieStore.get(COOKIE_BRANCH_ID_KEY)?.value);
  const initialBranchId = requestedBranchId || cookieBranchId || "";
  const initialPageData = initialBranchId ? await getCategoriesPageData(initialBranchId) : null;

  return (
    <CategoriesPageClient
      initialPageData={initialPageData}
      initialBranchId={initialBranchId || null}
    />
  );
}
