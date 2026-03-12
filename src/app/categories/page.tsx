"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { readBranchSession } from "@/components/branch-session";
import { BackIcon, SearchIcon } from "@/components/menu-icons";
import styles from "@/components/menu.module.css";
import type { CategoriesPageData } from "@/lib/order-types";
import { readSessionCache, writeSessionCache } from "@/lib/session-cache";

const CATEGORIES_CACHE_KEY_PREFIX = "blackforest-order-web-categories:";

function productHref(categoryId: string, categoryName: string) {
  const query = new URLSearchParams({
    name: categoryName,
    from: "categories",
  });
  return `/products/${encodeURIComponent(categoryId)}?${query.toString()}`;
}

export default function CategoriesPage() {
  const router = useRouter();
  const [pageData, setPageData] = useState<CategoriesPageData | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const session = readBranchSession();
      if (!session?.branchId) {
        setHasAccess(false);
        setIsLoading(false);
        return;
      }

      setHasAccess(true);
      setBranchId(session.branchId);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!branchId) return;
    let isDisposed = false;

    const loadPageData = async () => {
      const cacheKey = `${CATEGORIES_CACHE_KEY_PREFIX}${branchId}`;
      const cached = readSessionCache<CategoriesPageData>(cacheKey);
      if (cached) {
        setPageData(cached);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
      setErrorMessage("");

      try {
        const response = await fetch(`/api/categories-data?branchId=${encodeURIComponent(branchId)}`, {
          cache: "no-store",
        });
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
  }, [branchId]);

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
    </main>
  );
}
