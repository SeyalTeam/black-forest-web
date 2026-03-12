"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { readBranchSession } from "@/components/branch-session";
import { BackIcon, SearchIcon } from "@/components/menu-icons";
import styles from "@/components/menu.module.css";
import type { CategoriesPageData } from "@/lib/order-types";

function productHref(categoryId: string, categoryName: string) {
  const query = new URLSearchParams({
    name: categoryName,
    from: "categories",
  });
  return `/products/${encodeURIComponent(categoryId)}?${query.toString()}`;
}

export default function CategoriesPage() {
  const [pageData, setPageData] = useState<CategoriesPageData | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [activeOfferIndex, setActiveOfferIndex] = useState(0);

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
      setIsLoading(true);
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
      } catch (error) {
        if (isDisposed) return;
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

  const offerSlides = pageData?.offerSlides ?? [];
  const activeOffer =
    offerSlides.length > 0 ? offerSlides[activeOfferIndex % offerSlides.length] : null;

  useEffect(() => {
    if (offerSlides.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveOfferIndex((current) => (current + 1) % offerSlides.length);
    }, 4000);
    return () => {
      window.clearInterval(timer);
    };
  }, [offerSlides.length]);

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
            <Link href="/" className={styles.backButton} aria-label="Back to home">
              <BackIcon className={styles.backIcon} />
            </Link>
            <label className={styles.headerSearch}>
              <SearchIcon className={styles.inlineIconLarge} />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search in categories"
              />
            </label>
          </header>

          {!isLoading && activeOffer ? (
            <section className={styles.compactBanner}>
              <div
                className={styles.offerBackdrop}
                style={
                  {
                    "--offer-start": activeOffer.startColor,
                    "--offer-end": activeOffer.endColor,
                  } as CSSProperties
                }
              />
              <div className={styles.heroShade} />
              <div className={styles.compactInner}>
                <div>
                  <div className={styles.compactBadge}>{activeOffer.badge}</div>
                  <div className={styles.compactText}>
                    <h3>{activeOffer.title}</h3>
                    <p>{activeOffer.subtitle}</p>
                  </div>
                </div>

                <div className={styles.compactMediaWrap}>
                  {activeOffer.imageUrl ? (
                    <div
                      className={styles.compactMedia}
                      style={{ backgroundImage: `url("${activeOffer.imageUrl}")` }}
                    />
                  ) : (
                    <div className={styles.compactValueVisual}>
                      {activeOffer.valueText || activeOffer.visualSymbol || "%"}
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : null}

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
                  <div className={styles.categoryHeart}>♡</div>
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
