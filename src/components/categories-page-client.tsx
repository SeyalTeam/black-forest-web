"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { readBranchSession, writeBranchSession } from "@/components/branch-session";
import { BottomNav } from "@/components/bottom-nav";
import { BackIcon, SearchIcon } from "@/components/menu-icons";
import styles from "@/components/menu.module.css";
import type { CategoriesPageData } from "@/lib/order-types";
import {
  getCategoriesCacheKey,
  prefetchProductsPageData,
  readSessionCache,
  writeSessionCache,
} from "@/lib/session-cache";

function productHref(categoryId: string, categoryName: string) {
  const query = new URLSearchParams({
    name: categoryName,
    from: "categories",
  });
  return `/products/${encodeURIComponent(categoryId)}?${query.toString()}`;
}

type CategoriesPageClientProps = {
  initialPageData: CategoriesPageData | null;
  initialBranchId: string | null;
};

export default function CategoriesPageClient({
  initialPageData,
  initialBranchId,
}: CategoriesPageClientProps) {
  const router = useRouter();
  const initialBranchName = initialPageData?.branchName ?? "";
  const [pageData, setPageData] = useState<CategoriesPageData | null>(initialPageData);
  const [branchId, setBranchId] = useState<string | null>(initialBranchId);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(Boolean(initialBranchId && !initialPageData));
  const [errorMessage, setErrorMessage] = useState("");
  const [hasAccess, setHasAccess] = useState<boolean | null>(
    initialBranchId ? true : null,
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const session = readBranchSession();
      const resolvedBranchId = initialBranchId?.trim() || session?.branchId || "";

      if (!resolvedBranchId) {
        setHasAccess(false);
        setIsLoading(false);
        return;
      }

      setHasAccess(true);
      setBranchId(resolvedBranchId);
      writeBranchSession(
        resolvedBranchId,
        initialBranchName || session?.branchName || "",
      );
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [initialBranchId, initialBranchName]);

  useEffect(() => {
    if (!branchId) return;
    let isDisposed = false;

    const loadPageData = async () => {
      const cacheKey = getCategoriesCacheKey(branchId);
      const cached = readSessionCache<CategoriesPageData>(cacheKey);
      const hasInitialData = initialPageData?.branchId === branchId;
      setErrorMessage("");

      if (cached) {
        setPageData((current) => (current?.branchId === branchId ? current : cached));
        setIsLoading(false);
        return;
      }

      if (hasInitialData && initialPageData) {
        setPageData((current) => (current?.branchId === branchId ? current : initialPageData));
        writeSessionCache(cacheKey, initialPageData);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const response = await fetch(
          `/api/categories-data?branchId=${encodeURIComponent(branchId)}`,
        );
        if (!response.ok) {
          throw new Error("Failed to load categories");
        }

        const payload = (await response.json()) as CategoriesPageData;
        if (isDisposed) return;
        setPageData(payload);
        writeSessionCache(cacheKey, payload);
      } catch (error) {
        if (isDisposed) return;
        if (cached) return;
        setErrorMessage(error instanceof Error ? error.message : "Failed to load categories");
      } finally {
        if (!isDisposed) {
          setIsLoading(false);
        }
      }
    };

    void loadPageData();
    return () => {
      isDisposed = true;
    };
  }, [branchId, initialPageData]);

  useEffect(() => {
    if (!branchId || !pageData?.categories?.length) {
      return;
    }

    const warmCategories = pageData.categories.slice(0, 6);
    for (const category of warmCategories) {
      void prefetchProductsPageData({
        branchId,
        categoryId: category.id,
        categoryName: category.name,
      });
    }
  }, [branchId, pageData?.categories]);

  const visibleCategories = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return pageData?.categories ?? [];
    }

    return (pageData?.categories ?? []).filter((category) =>
      category.name.toLowerCase().includes(query),
    );
  }, [pageData?.categories, searchQuery]);

  const returnToPrevious = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/");
  };

  const warmCategory = (categoryId: string, categoryName: string) => {
    if (!branchId) return;
    const href = productHref(categoryId, categoryName);
    void router.prefetch(href);
    void prefetchProductsPageData({
      branchId,
      categoryId,
      categoryName,
    });
  };

  if (hasAccess === false) {
    return (
      <main className={styles.page}>
        <section className={styles.shell}>
          <section className={styles.subPage}>
            <div className={styles.statusCard}>
              <strong>Access blocked</strong>
              Open the homepage first and complete branch location verification.
            </div>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <section className={styles.subPage}>
          <header className={styles.pageHeader}>
            <button
              type="button"
              className={styles.backButton}
              aria-label="Back to home"
              onClick={returnToPrevious}
            >
              <BackIcon className={styles.backIcon} />
            </button>
            <label className={styles.headerSearch}>
              <SearchIcon className={styles.inlineIconLarge} />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search in categories"
              />
            </label>
          </header>

          {isLoading ? <div className={styles.statusCard}>Loading categories...</div> : null}
          {!isLoading && errorMessage ? <div className={styles.statusCard}>{errorMessage}</div> : null}
          {!isLoading && !errorMessage && visibleCategories.length === 0 ? (
            <div className={styles.statusCard}>No categories found.</div>
          ) : null}

          {!isLoading && !errorMessage && visibleCategories.length > 0 ? (
            <div className={styles.categoryGrid}>
              {visibleCategories.map((category) => (
                <Link
                  key={category.id}
                  href={productHref(category.id, category.name)}
                  className={styles.categoryCard}
                  onMouseEnter={() => warmCategory(category.id, category.name)}
                  onFocus={() => warmCategory(category.id, category.name)}
                  onTouchStart={() => warmCategory(category.id, category.name)}
                >
                  <div
                    className={styles.categoryCardMedia}
                    style={{
                      backgroundImage: category.imageUrl
                        ? `linear-gradient(rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.12)), url("${category.imageUrl}")`
                        : undefined,
                    }}
                  />
                  <div className={styles.categoryCardLabel}>{category.name}</div>
                </Link>
              ))}
            </div>
          ) : null}
        </section>
      </section>
      <BottomNav />
    </main>
  );
}
