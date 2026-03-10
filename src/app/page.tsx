"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { productAvatarLabel, useOrder } from "@/components/order-provider";
import type {
  BranchLookupResult,
  CategoryCard,
  HomePageData,
  Product,
  RuleSection,
} from "@/lib/order-types";
import styles from "./page.module.css";

const SESSION_BRANCH_ID_KEY = "blackforest-order-web-branch-id";
const SESSION_BRANCH_NAME_KEY = "blackforest-order-web-branch-name";

type LocationStatus =
  | "checking"
  | "prompt"
  | "locating"
  | "resolved"
  | "denied"
  | "unsupported"
  | "skipped";

function VegIcon({ isVeg }: { isVeg: boolean }) {
  return (
    <span
      className={isVeg ? styles.vegIcon : styles.nonVegIcon}
      aria-hidden="true"
    >
      <span />
    </span>
  );
}

function orderProducts(products: Product[], favoriteIds: string[]) {
  if (favoriteIds.length === 0) return products;
  const byId = new Map(products.map((product) => [product.id, product]));
  const favoriteProducts = favoriteIds
    .map((id) => byId.get(id))
    .filter((product): product is Product => Boolean(product));
  const remainingProducts = products.filter((product) => !favoriteIds.includes(product.id));
  return [...favoriteProducts, ...remainingProducts];
}

function extractFastMovementCategories(sections: RuleSection[]) {
  const orderedCategories: CategoryCard[] = [];
  const counts = new Map<string, number>();

  for (const section of sections) {
    for (const product of section.products) {
      const key = product.categoryId || product.category;
      if (!key || !product.category) continue;

      if (!counts.has(key)) {
        orderedCategories.push({
          id: key,
          name: product.category,
          imageUrl: product.categoryImageUrl || product.imageUrl,
          count: 0,
        });
      }

      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return orderedCategories.map((category) => ({
    ...category,
    count: counts.get(category.id) ?? 0,
  }));
}

function buildCardBackground(product: Product) {
  if (!product.imageUrl) {
    return { backgroundImage: product.accent };
  }

  return {
    backgroundImage: `${product.accent}, url("${product.imageUrl}")`,
  };
}

export default function HomePage() {
  const { cartItems, totalItems, totalAmount, addItem, decreaseItem } = useOrder();
  const [homeData, setHomeData] = useState<HomePageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branchNameOverride, setBranchNameOverride] = useState("");
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("checking");
  const [locationMessage, setLocationMessage] = useState("");

  const fallbackToDefaultBranch = useCallback(
    (message: string, status: LocationStatus) => {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(SESSION_BRANCH_ID_KEY);
        window.sessionStorage.removeItem(SESSION_BRANCH_NAME_KEY);
      }
      setBranchNameOverride("");
      setBranchId("");
      setLocationStatus(status);
      setLocationMessage(message);
    },
    [],
  );

  const requestLocationBranch = useCallback(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      fallbackToDefaultBranch(
        "Location is not supported on this browser. Showing default branch.",
        "unsupported",
      );
      return;
    }

    setLocationStatus("locating");
    setLocationMessage("Finding your branch from your current location...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await fetch(
            `/api/branch-from-location?lat=${position.coords.latitude}&lng=${position.coords.longitude}`,
            { cache: "no-store" },
          );
          const payload = (await response.json()) as
            | BranchLookupResult
            | { message?: string };

          if (!response.ok) {
            throw new Error(
              "message" in payload && payload.message
                ? payload.message
                : "Unable to resolve branch from location",
            );
          }

          if (!("matched" in payload) || !payload.matched || !payload.branchId) {
            fallbackToDefaultBranch(
              "No branch matched your current location. Showing default branch.",
              "skipped",
            );
            return;
          }

          window.sessionStorage.setItem(SESSION_BRANCH_ID_KEY, payload.branchId);
          window.sessionStorage.setItem(SESSION_BRANCH_NAME_KEY, payload.branchName);
          setBranchId(payload.branchId);
          setBranchNameOverride(payload.branchName);
          setLocationStatus("resolved");
          setLocationMessage(
            `${payload.branchName} branch matched from Branch Geo Settings.`,
          );
        } catch (error) {
          fallbackToDefaultBranch(
            error instanceof Error
              ? `${error.message}. Showing default branch.`
              : "Unable to resolve branch from location. Showing default branch.",
            "skipped",
          );
        }
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          fallbackToDefaultBranch(
            "Location permission was denied. Showing default branch.",
            "denied",
          );
          return;
        }

        fallbackToDefaultBranch(
          "Unable to read your current location. Showing default branch.",
          "skipped",
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  }, [fallbackToDefaultBranch]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let isDisposed = false;

    const initializeBranch = async () => {
      const nextBranchId =
        new URLSearchParams(window.location.search).get("branchId")?.trim() ?? "";
      if (nextBranchId) {
        if (isDisposed) return;
        setBranchId(nextBranchId);
        setLocationStatus("resolved");
        setLocationMessage("Branch selected from the page link.");
        return;
      }

      const storedBranchId = window.sessionStorage
        .getItem(SESSION_BRANCH_ID_KEY)
        ?.trim();
      const storedBranchName = window.sessionStorage
        .getItem(SESSION_BRANCH_NAME_KEY)
        ?.trim();
      if (storedBranchId) {
        if (isDisposed) return;
        setBranchId(storedBranchId);
        setBranchNameOverride(storedBranchName ?? "");
        setLocationStatus("resolved");
        if (storedBranchName) {
          setLocationMessage(`${storedBranchName} branch restored for this session.`);
        }
        return;
      }

      if (!("geolocation" in navigator)) {
        if (isDisposed) return;
        fallbackToDefaultBranch(
          "Location is not supported on this browser. Showing default branch.",
          "unsupported",
        );
        return;
      }

      if (
        typeof navigator.permissions === "undefined" ||
        typeof navigator.permissions.query !== "function"
      ) {
        if (isDisposed) return;
        setLocationStatus("prompt");
        setLocationMessage("Enable location to find the nearest branch automatically.");
        return;
      }

      try {
        const permission = await navigator.permissions.query({
          name: "geolocation" as PermissionName,
        });

        if (isDisposed) return;
        if (permission.state === "granted") {
          requestLocationBranch();
          return;
        }

        if (permission.state === "prompt") {
          setLocationStatus("prompt");
          setLocationMessage("Enable location to find the nearest branch automatically.");
          return;
        }

        fallbackToDefaultBranch(
          "Location permission is blocked. Showing default branch.",
          "denied",
        );
      } catch {
        if (isDisposed) return;
        setLocationStatus("prompt");
        setLocationMessage("Enable location to find the nearest branch automatically.");
      }
    };

    void initializeBranch();
    return () => {
      isDisposed = true;
    };
  }, [fallbackToDefaultBranch, requestLocationBranch]);

  useEffect(() => {
    if (branchId === null) return;
    let isDisposed = false;

    const loadHomeData = async () => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const suffix = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
        const response = await fetch(`/api/home-data${suffix}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Failed to load homepage data");
        }

        const payload = (await response.json()) as HomePageData;
        if (isDisposed) return;
        setHomeData(payload);
      } catch (error) {
        if (isDisposed) return;
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to load homepage data",
        );
      } finally {
        if (!isDisposed) {
          setIsLoading(false);
        }
      }
    };

    void loadHomeData();
    return () => {
      isDisposed = true;
    };
  }, [branchId]);

  const summaryLabel = totalItems === 1 ? "1 item ready" : `${totalItems} items ready`;
  const previewItems = useMemo(
    () => cartItems.slice(Math.max(0, cartItems.length - 3)),
    [cartItems],
  );
  const orderedSections = useMemo(
    () =>
      (homeData?.ruleSections ?? []).map((section) => ({
        ...section,
        products: orderProducts(section.products, favoriteIds),
      })),
    [favoriteIds, homeData?.ruleSections],
  );
  const filteredSections = useMemo(
    () =>
      orderedSections
        .map((section) => ({
          ...section,
          products: section.products.filter((product) =>
            activeCategory === "All" ? true : product.category === activeCategory,
          ),
        }))
        .filter((section) => section.products.length > 0),
    [activeCategory, orderedSections],
  );
  const fastMovementCategories = useMemo(
    () => extractFastMovementCategories(orderedSections),
    [orderedSections],
  );

  const categoryImages = useMemo(() => {
    const map: Record<string, string> = {};

    const addImage = (name: string, imageUrl?: string | null) => {
      if (name && imageUrl && !map[name]) {
        map[name] = imageUrl;
      }
    };

    for (const category of homeData?.billingCategories ?? []) {
      addImage(category.name, category.imageUrl);
    }
    for (const category of homeData?.favoriteCategories ?? []) {
      addImage(category.name, category.imageUrl);
    }
    for (const category of fastMovementCategories) {
      addImage(category.name, category.imageUrl);
    }
    for (const section of orderedSections) {
      for (const product of section.products) {
        addImage(product.category, product.categoryImageUrl || product.imageUrl);
      }
    }

    return map;
  }, [
    fastMovementCategories,
    homeData?.billingCategories,
    homeData?.favoriteCategories,
    orderedSections,
  ]);

  const availableCategories = useMemo(() => {
    const names = new Set<string>();
    for (const category of homeData?.billingCategories ?? []) names.add(category.name);
    for (const category of homeData?.favoriteCategories ?? []) names.add(category.name);
    for (const category of fastMovementCategories) names.add(category.name);
    for (const section of orderedSections) {
      for (const product of section.products) names.add(product.category);
    }
    return ["All", ...names];
  }, [
    fastMovementCategories,
    homeData?.billingCategories,
    homeData?.favoriteCategories,
    orderedSections,
  ]);

  useEffect(() => {
    if (activeCategory === "All") return;
    if (!availableCategories.includes(activeCategory)) {
      setActiveCategory("All");
    }
  }, [activeCategory, availableCategories]);

  const activeBranchName = homeData?.branchName || branchNameOverride || "VSeyal";

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <section className={styles.topSection}>
          <div className={styles.topBar}>
            <div className={styles.brandLockup}>
              <span className={styles.brandEyebrow}>{activeBranchName} branch</span>
              <h1>{activeBranchName}</h1>
            </div>

            <div className={styles.profileChip}>
              <span>T12</span>
            </div>
          </div>

          {locationStatus === "prompt" ? (
            <div className={styles.locationCard}>
              <div>
                <strong>Enable location</strong>
                <p>{locationMessage || "Allow location to detect the nearest branch."}</p>
              </div>
              <div className={styles.locationActions}>
                <button
                  type="button"
                  className={styles.locationPrimaryButton}
                  onClick={requestLocationBranch}
                >
                  Enable
                </button>
                <button
                  type="button"
                  className={styles.locationSecondaryButton}
                  onClick={() =>
                    fallbackToDefaultBranch("Showing default branch menu.", "skipped")
                  }
                >
                  Skip
                </button>
              </div>
            </div>
          ) : null}

          {locationStatus !== "prompt" && locationMessage ? (
            <div className={styles.locationStatus}>
              <strong>Location</strong>
              <span>{locationMessage}</span>
            </div>
          ) : null}

          <div className={styles.offerStage}>
            <div className={styles.offerCopy}>
              <span className={styles.liveChip}>Live table ordering</span>
              <h2>Scan. Pick. Send to kitchen.</h2>
              <p>
                Same customer flow as the app homepage, but adjusted for website width and
                responsive product grids.
              </p>
            </div>

            <div className={styles.offerPanel}>
              <strong>Today&apos;s branch box</strong>
              <span>2 combo offers active</span>
              <small>Shared Tables enabled</small>
            </div>
          </div>

          <button type="button" className={styles.searchBar}>
            <span className={styles.searchIcon}>⌕</span>
            <span>Search for &quot;Pizza&quot;</span>
            <span className={styles.searchMic}>◉</span>
          </button>
        </section>

        <section className={styles.categoryStrip}>
          <button
            type="button"
            className={activeCategory === "All" ? styles.categoryItemActive : styles.categoryItem}
            onClick={() => setActiveCategory("All")}
          >
            <span
              className={styles.categoryThumb}
              style={{
                backgroundImage:
                  'linear-gradient(135deg, rgba(61, 104, 182, 0.18), rgba(75, 124, 192, 0.18))',
              }}
            >
              All
            </span>
            <span className={styles.categoryLabel}>All</span>
          </button>
          {(homeData?.billingCategories ?? []).map((category) => (
            <button
              key={category.id}
              type="button"
              className={
                activeCategory === category.name ? styles.categoryItemActive : styles.categoryItem
              }
              onClick={() => setActiveCategory(category.name)}
            >
              <span
                className={styles.categoryThumb}
                style={{
                  backgroundImage: categoryImages[category.name]
                    ? `linear-gradient(rgba(0, 0, 0, 0.16), rgba(0, 0, 0, 0.16)), url("${categoryImages[category.name]}")`
                    : undefined,
                }}
              >
                {!categoryImages[category.name] ? productAvatarLabel(category.name) : ""}
              </span>
              <span className={styles.categoryLabel}>{category.name}</span>
            </button>
          ))}
        </section>

        <section className={styles.boxSection}>
          <div className={styles.sectionHeader}>
            <h3>Fast Movement</h3>
          </div>
          <div className={styles.fastGrid}>
            {fastMovementCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={styles.fastCard}
                onClick={() => setActiveCategory(category.name)}
              >
                <div
                  className={styles.fastCardMedia}
                  style={{
                    backgroundImage: categoryImages[category.name]
                      ? `linear-gradient(rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.08)), url("${categoryImages[category.name]}")`
                      : undefined,
                  }}
                />
                <div className={styles.fastCardOverlay}>
                  <span>{category.name.toUpperCase()}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {isLoading ? (
          <section className={styles.boxSection}>
            <div className={styles.statusCard}>Loading homepage data...</div>
          </section>
        ) : null}

        {!isLoading && errorMessage ? (
          <section className={styles.boxSection}>
            <div className={styles.statusCard}>{errorMessage}</div>
          </section>
        ) : null}

        {!isLoading && !errorMessage && filteredSections.length === 0 ? (
          <section className={styles.boxSection}>
            <div className={styles.statusCard}>No recommended products available for this branch.</div>
          </section>
        ) : null}

        {!isLoading &&
          !errorMessage &&
          filteredSections.map((section) => (
            <section key={section.title} className={styles.boxSection}>
              <div className={styles.sectionHeader}>
                <h3>
                  {section.title} ({section.products.length})
                </h3>
                <span>⌄</span>
              </div>
              <div className={styles.productGrid}>
                {section.products.map((product) => {
                  const quantity =
                    cartItems.find((item) => item.id === product.id)?.quantity ?? 0;
                  const isFavorite = favoriteIds.includes(product.id);

                  return (
                    <article key={product.id} className={styles.card}>
                      <div className={styles.cardArtWrap}>
                        <div
                          className={styles.cardArt}
                          style={buildCardBackground(product)}
                        >
                          <span>{productAvatarLabel(product.name)}</span>
                        </div>
                        <button
                          type="button"
                          className={styles.favoriteButton}
                          onClick={() =>
                            setFavoriteIds((current) =>
                              current.includes(product.id)
                                ? current.filter((id) => id !== product.id)
                                : [...current, product.id],
                            )
                          }
                          aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
                        >
                          {isFavorite ? "♥" : "♡"}
                        </button>
                      </div>

                      <div className={styles.cardBody}>
                        <div className={styles.foodMarkerRow}>
                          <VegIcon isVeg={product.isVeg} />
                        </div>
                        <div className={styles.cardHeading}>
                          <div>
                            <h3>{product.name}</h3>
                          </div>
                        </div>

                        <div className={styles.cardFooter}>
                          <div>
                            <strong>₹{product.price}</strong>
                          </div>

                          {quantity === 0 ? (
                            <button
                              type="button"
                              className={styles.addButton}
                              onClick={() => addItem(product)}
                            >
                              ADD
                            </button>
                          ) : (
                            <div className={styles.stepper}>
                              <button type="button" onClick={() => decreaseItem(product.id)}>
                                −
                              </button>
                              <span>{quantity}</span>
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
            </section>
          ))}

        <section className={styles.favoriteSection}>
          <div className={styles.sectionHeader}>
            <h3>{homeData?.favoriteCategoriesTitle ?? "Favorite Categories"}</h3>
          </div>
          <div className={styles.favoriteGrid}>
            {(homeData?.favoriteCategories ?? []).map((category) => (
              <button
                key={category.id}
                type="button"
                className={styles.favoriteCategoryCard}
                onClick={() => setActiveCategory(category.name)}
              >
                <div
                  className={styles.favoriteCategoryMedia}
                  style={{
                    backgroundImage: categoryImages[category.name]
                      ? `linear-gradient(rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.08)), url("${categoryImages[category.name]}")`
                      : undefined,
                  }}
                />
                <div className={styles.favoriteCategoryMeta}>
                  <span>{category.name}</span>
                  <small>Open products</small>
                </div>
                <span className={styles.favoriteCategoryHeart}>♥</span>
              </button>
            ))}
          </div>
        </section>
      </section>

      <div className={styles.cartBar}>
        <div className={styles.cartInfo}>
          <div className={styles.stack}>
            {previewItems.length === 0 ? (
              <div className={styles.stackAvatar}>0</div>
            ) : (
              previewItems.map((item, index) => (
                <div
                  key={item.id}
                  className={styles.stackAvatar}
                  style={{ background: item.accent, left: `${index * 22}px` }}
                >
                  {productAvatarLabel(item.name)}
                </div>
              ))
            )}
          </div>
          <div>
            <strong>{summaryLabel}</strong>
            <p>₹{totalAmount} total</p>
          </div>
        </div>

        <Link href="/kot" className={styles.cartAction}>
          View Cart
        </Link>
      </div>
    </main>
  );
}
