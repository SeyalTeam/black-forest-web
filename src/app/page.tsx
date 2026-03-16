"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  clearBranchSession,
  clearTableSession,
  readBranchSession,
  writeTableSession,
  writeBranchSession,
} from "@/components/branch-session";
import {
  ChevronRightIcon,
  MicIcon,
  PinIcon,
  ProfileIcon,
  SearchIcon,
  VegIcon,
} from "@/components/menu-icons";
import styles from "@/components/menu.module.css";
import { productAvatarLabel, useOrder } from "@/components/order-provider";
import type {
  BranchLookupResult,
  CategoryCard,
  HomePageData,
  Product,
  RuleSection,
} from "@/lib/order-types";

type LocationStatus =
  | "checking"
  | "prompt"
  | "locating"
  | "resolved"
  | "blocked"
  | "denied"
  | "unsupported"
  | "skipped";

const HOME_CACHE_KEY_PREFIX = "blackforest-order-web-home-data:";
const HOME_CACHE_TTL_MS = 5 * 60 * 1000;

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

  const safeImageUrl = encodeURI(product.imageUrl);
  return {
    backgroundImage: `linear-gradient(180deg, rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.16)), url("${safeImageUrl}")`,
  };
}

function productHref(categoryId: string, categoryName: string, from: "home" | "categories") {
  const query = new URLSearchParams({
    name: categoryName,
    from,
  });
  return `/products/${encodeURIComponent(categoryId)}?${query.toString()}`;
}

function readCachedHomeData(branchId: string): HomePageData | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(`${HOME_CACHE_KEY_PREFIX}${branchId}`);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      savedAt?: number;
      data?: HomePageData;
    };
    if (
      !parsed.data ||
      !parsed.savedAt ||
      Date.now() - parsed.savedAt > HOME_CACHE_TTL_MS
    ) {
      window.sessionStorage.removeItem(`${HOME_CACHE_KEY_PREFIX}${branchId}`);
      return null;
    }

    return parsed.data;
  } catch {
    window.sessionStorage.removeItem(`${HOME_CACHE_KEY_PREFIX}${branchId}`);
    return null;
  }
}

function writeCachedHomeData(branchId: string, data: HomePageData) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    `${HOME_CACHE_KEY_PREFIX}${branchId}`,
    JSON.stringify({
      savedAt: Date.now(),
      data,
    }),
  );
}

async function fetchHomeDataForBranch(targetBranchId: string) {
  const suffix = targetBranchId ? `?branchId=${encodeURIComponent(targetBranchId)}` : "";
  const response = await fetch(`/api/home-data${suffix}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to load homepage data");
  }

  return (await response.json()) as HomePageData;
}

export default function HomePage() {
  const { cartItems, totalItems, addItem, decreaseItem } = useOrder();
  const [homeData, setHomeData] = useState<HomePageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branchNameOverride, setBranchNameOverride] = useState("");
  const [requestedBranchId, setRequestedBranchId] = useState("");
  const [requestedTableNumber, setRequestedTableNumber] = useState("");
  const [requestedTableSection, setRequestedTableSection] = useState("");
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("checking");
  const [locationMessage, setLocationMessage] = useState("");
  const [activeOfferIndex, setActiveOfferIndex] = useState(0);

  const blockWebsite = useCallback(
    (message: string, status: LocationStatus) => {
      clearBranchSession();
      clearTableSession();
      setBranchNameOverride("");
      setBranchId(null);
      setLocationStatus(status);
      setLocationMessage(message);
    },
    [],
  );

  const primeHomeData = useCallback(async (targetBranchId?: string) => {
    const normalizedBranchId = targetBranchId?.trim() ?? "";
    if (!normalizedBranchId) {
      return;
    }

    const cachedData = readCachedHomeData(normalizedBranchId);
    if (cachedData) {
      setHomeData((current) => current ?? cachedData);
      setIsLoading((current) => (current && !branchId ? false : current));
      return;
    }

    try {
      const payload = await fetchHomeDataForBranch(normalizedBranchId);
      writeCachedHomeData(normalizedBranchId, payload);
      setHomeData((current) => current ?? payload);
      setIsLoading((current) => (current && !branchId ? false : current));
    } catch {
      // Keep location flow resilient even if menu prefetch fails.
    }
  }, [branchId]);

  const requestLocationBranch = useCallback((branchIdFromQuery?: string) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      blockWebsite(
        "Location is required on this device to open the website.",
        "unsupported",
      );
      return;
    }

    const normalizedBranchId = branchIdFromQuery?.trim() ?? "";
    if (normalizedBranchId) {
      void primeHomeData(normalizedBranchId);
    }

    setLocationStatus("locating");
    setLocationMessage("Checking whether you are inside the allowed branch radius...");

    const lookupBranchFromCoordinates = async (
      latitude: number,
      longitude: number,
      targetBranchId?: string,
    ) => {
      const query = new URLSearchParams({
        lat: String(latitude),
        lng: String(longitude),
      });
      const requestedBranch = targetBranchId?.trim() ?? "";
      if (requestedBranch) {
        query.set("branchId", requestedBranch);
      }

      const response = await fetch(
        `/api/branch-from-location?${query.toString()}`,
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

      if (!("matched" in payload)) {
        throw new Error("Unable to resolve branch from location");
      }

      return payload;
    };

    const applyMatchedBranch = (payload: BranchLookupResult) => {
      writeBranchSession(payload.branchId, payload.branchName);
      setBranchId(payload.branchId);
      setBranchNameOverride(payload.branchName);
      setLocationStatus("resolved");
      setLocationMessage(
        `${payload.branchName} branch matched from Branch Geo Settings.`,
      );
    };

    const resolveWithPreciseLocation = () => {
      setLocationMessage("Getting exact location for branch verification...");

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const payload = await lookupBranchFromCoordinates(
              position.coords.latitude,
              position.coords.longitude,
              normalizedBranchId,
            );

            if (!payload.matched || !payload.branchId) {
              blockWebsite(
                "You are outside the allowed branch radius. Website access is blocked.",
                "blocked",
              );
              return;
            }

            applyMatchedBranch(payload);
          } catch (error) {
            blockWebsite(
              error instanceof Error
                ? error.message
                : "Unable to verify your location against Branch Geo Settings.",
              "blocked",
            );
          }
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            blockWebsite(
              "Location permission was denied. Enable location to open the website.",
              "denied",
            );
            return;
          }

          blockWebsite(
            "Unable to read your current location. Location verification failed.",
            "blocked",
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        },
      );
    };

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const payload = await lookupBranchFromCoordinates(
            position.coords.latitude,
            position.coords.longitude,
            normalizedBranchId,
          );

          if (payload.matched && payload.branchId) {
            applyMatchedBranch(payload);
            return;
          }

          resolveWithPreciseLocation();
        } catch {
          resolveWithPreciseLocation();
        }
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          blockWebsite(
            "Location permission was denied. Enable location to open the website.",
            "denied",
          );
          return;
        }

        resolveWithPreciseLocation();
      },
      {
        enableHighAccuracy: false,
        timeout: 4000,
        maximumAge: 5 * 60 * 1000,
      },
    );
  }, [blockWebsite, primeHomeData]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let isDisposed = false;

    const initializeBranch = async () => {
      const nextBranchId =
        new URLSearchParams(window.location.search).get("branchId")?.trim() ?? "";
      const nextTableNumber =
        new URLSearchParams(window.location.search).get("table")?.trim() ||
        new URLSearchParams(window.location.search).get("t")?.trim() ||
        "";
      const nextTableSection =
        new URLSearchParams(window.location.search).get("section")?.trim() ?? "";
      if (isDisposed) return;
      setRequestedBranchId(nextBranchId);
      setRequestedTableNumber(nextTableNumber);
      setRequestedTableSection(nextTableSection);

      if (nextBranchId) {
        void primeHomeData(nextBranchId);
      }

      const cachedSession = readBranchSession();
      if (cachedSession?.branchId && (!nextBranchId || cachedSession.branchId === nextBranchId)) {
        setBranchId(cachedSession.branchId);
        setBranchNameOverride(cachedSession.branchName);
        setLocationStatus("resolved");
        setLocationMessage(
          `${
            cachedSession.branchName || "Selected"
          } branch restored from your previous location check.`,
        );
        return;
      }

      if (cachedSession?.branchId && nextBranchId && cachedSession.branchId !== nextBranchId) {
        clearBranchSession();
        clearTableSession();
      }

      if (!("geolocation" in navigator)) {
        blockWebsite(
          "Location is required on this browser to open the website.",
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
        setLocationMessage("Enable location to verify you are inside the branch radius.");
        return;
      }

      try {
        const permission = await navigator.permissions.query({
          name: "geolocation" as PermissionName,
        });

        if (isDisposed) return;
        if (permission.state === "granted") {
          requestLocationBranch(nextBranchId);
          return;
        }

        if (permission.state === "prompt") {
          setLocationStatus("prompt");
          setLocationMessage("Enable location to verify you are inside the branch radius.");
          return;
        }

        blockWebsite(
          "Location permission is blocked. Enable location to open the website.",
          "denied",
        );
      } catch {
        if (isDisposed) return;
        setLocationStatus("prompt");
        setLocationMessage("Enable location to verify you are inside the branch radius.");
      }
    };

    void initializeBranch();
    return () => {
      isDisposed = true;
    };
  }, [blockWebsite, primeHomeData, requestLocationBranch]);

  useEffect(() => {
    if (!branchId || !requestedTableNumber) {
      return;
    }

    writeTableSession({
      branchId,
      tableNumber: requestedTableNumber,
      section: requestedTableSection,
    });
  }, [branchId, requestedTableNumber, requestedTableSection]);

  useEffect(() => {
    if (branchId === null) return;
    let isDisposed = false;

    const loadHomeData = async () => {
      setErrorMessage("");
      const cachedData = readCachedHomeData(branchId);

      if (cachedData && !isDisposed) {
        setHomeData(cachedData);
        setIsLoading(false);
      } else {
        setHomeData(null);
        setIsLoading(true);
      }

      try {
        const payload = await fetchHomeDataForBranch(branchId);
        if (isDisposed) return;
        setHomeData(payload);
        writeCachedHomeData(branchId, payload);
      } catch (error) {
        if (isDisposed) return;
        if (!cachedData) {
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to load homepage data",
          );
        }
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

  const summaryLabel = totalItems === 1 ? "1 item added" : `${totalItems} items added`;
  const previewItems = useMemo(
    () => cartItems.slice(Math.max(0, cartItems.length - 3)),
    [cartItems],
  );
  const orderedSections = useMemo(
    () => homeData?.ruleSections ?? [],
    [homeData?.ruleSections],
  );
  const orderedProducts = useMemo(
    () =>
      orderedSections.flatMap((section, sectionIndex) =>
        section.products.map((product, productIndex) => ({
          key: `${sectionIndex}-${productIndex}-${product.id}`,
          product,
        })),
      ),
    [orderedSections],
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

  const offerSlides = homeData?.offerSlides ?? [];
  const activeOffer =
    offerSlides.length > 0 ? offerSlides[activeOfferIndex % offerSlides.length] : null;
  const printerBadges = useMemo(() => {
    if (!homeData) return [];

    const badges: string[] = [];
    if (homeData.billingPrinterIp) {
      badges.push(`Bill: ${homeData.billingPrinterIp}`);
    }
    if (homeData.kotPrinterIps.length > 0) {
      badges.push(`KOT: ${homeData.kotPrinterIps.join(", ")}`);
    }
    return badges;
  }, [homeData]);

  useEffect(() => {
    if (offerSlides.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveOfferIndex((current) => (current + 1) % offerSlides.length);
    }, 4000);
    return () => {
      window.clearInterval(timer);
    };
  }, [offerSlides.length]);

  const activeBranchName = homeData?.branchName || branchNameOverride || "VSeyal";
  const accessGranted = locationStatus === "resolved" && Boolean(branchId);
  const previewReady =
    locationStatus === "locating" &&
    Boolean(requestedBranchId) &&
    homeData?.branchId === requestedBranchId;
  const canRenderMenu = accessGranted || previewReady;

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <section className={styles.hero}>
          {canRenderMenu ? (
            <div
              className={styles.offerBackdrop}
              style={
                {
                  "--offer-start": activeOffer?.startColor ?? "#17b78e",
                  "--offer-end": activeOffer?.endColor ?? "#0a8d67",
                } as CSSProperties
              }
            />
          ) : null}
          <div className={styles.heroShade} />

          <div className={styles.topBar}>
            <div className={styles.branchMeta}>
              <div className={styles.branchRow}>
                <PinIcon className={styles.inlineIcon} />
                <span>{activeBranchName}</span>
              </div>
              {printerBadges.length > 0 ? (
                <div className={styles.branchPrinterRow}>
                  {printerBadges.map((printerBadge) => (
                    <span key={printerBadge} className={styles.branchPrinterBadge}>
                      {printerBadge}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className={styles.profileAvatar}>
              <ProfileIcon className={styles.profileIcon} />
            </div>
          </div>

          {locationStatus === "prompt" ? (
            <div className={styles.locationCard}>
              <div>
                <strong>Enable location</strong>
                <p>{locationMessage || "Allow location to verify branch access."}</p>
              </div>
              <div className={styles.locationActions}>
                <button
                  type="button"
                  className={styles.locationPrimaryButton}
                  onClick={() => requestLocationBranch(requestedBranchId)}
                >
                  Enable
                </button>
              </div>
            </div>
          ) : null}

          {locationStatus !== "prompt" && locationMessage && !accessGranted ? (
            <div className={styles.locationStatus}>
              <div>
                <strong>{previewReady ? "Verifying location" : "Location"}</strong>
                <span>{locationMessage}</span>
              </div>
              <button
                type="button"
                className={styles.locationPrimaryButton}
                onClick={() => requestLocationBranch(requestedBranchId)}
              >
                Retry
              </button>
            </div>
          ) : null}

          {!canRenderMenu ? (
            <div className={styles.accessCard}>
              <strong>Website locked</strong>
              <h2>Stay inside the branch radius to continue.</h2>
              <p>
                This website opens only when your current location matches the radius configured
                in Branch Geo Settings.
              </p>
              <button
                type="button"
                className={styles.locationPrimaryButton}
                onClick={() => requestLocationBranch(requestedBranchId)}
              >
                Retry location check
              </button>
            </div>
          ) : (
            <>
              <button type="button" className={styles.heroSearch}>
                <SearchIcon className={styles.inlineIconLarge} />
                <span>Search for &quot;Pizza&quot;</span>
                <MicIcon className={styles.inlineIconLarge} />
              </button>

              {activeOffer ? (
                <div className={styles.heroContent}>
                  <div>
                    <div className={styles.offerBadge}>{activeOffer.badge}</div>
                    <div className={styles.offerText}>
                      <h2>{activeOffer.title}</h2>
                      <p>{activeOffer.subtitle}</p>
                    </div>
                  </div>

                  <div className={styles.offerMediaWrap}>
                    {activeOffer.imageUrl ? (
                      <div
                        className={styles.offerMedia}
                        style={{ backgroundImage: `url("${activeOffer.imageUrl}")` }}
                      />
                    ) : (
                      <div className={styles.offerValueVisual}>
                        {activeOffer.valueText || activeOffer.visualSymbol || "%"}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className={styles.heroSpacer} />
              )}

              {offerSlides.length > 1 ? (
                <div className={styles.offerDots}>
                  {offerSlides.map((offer, index) => (
                    <button
                      key={`${offer.badge}-${offer.title}-${index}`}
                      type="button"
                      className={
                        index === activeOfferIndex % offerSlides.length
                          ? styles.offerDotActive
                          : styles.offerDot
                      }
                      onClick={() => setActiveOfferIndex(index)}
                      aria-label={`Show offer ${index + 1}`}
                    />
                  ))}
                </div>
              ) : null}
            </>
          )}
        </section>

        {canRenderMenu ? (
          <section className={styles.circleStrip}>
            <Link href="/categories" className={styles.circleItem}>
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
            </Link>
            {(homeData?.billingCategories ?? []).map((category) => (
              <Link
                key={category.id}
                href={productHref(category.id, category.name, "home")}
                className={styles.circleItem}
              >
                <span
                  className={styles.circleThumb}
                  style={{
                    backgroundImage: categoryImages[category.name]
                      ? `linear-gradient(rgba(0, 0, 0, 0.16), rgba(0, 0, 0, 0.16)), url("${categoryImages[category.name]}")`
                      : undefined,
                  }}
                >
                  {!categoryImages[category.name] ? productAvatarLabel(category.name) : ""}
                </span>
                <span className={styles.circleLabel}>{category.name}</span>
              </Link>
            ))}
          </section>
        ) : null}

        {canRenderMenu ? (
          <section className={styles.sectionBlock}>
            <div className={styles.sectionTitle}>
              <h2>Fast Movement</h2>
            </div>
            <div className={styles.fastGrid}>
              {fastMovementCategories.map((category) => (
                <Link
                  key={category.id}
                  href={productHref(category.id, category.name, "home")}
                  className={styles.fastCard}
                >
                  <div
                    className={styles.fastCardMedia}
                    style={{
                      backgroundImage: categoryImages[category.name]
                        ? `linear-gradient(rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.08)), url("${categoryImages[category.name]}")`
                        : undefined,
                    }}
                  />
                  <div className={styles.fastCardLabel}>{category.name.toUpperCase()}</div>
                </Link>
              ))}
            </div>
            <div className={styles.sectionDivider} />
          </section>
        ) : null}

        {canRenderMenu && isLoading ? (
          <section className={styles.sectionBlock}>
            <div className={styles.statusCard}>Loading homepage data...</div>
          </section>
        ) : null}

        {canRenderMenu && !isLoading && errorMessage ? (
          <section className={styles.sectionBlock}>
            <div className={styles.statusCard}>{errorMessage}</div>
          </section>
        ) : null}

        {canRenderMenu && !isLoading && !errorMessage && orderedProducts.length === 0 ? (
          <section className={styles.sectionBlock}>
            <div className={styles.statusCard}>No recommended products available for this branch.</div>
          </section>
        ) : null}

        {canRenderMenu && !isLoading && !errorMessage && orderedProducts.length > 0 ? (
          <section className={styles.sectionBlock}>
            <div className={styles.sectionGrid}>
              {orderedProducts.map(({ key, product }) => {
                const quantity = cartItems.find((item) => item.id === product.id)?.quantity ?? 0;

                return (
                  <article key={key} className={styles.productCard}>
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
          </section>
        ) : null}

        {canRenderMenu && (homeData?.favoriteCategories ?? []).length > 0 ? (
          <section className={styles.favoriteWrap}>
            <div className={styles.favoriteGrid}>
              {(homeData?.favoriteCategories ?? []).map((category) => (
                <Link
                  key={category.id}
                  href={productHref(category.id, category.name, "home")}
                  className={styles.favoriteCard}
                >
                  <div
                    className={styles.favoriteCardMedia}
                    style={{
                      backgroundImage: categoryImages[category.name]
                        ? `linear-gradient(rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.08)), url("${categoryImages[category.name]}")`
                        : undefined,
                    }}
                  />
                  <div className={styles.favoriteCardLabel}>{category.name}</div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </section>

      {accessGranted && totalItems > 0 ? (
        <div className={styles.floatingCartBar}>
          <div className={styles.floatingCartInfo}>
            <div className={styles.avatarStack}>
              {previewItems.map((item, index) => (
                <div
                  key={item.id}
                  className={styles.avatarChip}
                  style={{
                    background: item.imageUrl
                      ? `linear-gradient(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.06)), url("${item.imageUrl}")`
                      : item.accent,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    left: `${index * 17}px`,
                  }}
                >
                  {item.imageUrl ? "" : productAvatarLabel(item.name)}
                </div>
              ))}
            </div>
            <div>
              <strong>{summaryLabel}</strong>
            </div>
          </div>

          <Link href="/kot" className={styles.floatingCartAction}>
            <span>View cart</span>
            <ChevronRightIcon className={styles.cartChevron} />
          </Link>
        </div>
      ) : null}
    </main>
  );
}
