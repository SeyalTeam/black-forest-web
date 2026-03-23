export type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  categoryId: string;
  categoryImageUrl?: string | null;
  description: string;
  accent: string;
  imageUrl: string;
  imageMediaId?: string;
  inventoryQuantity: number | null;
  isOutOfStock: boolean;
  isVeg: boolean;
};

export type CartItem = Product & {
  quantity: number;
};

export type CategoryCard = {
  id: string;
  name: string;
  imageUrl?: string | null;
  count: number;
};

export type RuleSection = {
  title: string;
  products: Product[];
};

export type OfferSlide = {
  badge: string;
  title: string;
  subtitle: string;
  imageUrl?: string | null;
  imageMediaId?: string;
  valueText?: string;
  visualSymbol?: string;
  startColor: string;
  endColor: string;
};

export type HomePageData = {
  branchId: string;
  branchName: string;
  billingPrinterIp: string;
  kotPrinterIps: string[];
  offerSlides: OfferSlide[];
  billingCategories: CategoryCard[];
  topCategories: CategoryCard[];
  favoriteCategoriesTitle: string;
  favoriteCategories: CategoryCard[];
  ruleSections: RuleSection[];
};

export type CategoriesPageData = {
  branchId: string;
  branchName: string;
  offerSlides: OfferSlide[];
  categories: CategoryCard[];
  topCategories: CategoryCard[];
};

export type ProductsPageData = {
  branchId: string;
  branchName: string;
  categoryId: string;
  categoryName: string;
  topCategories: CategoryCard[];
  products: Product[];
};

export type BranchLookupResult = {
  matched: boolean;
  branchId: string;
  branchName: string;
  radiusMeters: number | null;
  distanceMeters: number | null;
};

export type BillSummaryItem = {
  id: string;
  name: string;
  quantity: number;
  subtotal: number;
  status: string;
  isVeg: boolean;
};

export type BillSummaryData = {
  billId: string;
  invoiceNumber: string;
  branchName: string;
  tableNumber: string;
  section: string;
  status: string;
  totalAmount: number;
  paymentMethod: string;
  items: BillSummaryItem[];
};
