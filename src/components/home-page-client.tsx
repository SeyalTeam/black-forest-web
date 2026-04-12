"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
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
import { BottomNav } from "@/components/bottom-nav";
import { productAvatarLabel, useOrder } from "@/components/order-provider";
import type {
  CategoryCard,
  HomePageData,
  Product,
  RuleSection,
} from "@/lib/order-types";
import {
  prefetchCategoriesPageData,
  prefetchProductsPageData,
} from "@/lib/session-cache";

const HOME_CACHE_KEY_PREFIX = "blackforest-order-web-home-data-v4:";
const HOME_CACHE_TTL_MS = 10 * 1000;
const HOME_REFRESH_INTERVAL_MS = 5_000;
const FAVORITE_ORDER_KEY_PREFIX = "blackforest-order-web-favorite-categories-order-v1:";
const FAVORITE_PRODUCT_ORDER_KEY_PREFIX =
  "blackforest-order-web-favorite-products-order-v1:";
const ADMIN_TOKEN_STORAGE_KEY = "blackforest-order-web-admin-token-v1";

type FavoriteProductCard = {
  key: string;
  product: Product;
};

function readFavoriteOrder(branchId: string): string[] {
  if (typeof window === "undefined" || !branchId.trim()) {
    return [];
  }

  const raw = window.localStorage.getItem(`${FAVORITE_ORDER_KEY_PREFIX}${branchId}`);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
  } catch {
    return [];
  }
}

function writeFavoriteOrder(branchId: string, categoryIds: string[]) {
  if (typeof window === "undefined" || !branchId.trim()) {
    return;
  }

  window.localStorage.setItem(
    `${FAVORITE_ORDER_KEY_PREFIX}${branchId}`,
    JSON.stringify(categoryIds),
  );
}

function clearFavoriteOrder(branchId: string) {
  if (typeof window === "undefined" || !branchId.trim()) {
    return;
  }

  window.localStorage.removeItem(`${FAVORITE_ORDER_KEY_PREFIX}${branchId}`);
}

function readFavoriteProductOrder(branchId: string): string[] {
  if (typeof window === "undefined" || !branchId.trim()) {
    return [];
  }

  const raw = window.localStorage.getItem(`${FAVORITE_PRODUCT_ORDER_KEY_PREFIX}${branchId}`);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
  } catch {
    return [];
  }
}

function writeFavoriteProductOrder(branchId: string, productIds: string[]) {
  if (typeof window === "undefined" || !branchId.trim()) {
    return;
  }

  window.localStorage.setItem(
    `${FAVORITE_PRODUCT_ORDER_KEY_PREFIX}${branchId}`,
    JSON.stringify(productIds),
  );
}

function clearFavoriteProductOrder(branchId: string) {
  if (typeof window === "undefined" || !branchId.trim()) {
    return;
  }

  window.localStorage.removeItem(`${FAVORITE_PRODUCT_ORDER_KEY_PREFIX}${branchId}`);
}

function readStoredAdminToken() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)?.trim() ?? "";
}

function writeStoredAdminToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = token.trim();
  if (!normalized) return;
  window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, normalized);
}

function applyFavoriteOrder(categories: CategoryCard[], order: string[]) {
  if (categories.length <= 1 || order.length === 0) {
    return categories;
  }

  const rank = new Map<string, number>();
  order.forEach((categoryId, index) => {
    if (!rank.has(categoryId)) {
      rank.set(categoryId, index);
    }
  });

  return [...categories].sort((left, right) => {
    const leftRank = rank.get(left.id);
    const rightRank = rank.get(right.id);

    if (leftRank === undefined && rightRank === undefined) return 0;
    if (leftRank === undefined) return 1;
    if (rightRank === undefined) return -1;
    return leftRank - rightRank;
  });
}

function reorderFavoriteCategories(
  categories: CategoryCard[],
  draggedCategoryId: string,
  targetCategoryId: string,
) {
  if (!draggedCategoryId || !targetCategoryId || draggedCategoryId === targetCategoryId) {
    return categories;
  }

  const draggedIndex = categories.findIndex((category) => category.id === draggedCategoryId);
  const targetIndex = categories.findIndex((category) => category.id === targetCategoryId);
  if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
    return categories;
  }

  const next = [...categories];
  const [draggedCategory] = next.splice(draggedIndex, 1);
  next.splice(targetIndex, 0, draggedCategory);
  return next;
}

function applyFavoriteProductOrder(products: FavoriteProductCard[], order: string[]) {
  if (products.length <= 1 || order.length === 0) {
    return products;
  }

  const rank = new Map<string, number>();
  order.forEach((productId, index) => {
    if (!rank.has(productId)) {
      rank.set(productId, index);
    }
  });

  return [...products].sort((left, right) => {
    const leftRank = rank.get(left.product.id);
    const rightRank = rank.get(right.product.id);

    if (leftRank === undefined && rightRank === undefined) return 0;
    if (leftRank === undefined) return 1;
    if (rightRank === undefined) return -1;
    return leftRank - rightRank;
  });
}

function reorderFavoriteProducts(
  products: FavoriteProductCard[],
  draggedKey: string,
  targetKey: string,
) {
  if (!draggedKey || !targetKey || draggedKey === targetKey) {
    return products;
  }

  const draggedIndex = products.findIndex((item) => item.key === draggedKey);
  const targetIndex = products.findIndex((item) => item.key === targetKey);
  if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
    return products;
  }

  const next = [...products];
  const [draggedProduct] = next.splice(draggedIndex, 1);
  next.splice(targetIndex, 0, draggedProduct);
  return next;
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

function categoriesHref(branchId?: string | null) {
  const normalizedBranchId = branchId?.trim() ?? "";
  if (!normalizedBranchId) {
    return "/categories";
  }

  const query = new URLSearchParams({
    branchId: normalizedBranchId,
  });
  return `/categories?${query.toString()}`;
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

async function readResponseMessage(response: Response) {
  try {
    const decoded = (await response.json()) as {
      message?: string;
    };
    if (decoded.message?.trim()) {
      return decoded.message.trim();
    }
  } catch {
    // Ignore and use fallback below.
  }

  return `Request failed with ${response.status}`;
}

type HomePageClientProps = {
  initialHomeData: HomePageData | null;
  initialBranchId: string | null;
  initialBranchName: string;
  initialRequestedBranchId: string;
  initialRequestedTableNumber: string;
  initialRequestedTableSection: string;
  initialIsAdmin: boolean;
};

export default function HomePageClient({
  initialHomeData,
  initialBranchId,
  initialBranchName,
  initialRequestedBranchId,
  initialRequestedTableNumber,
  initialRequestedTableSection,
  initialIsAdmin,
}: HomePageClientProps) {
  const router = useRouter();
  const { cartItems, totalItems, addItem, decreaseItem } = useOrder();
  const [homeData, setHomeData] = useState<HomePageData | null>(initialHomeData);
  const [isLoading, setIsLoading] = useState(Boolean(initialBranchId && !initialHomeData));
  const [errorMessage, setErrorMessage] = useState("");
  const [branchId, setBranchId] = useState<string | null>(initialBranchId);
  const [branchNameOverride, setBranchNameOverride] = useState(initialBranchName);
  const [requestedBranchId, setRequestedBranchId] = useState(initialRequestedBranchId);
  const [requestedTableNumber, setRequestedTableNumber] = useState(initialRequestedTableNumber);
  const [requestedTableSection, setRequestedTableSection] = useState(
    initialRequestedTableSection,
  );
  const [activeOfferIndex, setActiveOfferIndex] = useState(0);
  const [favoriteProducts, setFavoriteProducts] = useState<FavoriteProductCard[]>(() =>
    (initialHomeData?.ruleSections ?? []).flatMap((section, sectionIndex) =>
      section.products.map((product, productIndex) => ({
        key: `${sectionIndex}-${productIndex}-${product.id}`,
        product,
      })),
    ),
  );
  const [draggedFavoriteProductKey, setDraggedFavoriteProductKey] = useState("");
  const [favoriteProductDropKey, setFavoriteProductDropKey] = useState("");
  const [favoriteProductSaveState, setFavoriteProductSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [favoriteProductSaveMessage, setFavoriteProductSaveMessage] = useState("");
  const [favoriteCategories, setFavoriteCategories] = useState<CategoryCard[]>(
    initialHomeData?.favoriteCategories ?? [],
  );
  const [draggedFavoriteCategoryId, setDraggedFavoriteCategoryId] = useState("");
  const [favoriteDropCategoryId, setFavoriteDropCategoryId] = useState("");
  const [favoriteSaveState, setFavoriteSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [favoriteSaveMessage, setFavoriteSaveMessage] = useState("");

  useEffect(() => {
    if (typeof window === "undefined" || !initialIsAdmin) {
      return;
    }

    const adminToken = new URLSearchParams(window.location.search)
      .get("adminToken")
      ?.trim();
    if (adminToken) {
      writeStoredAdminToken(adminToken);
    }
  }, [initialIsAdmin]);

  useEffect(() => {
    let isDisposed = false;

    const initializeBranch = () => {
      const nextBranchId = initialRequestedBranchId.trim();
      const nextTableNumber = initialRequestedTableNumber.trim();
      const nextTableSection = initialRequestedTableSection.trim();
      if (isDisposed) return;

      setRequestedBranchId(nextBranchId);
      setRequestedTableNumber(nextTableNumber);
      setRequestedTableSection(nextTableSection);

      const cachedSession = readBranchSession();

      if (cachedSession?.branchId && nextBranchId && cachedSession.branchId !== nextBranchId) {
        clearBranchSession();
        clearTableSession();
      }

      const resolvedBranchId = nextBranchId || initialBranchId?.trim() || cachedSession?.branchId || "";
      if (!resolvedBranchId) {
        setHomeData(null);
        setBranchId(null);
        setBranchNameOverride("");
        setIsLoading(false);
        return;
      }

      const restoredBranchName =
        (cachedSession?.branchId === resolvedBranchId ? cachedSession.branchName : "") ||
        initialHomeData?.branchName ||
        initialBranchName;

      setBranchId(resolvedBranchId);
      setBranchNameOverride(restoredBranchName);
      writeBranchSession(resolvedBranchId, initialHomeData?.branchName || restoredBranchName);
    };

    initializeBranch();
    return () => {
      isDisposed = true;
    };
  }, [
    initialBranchId,
    initialBranchName,
    initialHomeData,
    initialRequestedBranchId,
    initialRequestedTableNumber,
    initialRequestedTableSection,
  ]);

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
    if (branchId === null) {
      setIsLoading(false);
      return;
    }

    let isDisposed = false;

    const loadHomeData = async () => {
      setErrorMessage("");
      const cachedData = readCachedHomeData(branchId);
      const initialDataForBranch =
        initialHomeData?.branchId === branchId ? initialHomeData : null;

      if (cachedData && !isDisposed) {
        setHomeData((current) => (current?.branchId === branchId ? current : cachedData));
        writeBranchSession(branchId, cachedData.branchName || "");
      }

      if (initialDataForBranch && !isDisposed) {
        setHomeData((current) =>
          current?.branchId === branchId ? current : initialDataForBranch,
        );
        writeCachedHomeData(branchId, initialDataForBranch);
        writeBranchSession(branchId, initialDataForBranch.branchName || "");
      }

      if (cachedData || initialDataForBranch) {
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }

      try {
        const payload = await fetchHomeDataForBranch(branchId);
        if (isDisposed) return;
        setHomeData(payload);
        writeBranchSession(branchId, payload.branchName || "");
        writeCachedHomeData(branchId, payload);
        setErrorMessage("");
      } catch (error) {
        if (isDisposed) return;
        if (!cachedData && !initialDataForBranch) {
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
  }, [branchId, initialHomeData]);

  useEffect(() => {
    if (!branchId) {
      return;
    }

    let isDisposed = false;
    let isRefreshing = false;

    const refreshHomeData = async () => {
      if (
        isDisposed ||
        isRefreshing ||
        document.visibilityState !== "visible"
      ) {
        return;
      }

      isRefreshing = true;
      try {
        const payload = await fetchHomeDataForBranch(branchId);
        if (isDisposed) return;
        setHomeData(payload);
        writeBranchSession(branchId, payload.branchName || "");
        writeCachedHomeData(branchId, payload);
        setErrorMessage("");
      } catch {
        // Keep the current UI and try again on the next refresh cycle.
      } finally {
        isRefreshing = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshHomeData();
    }, HOME_REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshHomeData();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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
  const baseFavoriteProducts = useMemo<FavoriteProductCard[]>(
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
  const circleCategories = useMemo(
    () => homeData?.topCategories ?? [],
    [homeData?.topCategories],
  );
  const baseFavoriteCategories = useMemo(
    () => homeData?.favoriteCategories ?? [],
    [homeData?.favoriteCategories],
  );

  useEffect(() => {
    if (!branchId) {
      setFavoriteProducts(baseFavoriteProducts);
      return;
    }

    const favoriteProductOrder = readFavoriteProductOrder(branchId);
    if (favoriteProductOrder.length === 0) {
      setFavoriteProducts(baseFavoriteProducts);
      return;
    }

    setFavoriteProducts(applyFavoriteProductOrder(baseFavoriteProducts, favoriteProductOrder));
  }, [baseFavoriteProducts, branchId]);

  useEffect(() => {
    if (!branchId) {
      setFavoriteCategories(baseFavoriteCategories);
      return;
    }

    const favoriteOrder = readFavoriteOrder(branchId);
    if (favoriteOrder.length === 0) {
      setFavoriteCategories(baseFavoriteCategories);
      return;
    }

    setFavoriteCategories(applyFavoriteOrder(baseFavoriteCategories, favoriteOrder));
  }, [baseFavoriteCategories, branchId]);

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
    for (const category of baseFavoriteCategories) {
      addImage(category.name, category.imageUrl);
    }
    for (const category of homeData?.topCategories ?? []) {
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
    baseFavoriteCategories,
    fastMovementCategories,
    homeData?.billingCategories,
    homeData?.topCategories,
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
  const canRenderMenu = Boolean(branchId);
  const allCategoriesHref = categoriesHref(branchId || requestedBranchId);

  useEffect(() => {
    const activeBranchId = branchId || requestedBranchId;
    if (!activeBranchId || !(circleCategories.length || fastMovementCategories.length)) {
      return;
    }

    const browserWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const runPrefetch = () => {
      void router.prefetch(categoriesHref(activeBranchId));
      void prefetchCategoriesPageData(activeBranchId);

      const warmCategories = [...circleCategories, ...fastMovementCategories].slice(0, 4);

      for (const category of warmCategories) {
        void prefetchProductsPageData({
          branchId: activeBranchId,
          categoryId: category.id,
          categoryName: category.name,
        });
      }
    };

    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;

    if (browserWindow.requestIdleCallback) {
      idleHandle = browserWindow.requestIdleCallback(runPrefetch, { timeout: 1500 });
    } else {
      timeoutHandle = window.setTimeout(runPrefetch, 1200);
    }

    return () => {
      if (idleHandle !== null) {
        browserWindow.cancelIdleCallback?.(idleHandle);
      }
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, [
    branchId,
    requestedBranchId,
    circleCategories,
    fastMovementCategories,
    router,
  ]);

  const warmAllCategories = useCallback(() => {
    const activeBranchId = branchId || requestedBranchId;
    void router.prefetch(categoriesHref(activeBranchId));
    if (!activeBranchId) return;
    void prefetchCategoriesPageData(activeBranchId);
  }, [branchId, requestedBranchId, router]);

  const warmCategory = useCallback((categoryId: string, categoryName: string) => {
    const activeBranchId = branchId || requestedBranchId;
    if (!activeBranchId) return;
    const href = productHref(categoryId, categoryName, "home");
    void router.prefetch(href);
    void prefetchProductsPageData({
      branchId: activeBranchId,
      categoryId,
      categoryName,
    });
  }, [branchId, requestedBranchId, router]);
  const isFavoriteProductDragEnabled =
    initialIsAdmin && canRenderMenu && favoriteProducts.length > 1;
  const isFavoriteCategoryDragEnabled =
    initialIsAdmin && canRenderMenu && favoriteCategories.length > 1;
  const persistFavoriteProductOrderForCustomers = useCallback(
    async (orderedProductIds: string[]) => {
      if (!branchId || !initialIsAdmin) {
        return;
      }

      const adminToken = readStoredAdminToken();

      setFavoriteProductSaveState("saving");
      setFavoriteProductSaveMessage("Saving for customers...");

      try {
        const requestPayload: {
          branchId: string;
          orderedProductIds: string[];
          adminToken?: string;
        } = {
          branchId,
          orderedProductIds,
        };
        if (adminToken) {
          requestPayload.adminToken = adminToken;
        }

        const response = await fetch("/api/favorite-products-order", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestPayload),
          cache: "no-store",
        });

        if (!response.ok) {
          const message = await readResponseMessage(response);
          throw new Error(message);
        }

        const responsePayload = (await response.json()) as {
          updated?: boolean;
          message?: string;
        };
        setFavoriteProductSaveState("saved");
        setFavoriteProductSaveMessage(
          responsePayload.updated === false
            ? responsePayload.message || "Already saved."
            : "Saved for customer view.",
        );
      } catch (error) {
        setFavoriteProductSaveState("error");
        setFavoriteProductSaveMessage(
          error instanceof Error ? error.message : "Failed to save customer order.",
        );
      }
    },
    [branchId, initialIsAdmin],
  );
  const persistFavoriteOrderForCustomers = useCallback(
    async (orderedCategoryIds: string[]) => {
      if (!branchId || !initialIsAdmin) {
        return;
      }

      const adminToken = readStoredAdminToken();

      setFavoriteSaveState("saving");
      setFavoriteSaveMessage("Saving for customers...");

      try {
        const requestPayload: {
          branchId: string;
          orderedCategoryIds: string[];
          adminToken?: string;
        } = {
          branchId,
          orderedCategoryIds,
        };
        if (adminToken) {
          requestPayload.adminToken = adminToken;
        }

        const response = await fetch("/api/favorite-categories-order", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestPayload),
          cache: "no-store",
        });

        if (!response.ok) {
          const message = await readResponseMessage(response);
          throw new Error(message);
        }

        const responsePayload = (await response.json()) as {
          updated?: boolean;
          message?: string;
        };
        setFavoriteSaveState("saved");
        setFavoriteSaveMessage(
          responsePayload.updated === false
            ? responsePayload.message || "Already saved."
            : "Saved for customer view.",
        );
      } catch (error) {
        setFavoriteSaveState("error");
        setFavoriteSaveMessage(
          error instanceof Error ? error.message : "Failed to save customer order.",
        );
      }
    },
    [branchId, initialIsAdmin],
  );

  const handleFavoriteProductDragStart = useCallback(
    (event: DragEvent<HTMLElement>, productKey: string) => {
      if (!isFavoriteProductDragEnabled) {
        return;
      }

      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", productKey);
      setDraggedFavoriteProductKey(productKey);
      setFavoriteProductDropKey(productKey);
    },
    [isFavoriteProductDragEnabled],
  );

  const handleFavoriteProductDragOver = useCallback(
    (event: DragEvent<HTMLElement>, productKey: string) => {
      if (!isFavoriteProductDragEnabled || !draggedFavoriteProductKey) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (favoriteProductDropKey !== productKey) {
        setFavoriteProductDropKey(productKey);
      }
    },
    [draggedFavoriteProductKey, favoriteProductDropKey, isFavoriteProductDragEnabled],
  );

  const handleFavoriteProductDrop = useCallback(
    (event: DragEvent<HTMLElement>, targetProductKey: string) => {
      if (!isFavoriteProductDragEnabled || !draggedFavoriteProductKey) {
        return;
      }

      event.preventDefault();
      let didReorder = false;
      let orderedProductIds: string[] = [];
      setFavoriteProducts((current) => {
        const next = reorderFavoriteProducts(
          current,
          draggedFavoriteProductKey,
          targetProductKey,
        );
        if (next !== current && branchId) {
          didReorder = true;
          orderedProductIds = next.map((item) => item.product.id);
          writeFavoriteProductOrder(branchId, orderedProductIds);
        }
        return next;
      });

      if (didReorder && orderedProductIds.length > 0) {
        void persistFavoriteProductOrderForCustomers(orderedProductIds);
      }

      setDraggedFavoriteProductKey("");
      setFavoriteProductDropKey("");
    },
    [
      branchId,
      draggedFavoriteProductKey,
      isFavoriteProductDragEnabled,
      persistFavoriteProductOrderForCustomers,
    ],
  );

  const handleFavoriteProductDragEnd = useCallback(() => {
    setDraggedFavoriteProductKey("");
    setFavoriteProductDropKey("");
  }, []);

  const resetFavoriteProductOrder = useCallback(() => {
    if (!branchId) {
      return;
    }

    clearFavoriteProductOrder(branchId);
    setFavoriteProducts(baseFavoriteProducts);
    setFavoriteProductSaveState("idle");
    setFavoriteProductSaveMessage("");
    if (baseFavoriteProducts.length > 0) {
      void persistFavoriteProductOrderForCustomers(
        baseFavoriteProducts.map((item) => item.product.id),
      );
    }
  }, [
    baseFavoriteProducts,
    branchId,
    persistFavoriteProductOrderForCustomers,
  ]);

  const resetFavoriteCategoryOrder = useCallback(() => {
    if (!branchId) {
      return;
    }

    clearFavoriteOrder(branchId);
    setFavoriteCategories(baseFavoriteCategories);
    setFavoriteSaveState("idle");
    setFavoriteSaveMessage("");
  }, [baseFavoriteCategories, branchId]);

  const handleFavoriteDragStart = useCallback(
    (event: DragEvent<HTMLElement>, categoryId: string) => {
      if (!isFavoriteCategoryDragEnabled) {
        return;
      }

      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", categoryId);
      setDraggedFavoriteCategoryId(categoryId);
      setFavoriteDropCategoryId(categoryId);
    },
    [isFavoriteCategoryDragEnabled],
  );

  const handleFavoriteDragOver = useCallback(
    (event: DragEvent<HTMLElement>, categoryId: string) => {
      if (!isFavoriteCategoryDragEnabled || !draggedFavoriteCategoryId) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (favoriteDropCategoryId !== categoryId) {
        setFavoriteDropCategoryId(categoryId);
      }
    },
    [draggedFavoriteCategoryId, favoriteDropCategoryId, isFavoriteCategoryDragEnabled],
  );

  const handleFavoriteDrop = useCallback(
    (event: DragEvent<HTMLElement>, targetCategoryId: string) => {
      if (!isFavoriteCategoryDragEnabled || !draggedFavoriteCategoryId) {
        return;
      }

      event.preventDefault();
      let didReorder = false;
      let orderedCategoryIds: string[] = [];
      setFavoriteCategories((current) => {
        const next = reorderFavoriteCategories(
          current,
          draggedFavoriteCategoryId,
          targetCategoryId,
        );
        if (next !== current && branchId) {
          didReorder = true;
          orderedCategoryIds = next.map((category) => category.id);
          writeFavoriteOrder(
            branchId,
            orderedCategoryIds,
          );
        }
        return next;
      });
      if (didReorder && orderedCategoryIds.length > 0) {
        void persistFavoriteOrderForCustomers(orderedCategoryIds);
      }
      setDraggedFavoriteCategoryId("");
      setFavoriteDropCategoryId("");
    },
    [
      branchId,
      draggedFavoriteCategoryId,
      isFavoriteCategoryDragEnabled,
      persistFavoriteOrderForCustomers,
    ],
  );

  const handleFavoriteDragEnd = useCallback(() => {
    setDraggedFavoriteCategoryId("");
    setFavoriteDropCategoryId("");
  }, []);

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

          {!canRenderMenu ? (
            <div className={styles.accessCard}>
              <strong>Branch link required</strong>
              <h2>Open the website from a branch QR code.</h2>
              <p>
                This temporary flow opens directly from the QR link using the branch id in the
                URL.
              </p>
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
            <Link
              href={allCategoriesHref}
              className={styles.circleItem}
              onMouseEnter={warmAllCategories}
              onFocus={warmAllCategories}
              onTouchStart={warmAllCategories}
            >
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
            {circleCategories.map((category) => (
              <Link
                key={category.id}
                href={productHref(category.id, category.name, "home")}
                className={styles.circleItem}
                onMouseEnter={() => warmCategory(category.id, category.name)}
                onFocus={() => warmCategory(category.id, category.name)}
                onTouchStart={() => warmCategory(category.id, category.name)}
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
                  onMouseEnter={() => warmCategory(category.id, category.name)}
                  onFocus={() => warmCategory(category.id, category.name)}
                  onTouchStart={() => warmCategory(category.id, category.name)}
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

        {canRenderMenu && !isLoading && errorMessage && !homeData ? (
          <section className={styles.sectionBlock}>
            <div className={styles.statusCard}>{errorMessage}</div>
          </section>
        ) : null}

        {canRenderMenu && !isLoading && !errorMessage && homeData && favoriteProducts.length === 0 ? (
          <section className={styles.sectionBlock}>
            <div className={styles.statusCard}>No recommended products available for this branch.</div>
          </section>
        ) : null}

        {canRenderMenu && !errorMessage && favoriteProducts.length > 0 ? (
          <section className={styles.sectionBlock}>
            {initialIsAdmin ? (
              <div className={styles.favoriteAdminBar}>
                <div className={styles.favoriteAdminMeta}>
                  <span className={styles.favoriteAdminHint}>
                    Admin mode: drag cards to change favorite product order.
                  </span>
                  {favoriteProductSaveState !== "idle" ? (
                    <span
                      className={
                        favoriteProductSaveState === "error"
                          ? styles.favoriteAdminStatusError
                          : favoriteProductSaveState === "saving"
                            ? styles.favoriteAdminStatusSaving
                            : styles.favoriteAdminStatus
                      }
                    >
                      {favoriteProductSaveMessage}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={styles.favoriteResetButton}
                  onClick={resetFavoriteProductOrder}
                >
                  Reset
                </button>
              </div>
            ) : null}
            <div className={styles.sectionGrid}>
              {favoriteProducts.map(({ key, product }) => {
                const quantity = cartItems.find((item) => item.id === product.id)?.quantity ?? 0;
                const isOutOfStock = product.isOutOfStock;

                return (
                  <article
                    key={key}
                    className={`${styles.productCard} ${
                      isFavoriteProductDragEnabled ? styles.productCardDraggable : ""
                    } ${
                      draggedFavoriteProductKey === key ? styles.productCardDragging : ""
                    } ${
                      favoriteProductDropKey === key && draggedFavoriteProductKey !== key
                        ? styles.productCardDropTarget
                        : ""
                    }`}
                    draggable={isFavoriteProductDragEnabled}
                    onDragStart={(event) => handleFavoriteProductDragStart(event, key)}
                    onDragOver={(event) => handleFavoriteProductDragOver(event, key)}
                    onDrop={(event) => handleFavoriteProductDrop(event, key)}
                    onDragEnd={handleFavoriteProductDragEnd}
                  >
                    <div className={styles.productArt}>
                      <div
                        className={`${styles.productArtBackground} ${
                          isOutOfStock ? styles.productArtBackgroundOutOfStock : ""
                        }`}
                        style={buildCardBackground(product)}
                      />
                      <span className={styles.productArtLabel}>
                        {product.imageUrl ? "" : productAvatarLabel(product.name)}
                      </span>
                      {isOutOfStock ? (
                        <span className={styles.productArtStockOverlay}>OUT OF STOCK</span>
                      ) : null}
                    </div>

                    <div className={styles.productBody}>
                      <div className={styles.productMetaRow}>
                        <VegIcon isVeg={product.isVeg} />
                      </div>
                      <div className={styles.productTitle}>{product.name}</div>
                      <div className={styles.productFooter}>
                        <div className={styles.priceText}>₹{product.price}</div>

                        {isOutOfStock ? (
                          <span className={styles.stockStatus}>OUT OF STOCK</span>
                        ) : quantity === 0 ? (
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

        {canRenderMenu && favoriteCategories.length > 0 ? (
          <section className={styles.favoriteWrap}>
            {initialIsAdmin ? (
              <div className={styles.favoriteAdminBar}>
                <div className={styles.favoriteAdminMeta}>
                  <span className={styles.favoriteAdminHint}>
                    Admin mode: drag cards to change favorite order.
                  </span>
                  {favoriteSaveState !== "idle" ? (
                    <span
                      className={
                        favoriteSaveState === "error"
                          ? styles.favoriteAdminStatusError
                          : favoriteSaveState === "saving"
                            ? styles.favoriteAdminStatusSaving
                            : styles.favoriteAdminStatus
                      }
                    >
                      {favoriteSaveMessage}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={styles.favoriteResetButton}
                  onClick={resetFavoriteCategoryOrder}
                >
                  Reset
                </button>
              </div>
            ) : null}
            <div className={styles.favoriteGrid}>
              {favoriteCategories.map((category) =>
                initialIsAdmin ? (
                  <article
                    key={category.id}
                    className={`${styles.favoriteCard} ${
                      isFavoriteCategoryDragEnabled ? styles.favoriteCardDraggable : ""
                    } ${
                      draggedFavoriteCategoryId === category.id
                        ? styles.favoriteCardDragging
                        : ""
                    } ${
                      favoriteDropCategoryId === category.id &&
                      draggedFavoriteCategoryId !== category.id
                        ? styles.favoriteCardDropTarget
                        : ""
                    }`}
                    draggable={isFavoriteCategoryDragEnabled}
                    onDragStart={(event) => handleFavoriteDragStart(event, category.id)}
                    onDragOver={(event) => handleFavoriteDragOver(event, category.id)}
                    onDrop={(event) => handleFavoriteDrop(event, category.id)}
                    onDragEnd={handleFavoriteDragEnd}
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
                    <span className={styles.favoriteDragTag}>Drag</span>
                  </article>
                ) : (
                  <Link
                    key={category.id}
                    href={productHref(category.id, category.name, "home")}
                    className={styles.favoriteCard}
                    onMouseEnter={() => warmCategory(category.id, category.name)}
                    onFocus={() => warmCategory(category.id, category.name)}
                    onTouchStart={() => warmCategory(category.id, category.name)}
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
                ),
              )}
            </div>
          </section>
        ) : null}
      </section>

      {canRenderMenu && totalItems > 0 ? (
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

      <BottomNav />
    </main>
  );
}
