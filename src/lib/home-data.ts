import type {
  BranchLookupResult,
  CategoryCard,
  HomePageData,
  Product,
  RuleSection,
} from "@/lib/order-types";

const API_BASE = "https://blackforest.vseyal.com/api";
const DEFAULT_BRANCH_ID =
  process.env.DEFAULT_BRANCH_ID?.trim() ||
  process.env.NEXT_PUBLIC_DEFAULT_BRANCH_ID?.trim() ||
  "6906dc71896efbd4bc64d028";

const ACCENTS = [
  "linear-gradient(135deg, #3b261e, #9d5a33)",
  "linear-gradient(135deg, #542f24, #d56d39)",
  "linear-gradient(135deg, #2c3d5d, #4b7cc0)",
  "linear-gradient(135deg, #324533, #67a36d)",
  "linear-gradient(135deg, #70442d, #c89a5a)",
  "linear-gradient(135deg, #70353f, #ef4f5f)",
];

type DynamicMap = Record<string, unknown>;

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function accentFor(value: string) {
  return ACCENTS[hashText(value) % ACCENTS.length];
}

function toMap(value: unknown): DynamicMap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as DynamicMap;
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  const map = toMap(value);
  if (!map) return [value];

  const nestedKeys = ["docs", "items", "rules", "options", "values", "data"];
  for (const key of nestedKeys) {
    const nested = map[key];
    if (Array.isArray(nested)) return nested;
    if (nested && typeof nested === "object") {
      const nestedMap = toMap(nested);
      if (!nestedMap) continue;
      for (const nestedKey of nestedKeys) {
        const inner = nestedMap[nestedKey];
        if (Array.isArray(inner)) return inner;
      }
    }
  }

  return [value];
}

function toBool(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["true", "1", "yes", "enabled", "on"].includes(normalized);
  }
  return false;
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseFloat(value) || 0;
  return 0;
}

function readText(...values: unknown[]) {
  for (const value of values) {
    const text = value?.toString().trim() ?? "";
    if (text) return text;
  }
  return "";
}

function looksLikeObjectId(value: string) {
  return /^[a-f0-9]{24}$/i.test(value.trim());
}

function extractRefId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return value.toString().trim();
  }

  const map = toMap(value);
  if (!map) return "";
  const candidates = [
    map.id,
    map._id,
    map.$oid,
    map.value,
    map.productId,
    map.product,
    map.branchId,
    map.branch,
    map.item,
    map.categoryId,
    map.category,
  ];
  for (const candidate of candidates) {
    const id = extractRefId(candidate);
    if (id) return id;
  }
  return "";
}

function extractCategoryId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return value.toString().trim();
  }

  const map = toMap(value);
  if (!map) return "";
  return extractRefId(map.id ?? map._id ?? map.$oid ?? map.value ?? value);
}

function findByKey(node: unknown, target: string): unknown {
  const normalizedTarget = target.toLowerCase();

  const scan = (value: unknown): unknown => {
    const map = toMap(value);
    if (map) {
      for (const [key, entry] of Object.entries(map)) {
        if (key.toLowerCase() === normalizedTarget) {
          return entry;
        }
      }

      for (const entry of Object.values(map)) {
        const nested = scan(entry);
        if (nested !== undefined) return nested;
      }
      return undefined;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = scan(item);
        if (nested !== undefined) return nested;
      }
    }

    return undefined;
  };

  return scan(node);
}

function ruleMatchesBranch(branchesNode: unknown, branchId: string) {
  return toArray(branchesNode).some((branchRef) => extractRefId(branchRef) === branchId);
}

function normalizeImageUrl(value: unknown): string | null {
  const text = value?.toString().trim();
  if (!text) return null;
  if (text.startsWith("http://") || text.startsWith("https://")) return text;
  if (text.startsWith("//")) return `https:${text}`;
  if (text.startsWith("/")) return `https://blackforest.vseyal.com${text}`;
  if (text.startsWith("blackforest.vseyal.com")) return `https://${text}`;
  return null;
}

function extractImageFromAny(node: unknown): string | null {
  const direct = normalizeImageUrl(node);
  if (direct) return direct;

  if (Array.isArray(node)) {
    for (const item of node) {
      const nested = extractImageFromAny(item);
      if (nested) return nested;
    }
    return null;
  }

  const map = toMap(node);
  if (!map) return null;
  const preferredKeys = [
    "thumbnailURL",
    "thumbnailUrl",
    "url",
    "imageUrl",
    "image",
    "images",
    "photo",
    "picture",
    "media",
    "file",
    "src",
    "asset",
  ];
  for (const key of preferredKeys) {
    const nested = extractImageFromAny(map[key]);
    if (nested) return nested;
  }
  return null;
}

function readCategoryEntry(node: unknown): CategoryCard | null {
  const map = toMap(node);
  if (!map) {
    const text = readText(node);
    if (!text || looksLikeObjectId(text)) return null;
    return text
      ? {
          id: text.toLowerCase(),
          name: text,
          imageUrl: null,
          count: 0,
        }
      : null;
  }

  const id = readText(map.id, map._id, map.$oid, map.value);
  const name = readText(map.name, map.label, map.title, map.categoryName);
  if (!name) return null;

  return {
    id: id || name.toLowerCase(),
    name,
    imageUrl: extractImageFromAny(map.image ?? map.thumbnail ?? map.imageUrl ?? map),
    count: 0,
  };
}

function readProductCategoryEntry(productNode: unknown): CategoryCard | null {
  const map = toMap(productNode);
  if (!map) return null;
  return readCategoryEntry(map.category ?? map.categoryId ?? map.categoryName);
}

function readProductImage(productNode: unknown): string | null {
  const map = toMap(productNode);
  if (!map) return null;
  return extractImageFromAny(map.images ?? map.image ?? map.thumbnail ?? map.imageUrl ?? map);
}

function normalizeProduct(productNode: unknown): Product | null {
  const map = toMap(productNode);
  if (!map) return null;

  const id = extractRefId(map.id ?? map.value ?? map.productId ?? map.product);
  const name = readText(map.name, map.label, map.title);
  if (!id || !name) return null;

  const categoryNode =
    map.category ?? map.categories ?? map.defaultCategory ?? map.categoryId;
  const category = readProductCategoryEntry(map);
  const categoryId = extractCategoryId(categoryNode) || category?.id || "";
  const categoryName =
    category?.name ||
    readText(map.categoryName, map.departmentName, map.department) ||
    "Products";
  const isVeg = toBool(map.isVeg ?? map.is_veg ?? map.veg);
  const imageUrl = readProductImage(map) ?? category?.imageUrl ?? "";
  const price = toNumber(map.price) || toNumber(toMap(map.defaultPriceDetails)?.price);

  return {
    id,
    name,
    price,
    category: categoryName,
    categoryId,
    categoryImageUrl: category?.imageUrl ?? null,
    description: categoryName ? `${categoryName} · ${isVeg ? "Veg" : "Non Veg"}` : "",
    accent: accentFor(id),
    imageUrl,
    isVeg,
  };
}

async function fetchJson(path: string) {
  const response = await fetch(`${API_BASE}${path}`, {
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${path} with ${response.status}`);
  }

  return response.json();
}

function distanceInMeters(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const dLatitude = toRadians(latitude2 - latitude1);
  const dLongitude = toRadians(longitude2 - longitude1);
  const a =
    Math.sin(dLatitude / 2) * Math.sin(dLatitude / 2) +
    Math.cos(toRadians(latitude1)) *
      Math.cos(toRadians(latitude2)) *
      Math.sin(dLongitude / 2) *
      Math.sin(dLongitude / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

async function fetchBranchName(branchId: string) {
  try {
    const branch = await fetchJson(`/branches/${branchId}?depth=1`);
    return readText(toMap(branch)?.name) || "VSeyal";
  } catch {
    return "VSeyal";
  }
}

async function fetchProductsByIds(productIds: string[]) {
  if (productIds.length === 0) return new Map<string, Product>();

  const params = new URLSearchParams();
  params.set("where[id][in]", productIds.join(","));
  params.set("depth", "2");
  params.set("limit", String(Math.max(productIds.length, 1)));

  const decoded = await fetchJson(`/products?${params.toString()}`);
  const products = new Map<string, Product>();
  for (const rawProduct of toArray(decoded)) {
    const normalized = normalizeProduct(rawProduct);
    if (!normalized) continue;
    products.set(normalized.id, normalized);
  }
  return products;
}

async function hydrateCategories(categories: CategoryCard[]) {
  const ids = categories.map((item) => item.id).filter(Boolean);
  if (ids.length === 0) return categories;

  const params = new URLSearchParams();
  params.set("where[id][in]", ids.join(","));
  params.set("depth", "1");
  params.set("limit", String(Math.max(ids.length, 1)));

  const decoded = await fetchJson(`/categories?${params.toString()}`);
  const fetchedById = new Map<string, CategoryCard>();
  for (const rawCategory of toArray(decoded)) {
    const normalized = readCategoryEntry(rawCategory);
    if (!normalized) continue;
    fetchedById.set(normalized.id, normalized);
  }

  return categories.map((category) => {
    const hydrated = fetchedById.get(category.id);
    if (!hydrated) return category;
    return {
      ...category,
      name: hydrated.name || category.name,
      imageUrl: hydrated.imageUrl ?? category.imageUrl,
    };
  });
}

async function hydrateProducts(products: Product[]) {
  const categoryIds = [
    ...new Set(
      products
        .map((product) => product.categoryId.trim())
        .filter((id) => id && looksLikeObjectId(id)),
    ),
  ];
  if (categoryIds.length === 0) return products;

  const params = new URLSearchParams();
  params.set("where[id][in]", categoryIds.join(","));
  params.set("depth", "1");
  params.set("limit", String(Math.max(categoryIds.length, 1)));

  const decoded = await fetchJson(`/categories?${params.toString()}`);
  const categoriesById = new Map<string, CategoryCard>();
  for (const rawCategory of toArray(decoded)) {
    const normalized = readCategoryEntry(rawCategory);
    if (!normalized) continue;
    categoriesById.set(normalized.id, normalized);
  }

  return products.map((product) => {
    const category = categoriesById.get(product.categoryId);
    if (!category) return product;

    return {
      ...product,
      category:
        product.category === "Products" || product.category === product.categoryId
          ? category.name
          : product.category,
      categoryImageUrl: product.categoryImageUrl ?? category.imageUrl,
    };
  });
}

async function fetchBillingCategories(branchId: string) {
  const collectCategories = (rawBills: unknown[]) => {
    const totalsById = new Map<string, number>();
    const categoriesById = new Map<string, CategoryCard>();

    for (const rawBill of rawBills) {
      const bill = toMap(rawBill);
      if (!bill || !toMap(bill.tableDetails)) continue;
      for (const rawItem of toArray(bill.items)) {
        const item = toMap(rawItem);
        if (!item) continue;
        const status = readText(item.status).toLowerCase();
        if (status === "cancelled") continue;
        const category = readProductCategoryEntry(item.product ?? item);
        if (!category) continue;

        const contribution = Math.max(1, toNumber(item.quantity));
        totalsById.set(category.id, (totalsById.get(category.id) ?? 0) + contribution);
        categoriesById.set(category.id, {
          ...category,
          count: Math.round(totalsById.get(category.id) ?? 0),
        });
      }
    }

    return [...categoriesById.values()].sort((left, right) => right.count - left.count);
  };

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const recentStart = new Date(dayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  const todayParams = new URLSearchParams();
  todayParams.set("where[status][in]", "pending,ordered,confirmed,prepared,delivered");
  todayParams.set("where[branch][equals]", branchId);
  todayParams.set("where[createdAt][greater_than_equal]", dayStart.toISOString());
  todayParams.set("limit", "100");
  todayParams.set("sort", "-createdAt");
  todayParams.set("depth", "3");

  const todayBills = toArray(await fetchJson(`/billings?${todayParams.toString()}`));
  let categories = collectCategories(todayBills);
  if (categories.length > 0) {
    return hydrateCategories(categories);
  }

  const recentParams = new URLSearchParams();
  recentParams.set("where[branch][equals]", branchId);
  recentParams.set("where[createdAt][greater_than_equal]", recentStart.toISOString());
  recentParams.set("limit", "300");
  recentParams.set("sort", "-createdAt");
  recentParams.set("depth", "3");

  const recentBills = toArray(await fetchJson(`/billings?${recentParams.toString()}`));
  categories = collectCategories(recentBills);
  return hydrateCategories(categories);
}

function readRuleTitle(rule: DynamicMap) {
  return (
    readText(rule.ruleName, rule.ruleTitle, rule.name, rule.title, rule.label, rule.heading) ||
    "Recommended"
  );
}

async function fetchRuleSections(widgetSettings: unknown, branchId: string) {
  const rules = toArray(findByKey(widgetSettings, "favoriteProductsByBranchRules"));
  const matchingRules = rules
    .map((item) => toMap(item))
    .filter((rule): rule is DynamicMap => Boolean(rule))
    .filter((rule) => toBool(rule.enabled))
    .filter((rule) =>
      ruleMatchesBranch(
        rule.branches ?? rule.branchesIds ?? rule.branchIds ?? rule.branch,
        branchId,
      ),
    );

  const productIds = new Set<string>();
  for (const rule of matchingRules) {
    for (const rawProduct of toArray(
      rule.products ?? rule.favoriteProducts ?? rule.productIds ?? rule.product,
    )) {
      const id = extractRefId(rawProduct);
      if (id) productIds.add(id);
    }
  }

  const productsById = await fetchProductsByIds([...productIds]);
  const sections: RuleSection[] = [];

  for (const rule of matchingRules) {
    const products: Product[] = [];
    const seen = new Set<string>();

    for (const rawProduct of toArray(
      rule.products ?? rule.favoriteProducts ?? rule.productIds ?? rule.product,
    )) {
      const id = extractRefId(rawProduct);
      if (!id || seen.has(id)) continue;
      seen.add(id);

      const normalized = productsById.get(id) ?? normalizeProduct(rawProduct);
      if (!normalized) continue;
      products.push(normalized);
    }

    if (products.length === 0) continue;
    sections.push({
      title: readRuleTitle(rule),
      products: await hydrateProducts(products),
    });
  }

  return sections;
}

async function fetchFavoriteCategories(widgetSettings: unknown, branchId: string) {
  const rules = toArray(findByKey(widgetSettings, "favoriteCategoriesByBranchRules"));
  const titles: string[] = [];
  const categories: CategoryCard[] = [];
  const seenTitles = new Set<string>();
  const seenCategoryIds = new Set<string>();

  for (const rawRule of rules) {
    const rule = toMap(rawRule);
    if (!rule || !toBool(rule.enabled)) continue;
    if (
      !ruleMatchesBranch(
        rule.branches ?? rule.branchesIds ?? rule.branchIds ?? rule.branch,
        branchId,
      )
    ) {
      continue;
    }

    const title = readText(rule.ruleName);
    if (title && !seenTitles.has(title)) {
      seenTitles.add(title);
      titles.push(title);
    }

    for (const rawCategory of toArray(rule.categories ?? rule.category)) {
      const category = readCategoryEntry(rawCategory);
      if (!category || seenCategoryIds.has(category.id)) continue;
      seenCategoryIds.add(category.id);
      categories.push(category);
    }
  }

  return {
    title: titles.length > 0 ? titles.join(" / ") : "Favorite Categories",
    categories: await hydrateCategories(categories),
  };
}

export async function findBranchByCoordinates(
  latitude: number,
  longitude: number,
): Promise<BranchLookupResult> {
  const settings = await fetchJson("/globals/branch-geo-settings");
  const locations = toArray(toMap(settings)?.locations);

  for (const rawLocation of locations) {
    const location = toMap(rawLocation);
    if (!location) continue;

    const branch = toMap(location.branch);
    const branchId = extractRefId(location.branch);
    const branchName = readText(branch?.name, location.branchName, location.name);
    const locationLatitude =
      typeof location.latitude === "number" ? location.latitude : toNumber(location.latitude);
    const locationLongitude =
      typeof location.longitude === "number"
        ? location.longitude
        : toNumber(location.longitude);
    const radiusMeters =
      typeof location.radius === "number" ? location.radius : toNumber(location.radius) || 100;

    if (!branchId || !branchName) continue;
    if (!Number.isFinite(locationLatitude) || !Number.isFinite(locationLongitude)) continue;

    const distanceMeters = distanceInMeters(
      latitude,
      longitude,
      locationLatitude,
      locationLongitude,
    );

    if (distanceMeters <= radiusMeters) {
      return {
        matched: true,
        branchId,
        branchName,
        radiusMeters,
        distanceMeters: Math.round(distanceMeters),
      };
    }
  }

  return {
    matched: false,
    branchId: "",
    branchName: "",
    radiusMeters: null,
    distanceMeters: null,
  };
}

export async function getHomePageData(inputBranchId?: string): Promise<HomePageData> {
  const branchId = readText(inputBranchId) || DEFAULT_BRANCH_ID;
  const [widgetSettings, branchName, billingCategories] = await Promise.all([
    fetchJson("/globals/widget-settings?depth=1"),
    fetchBranchName(branchId),
    fetchBillingCategories(branchId),
  ]);

  const [ruleSections, favoriteCategoryPayload] = await Promise.all([
    fetchRuleSections(widgetSettings, branchId),
    fetchFavoriteCategories(widgetSettings, branchId),
  ]);

  return {
    branchId,
    branchName,
    billingCategories,
    favoriteCategoriesTitle: favoriteCategoryPayload.title,
    favoriteCategories: favoriteCategoryPayload.categories,
    ruleSections,
  };
}
