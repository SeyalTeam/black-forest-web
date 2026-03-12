"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CartItem, Product } from "@/lib/order-types";

type OrderContextValue = {
  cartItems: CartItem[];
  cookingRequests: Record<string, string>;
  addItem: (product: Product) => void;
  decreaseItem: (productId: string) => void;
  updateCookingRequest: (productId: string, value: string) => void;
  clearCart: () => void;
  totalItems: number;
  totalAmount: number;
};

const STORAGE_KEY = "blackforest-order-web-state";

type PersistedState = {
  cartItems: CartItem[];
  cookingRequests: Record<string, string>;
};

const OrderContext = createContext<OrderContextValue | null>(null);

function readPersistedState(): PersistedState {
  if (typeof window === "undefined") {
    return { cartItems: [], cookingRequests: {} };
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { cartItems: [], cookingRequests: {} };
  }

  try {
    const parsed = JSON.parse(raw) as PersistedState;
    return {
      cartItems: parsed.cartItems ?? [],
      cookingRequests: parsed.cookingRequests ?? {},
    };
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return { cartItems: [], cookingRequests: {} };
  }
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function OrderProvider({ children }: { children: ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>(
    () => readPersistedState().cartItems,
  );
  const [cookingRequests, setCookingRequests] = useState<Record<string, string>>(
    () => readPersistedState().cookingRequests,
  );

  useEffect(() => {
    const payload: PersistedState = { cartItems, cookingRequests };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [cartItems, cookingRequests]);

  const value = useMemo<OrderContextValue>(() => {
    const addItem = (product: Product) => {
      setCartItems((current) => {
        const existing = current.find((item) => item.id === product.id);
        if (!existing) {
          return [...current, { ...product, quantity: 1 }];
        }

        return current.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      });
    };

    const decreaseItem = (productId: string) => {
      setCartItems((current) =>
        current
          .map((item) =>
            item.id === productId ? { ...item, quantity: item.quantity - 1 } : item,
          )
          .filter((item) => item.quantity > 0),
      );
      setCookingRequests((current) => {
        const hasMatchingItem = cartItems.some(
          (item) => item.id === productId && item.quantity > 1,
        );
        if (hasMatchingItem || !(productId in current)) {
          return current;
        }

        const next = { ...current };
        delete next[productId];
        return next;
      });
    };

    const clearCart = () => {
      setCartItems([]);
      setCookingRequests({});
    };

    const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = cartItems.reduce(
      (sum, item) => sum + item.quantity * item.price,
      0,
    );

    return {
      cartItems,
      cookingRequests,
      addItem,
      decreaseItem,
      updateCookingRequest: (productId: string, value: string) => {
        setCookingRequests((current) => {
          const trimmedValue = value.trim();
          if (!trimmedValue && !(productId in current)) {
            return current;
          }

          const next = { ...current };
          if (!trimmedValue) {
            delete next[productId];
          } else {
            next[productId] = value;
          }
          return next;
        });
      },
      clearCart,
      totalItems,
      totalAmount,
    };
  }, [cartItems, cookingRequests]);

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
}

export function useOrder() {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error("useOrder must be used inside OrderProvider");
  }
  return context;
}

export function productAvatarLabel(name: string) {
  return initials(name);
}
