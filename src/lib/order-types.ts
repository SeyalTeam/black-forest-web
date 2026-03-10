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

export type HomePageData = {
  branchId: string;
  branchName: string;
  billingCategories: CategoryCard[];
  favoriteCategoriesTitle: string;
  favoriteCategories: CategoryCard[];
  ruleSections: RuleSection[];
};
