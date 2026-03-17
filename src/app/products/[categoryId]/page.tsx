"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { readBranchSession } from "@/components/branch-session";
import { BottomNav } from "@/components/bottom-nav";
import { BackIcon, ChevronRightIcon, SearchIcon, VegIcon } from "@/components/menu-icons";
import styles from "@/components/menu.module.css";
import { productAvatarLabel, useOrder } from "@/components/order-provider";
import type { Product, ProductsPageData } from "@/lib/order-types";
import {
  getProductsCacheKey,
  prefetchProductsPageData,
  readSessionCache,
  writeSessionCache,
} from "@/lib/session-cache";

function buildCardBackground(product: Product) {
  if (!product.imageUrl) {
    return { backgroundImage: product.accent };
  }

  const safeImageUrl = encodeURI(product.imageUrl);
  return {
    backgroundImage: `linear-gradient(180deg, rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.16)), url("${safeImageUrl}")`,
  };
}

function productHref(categoryId: string, categoryName: string, from: string) {
  const query = new URLSearchParams({
    name: categoryName,
    from,
  });
  return `/products/${encodeURIComponent(categoryId)}?${query.toString()}`;
}

export default function ProductsPage() {
  const router = useRouter();
  const params = useParams<{ categoryId: string }>();
  const searchParams = useSearchParams();
  const categoryId = decodeURIComponent(params.categoryId);
  const categoryNameFromQuery = searchParams.get("name")?.trim() ?? "";
  const from = searchParams.get("from") === "categories" ? "categories" : "home";
  const backHref = from === "categories" ? "/categories" : "/";
  const { cartItems, totalItems, totalAmount, addItem, decreaseItem } = useOrder();

  const [pageData, setPageData] = useState<ProductsPageData | null>(null);
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
    if (!branchId || !categoryId) return;
    let isDisposed = false;

    const loadPageData = async () => {
      const cacheKey = getProductsCacheKey(branchId, categoryId);
      const cached = readSessionCache<ProductsPageData>(cacheKey);
      if (cached) {
        setPageData(cached);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
      setErrorMessage("");

      try {
        const query = new URLSearchParams({
          branchId,
          categoryId,
        });
        if (categoryNameFromQuery) {
          query.set("categoryName", categoryNameFromQuery);
        }

        const response = await fetch(`/api/products-data?${query.toString()}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Failed to load products");
        }

        const payload = (await response.json()) as ProductsPageData;
        if (isDisposed) return;
        setPageData(payload);
        writeSessionCache(cacheKey, payload);
      } catch (error) {
        if (isDisposed) return;
        if (cached) return;
        setErrorMessage(error instanceof Error ? error.message : "Failed to load products");
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
  }, [branchId, categoryId, categoryNameFromQuery]);

  useEffect(() => {
    if (!branchId || !pageData?.topCategories?.length) {
      return;
    }

    const warmCategories = pageData.topCategories
      .filter((category) => category.id !== pageData.categoryId)
      .slice(0, 6);

    for (const category of warmCategories) {
      void prefetchProductsPageData({
        branchId,
        categoryId: category.id,
        categoryName: category.name,
      });
    }
  }, [branchId, pageData?.categoryId, pageData?.topCategories]);

  const visibleProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return pageData?.products ?? [];
    }

    return (pageData?.products ?? []).filter((product) =>
      product.name.toLowerCase().includes(query),
    );
  }, [pageData?.products, searchQuery]);

  const previewItems = useMemo(
    () => cartItems.slice(Math.max(0, cartItems.length - 3)),
    [cartItems],
  );
  const summaryLabel = totalItems === 1 ? "1 item added" : `${totalItems} items added`;
  const returnToPrevious = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push(backHref);
  };

  const warmCategory = (nextCategoryId: string, nextCategoryName: string) => {
    if (!branchId) return;
    const href = productHref(nextCategoryId, nextCategoryName, from);
    void router.prefetch(href);
    void prefetchProductsPageData({
      branchId,
      categoryId: nextCategoryId,
      categoryName: nextCategoryName,
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
              aria-label="Back"
              onClick={returnToPrevious}
            >
              <BackIcon className={styles.backIcon} />
            </button>
            <label className={styles.headerSearch}>
              <SearchIcon className={styles.inlineIconLarge} />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={`Search in ${((pageData?.categoryName ?? categoryNameFromQuery) || "products").toUpperCase()}`}
              />
            </label>
          </header>

          <div className={styles.circleStrip}>
            <button type="button" className={styles.circleItem} onClick={returnToPrevious}>
              <span
                className={styles.circleThumb}
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, rgba(61, 104, 182, 0.18), rgba(75, 124, 192, 0.18))",
                }}
              >
                All
              </span>
              <span className={styles.circleLabel}>All</span>
            </button>
            {(pageData?.topCategories ?? []).map((category, index) => (
              <Link
                key={`${category.id}-${index}`}
                href={productHref(category.id, category.name, from)}
                className={
                  category.id === pageData?.categoryId ? styles.circleItemActive : styles.circleItem
                }
                onMouseEnter={() => warmCategory(category.id, category.name)}
                onFocus={() => warmCategory(category.id, category.name)}
                onTouchStart={() => warmCategory(category.id, category.name)}
              >
                <span
                  className={styles.circleThumb}
                  style={{
                    backgroundImage: category.imageUrl
                      ? `linear-gradient(rgba(0, 0, 0, 0.16), rgba(0, 0, 0, 0.16)), url("${category.imageUrl}")`
                      : undefined,
                  }}
                >
                  {!category.imageUrl ? productAvatarLabel(category.name) : ""}
                </span>
                <span className={styles.circleLabel}>{category.name}</span>
              </Link>
            ))}
          </div>

          {isLoading ? <div className={styles.statusCard}>Loading products...</div> : null}
          {!isLoading && errorMessage ? <div className={styles.statusCard}>{errorMessage}</div> : null}
          {!isLoading && !errorMessage && visibleProducts.length === 0 ? (
            <div className={styles.statusCard}>No products found.</div>
          ) : null}

          {!isLoading && !errorMessage && visibleProducts.length > 0 ? (
            <div className={styles.sectionGrid}>
              {visibleProducts.map((product) => {
                const quantity = cartItems.find((item) => item.id === product.id)?.quantity ?? 0;

                return (
                  <article key={product.id} className={styles.productCard}>
                    <div className={styles.productArt} style={buildCardBackground(product)}>
                      <span className={styles.productArtLabel}>
                        {product.imageUrl ? "" : productAvatarLabel(product.name)}
                      </span>
                    </div>

                    <div className={styles.productBody}>
                      <div className={styles.productMetaRow}>
                        <VegIcon isVeg={product.isVeg} />
                      </div>
                      <div className={styles.productTitle}>{product.name}</div>
                      <div className={styles.productFooter}>
                        <div className={styles.priceText}>₹{product.price}</div>

                        {quantity === 0 ? (
                          <button
                            type="button"
                            className={styles.addButton}
                            onClick={() => addItem(product)}
                          >
                            ADD
                          </button>
                        ) : (
                          <div className={styles.qtyControl}>
                            <button type="button" onClick={() => decreaseItem(product.id)}>
                              −
                            </button>
                            <span className={styles.qtyValue}>{quantity}</span>
                            <button type="button" onClick={() => addItem(product)}>
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </section>

      {totalItems > 0 ? (
        <div className={styles.floatingCartBar}>
          <div className={styles.floatingCartInfo}>
            <div className={styles.avatarStack}>
              {previewItems.map((item, index) => (
                <div
                  key={item.id}
                  className={styles.avatarChip}
                  style={{ background: item.accent, left: `${index * 18}px` }}
                >
                  {productAvatarLabel(item.name)}
                </div>
              ))}
            </div>
            <div>
              <strong>{summaryLabel}</strong>
              <p>₹{totalAmount} total</p>
            </div>
          </div>

          <Link href="/kot" className={styles.floatingCartAction}>
            View Cart
            <ChevronRightIcon className={styles.cartChevron} />
          </Link>
        </div>
      ) : null}

      <BottomNav />
    </main>
  );
}
