"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { clearBranchSession, writeBranchSession } from "@/components/branch-session";
import {
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

function productHref(categoryId: string, categoryName: string, from: "home" | "categories") {
  const query = new URLSearchParams({
    name: categoryName,
    from,
  });
  return `/products/${encodeURIComponent(categoryId)}?${query.toString()}`;
}

export default function HomePage() {
  const { cartItems, totalItems, totalAmount, addItem, decreaseItem } = useOrder();
  const [homeData, setHomeData] = useState<HomePageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branchNameOverride, setBranchNameOverride] = useState("");
  const [requestedBranchId, setRequestedBranchId] = useState("");
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("checking");
  const [locationMessage, setLocationMessage] = useState("");
  const [activeOfferIndex, setActiveOfferIndex] = useState(0);

  const blockWebsite = useCallback(
    (message: string, status: LocationStatus) => {
      clearBranchSession();
      setBranchNameOverride("");
      setBranchId(null);
      setLocationStatus(status);
      setLocationMessage(message);
    },
    [],
  );

  const requestLocationBranch = useCallback((branchIdFromQuery?: string) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      blockWebsite(
        "Location is required on this device to open the website.",
        "unsupported",
      );
      return;
    }

    setLocationStatus("locating");
    setLocationMessage("Checking whether you are inside the allowed branch radius...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const query = new URLSearchParams({
            lat: String(position.coords.latitude),
            lng: String(position.coords.longitude),
          });
          const targetBranchId = branchIdFromQuery?.trim() ?? "";
          if (targetBranchId) {
            query.set("branchId", targetBranchId);
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

          if (!("matched" in payload) || !payload.matched || !payload.branchId) {
            blockWebsite(
              "You are outside the allowed branch radius. Website access is blocked.",
              "blocked",
            );
            return;
          }

          writeBranchSession(payload.branchId, payload.branchName);
          setBranchId(payload.branchId);
          setBranchNameOverride(payload.branchName);
          setLocationStatus("resolved");
          setLocationMessage(
            `${payload.branchName} branch matched from Branch Geo Settings.`,
          );
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
        maximumAge: 60000,
      },
    );
  }, [blockWebsite]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let isDisposed = false;

    const initializeBranch = async () => {
      const nextBranchId =
        new URLSearchParams(window.location.search).get("branchId")?.trim() ?? "";
      if (isDisposed) return;
      setRequestedBranchId(nextBranchId);

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
  }, [blockWebsite, requestLocationBranch]);

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

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <section className={styles.hero}>
          {accessGranted ? (
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
            <div>
              <div className={styles.branchRow}>
                <PinIcon className={styles.inlineIcon} />
                <span>{activeBranchName.toUpperCase()}</span>
              </div>
              <h1 className={styles.branchName}>{activeBranchName}</h1>
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
                <strong>Location</strong>
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

          {!accessGranted ? (
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

              <button type="button" className={styles.heroSearch}>
                <SearchIcon className={styles.inlineIconLarge} />
                <span>Search for &quot;Pizza&quot;</span>
                <MicIcon className={styles.inlineIconLarge} />
              </button>
            </>
          )}
        </section>

        {accessGranted ? (
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

        {accessGranted ? (
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

        {accessGranted && isLoading ? (
          <section className={styles.sectionBlock}>
            <div className={styles.statusCard}>Loading homepage data...</div>
          </section>
        ) : null}

        {accessGranted && !isLoading && errorMessage ? (
          <section className={styles.sectionBlock}>
            <div className={styles.statusCard}>{errorMessage}</div>
          </section>
        ) : null}

        {accessGranted && !isLoading && !errorMessage && orderedSections.length === 0 ? (
          <section className={styles.sectionBlock}>
            <div className={styles.statusCard}>No recommended products available for this branch.</div>
          </section>
        ) : null}

        {accessGranted &&
          !isLoading &&
          !errorMessage &&
          orderedSections.map((section) => (
            <section key={section.title} className={styles.sectionBlock}>
              <div className={styles.sectionTitle}>
                <h2>
                  {section.title} ({section.products.length})
                </h2>
              </div>
              <div className={styles.sectionGrid}>
                {section.products.map((product) => {
                  const quantity = cartItems.find((item) => item.id === product.id)?.quantity ?? 0;
                  const isFavorite = favoriteIds.includes(product.id);

                  return (
                    <article key={product.id} className={styles.productCard}>
                      <div className={styles.productArt} style={buildCardBackground(product)}>
                        <span className={styles.productArtLabel}>
                          {product.imageUrl ? "" : productAvatarLabel(product.name)}
                        </span>
                        <button
                          type="button"
                          className={`${styles.favoriteButton} ${isFavorite ? styles.favoriteButtonActive : ""}`}
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
          ))}

        {accessGranted && (homeData?.favoriteCategories ?? []).length > 0 ? (
          <section className={styles.favoriteWrap}>
            <div className={styles.sectionTitle}>
              <h2>{homeData?.favoriteCategoriesTitle ?? "Favorite Categories"}</h2>
            </div>
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
                  <div className={`${styles.favoriteHeart} ${styles.favoriteHeartActive}`}>♥</div>
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
          </Link>
        </div>
      ) : null}
    </main>
  );
}
