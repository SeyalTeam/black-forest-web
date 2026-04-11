import { cookies } from "next/headers";
import HomePageClient from "@/components/home-page-client";
import {
  COOKIE_ADMIN_AUTH_KEY,
  COOKIE_BRANCH_ID_KEY,
  COOKIE_BRANCH_NAME_KEY,
} from "@/components/branch-session";
import { getHomePageData } from "@/lib/home-data";

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

function readBooleanSearchParam(
  searchParams: Record<string, SearchParamValue>,
  key: string,
) {
  const value = readSearchParam(searchParams, key).toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
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

export default async function HomePage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const cookieStore = await cookies();

  const requestedBranchId = readSearchParam(resolvedSearchParams, "branchId");
  const requestedTableNumber =
    readSearchParam(resolvedSearchParams, "table") ||
    readSearchParam(resolvedSearchParams, "t");
  const requestedTableSection = readSearchParam(resolvedSearchParams, "section");
  const requestedAdminMode = readBooleanSearchParam(resolvedSearchParams, "admin");
  const requestedAdminToken = readSearchParam(resolvedSearchParams, "adminToken");
  const adminToken =
    process.env.BLACKFOREST_HOME_ADMIN_TOKEN?.trim() ||
    process.env.HOME_PAGE_ADMIN_TOKEN?.trim() ||
    "";
  const hasAdminCookie =
    readCookieValue(cookieStore.get(COOKIE_ADMIN_AUTH_KEY)?.value) === "1";
  const isAdminFromToken = Boolean(
    adminToken && requestedAdminToken && requestedAdminToken === adminToken,
  );
  const isAdminMode = isAdminFromToken || (requestedAdminMode && (hasAdminCookie || !adminToken));
  const cookieBranchId = readCookieValue(cookieStore.get(COOKIE_BRANCH_ID_KEY)?.value);
  const cookieBranchName = readCookieValue(cookieStore.get(COOKIE_BRANCH_NAME_KEY)?.value);
  const initialBranchId = requestedBranchId || cookieBranchId || "";
  const initialHomeData = initialBranchId ? await getHomePageData(initialBranchId) : null;

  return (
    <HomePageClient
      initialHomeData={initialHomeData}
      initialBranchId={initialBranchId || null}
      initialBranchName={initialHomeData?.branchName || cookieBranchName}
      initialRequestedBranchId={requestedBranchId}
      initialRequestedTableNumber={requestedTableNumber}
      initialRequestedTableSection={requestedTableSection}
      initialIsAdmin={isAdminMode}
    />
  );
}
