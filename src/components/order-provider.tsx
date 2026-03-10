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
  cookingRequest: string;
  addItem: (product: Product) => void;
  decreaseItem: (productId: string) => void;
  updateCookingRequest: (value: string) => void;
  clearCart: () => void;
  totalItems: number;
  totalAmount: number;
};

const STORAGE_KEY = "blackforest-order-web-state";

type PersistedState = {
  cartItems: CartItem[];
  cookingRequest: string;
};

const OrderContext = createContext<OrderContextValue | null>(null);

function readPersistedState(): PersistedState {
  if (typeof window === "undefined") {
    return { cartItems: [], cookingRequest: "" };
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { cartItems: [], cookingRequest: "" };
  }

  try {
    const parsed = JSON.parse(raw) as PersistedState;
    return {
      cartItems: parsed.cartItems ?? [],
      cookingRequest: parsed.cookingRequest ?? "",
    };
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return { cartItems: [], cookingRequest: "" };
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
  const [cookingRequest, setCookingRequest] = useState(
    () => readPersistedState().cookingRequest,
  );

  useEffect(() => {
    const payload: PersistedState = { cartItems, cookingRequest };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [cartItems, cookingRequest]);

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
    };

    const clearCart = () => {
      setCartItems([]);
      setCookingRequest("");
    };

    const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = cartItems.reduce(
      (sum, item) => sum + item.quantity * item.price,
      0,
    );

    return {
      cartItems,
      cookingRequest,
      addItem,
      decreaseItem,
      updateCookingRequest: setCookingRequest,
      clearCart,
      totalItems,
      totalAmount,
    };
  }, [cartItems, cookingRequest]);

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
