import { Product } from "./order-types";

export function resolveProductPrice(product: Product, section?: string): number {
  if (!section) return product.price;
  
  const upperSection = section.toUpperCase();
  const isNonAc = upperSection.includes("NON AC") || upperSection.includes("NON-AC");
  const isAc = upperSection.includes("AC") && !isNonAc;

  if (isNonAc && product.nonACPrice && product.nonACPrice > 0) {
    return product.nonACPrice;
  }
  if (isAc && product.acPrice && product.acPrice > 0) {
    return product.acPrice;
  }
  
  return product.price;
}

export function applySectionPrice(product: Product, section?: string): Product {
  const resolvedPrice = resolveProductPrice(product, section);
  if (resolvedPrice === product.price) {
    return product;
  }
  return {
    ...product,
    price: resolvedPrice,
  };
}
