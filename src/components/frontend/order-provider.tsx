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
    const cartItems = parsed.cartItems ?? [];
    // Only retain cooking requests for items currently in cart
    const validIds = new Set(cartItems.map((item) => item.id));
    const cookingRequests: Record<string, string> = {};
    if (parsed.cookingRequests && typeof parsed.cookingRequests === "object") {
      for (const [id, note] of Object.entries(parsed.cookingRequests)) {
        if (validIds.has(id) && typeof note === "string" && note.trim()) {
          cookingRequests[id] = note.trim();
        }
      }
    }
    return {
      cartItems,
      cookingRequests,
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
      if (product.isOutOfStock) {
        return;
      }

      setCartItems((current) => {
        const existing = current.find((item) => item.id === product.id);
        if (!existing) {
          // Freshly added item: clear any stale cooking request from prior order
          setCookingRequests((prev) => {
            if (!(product.id in prev)) return prev;
            const next = { ...prev };
            delete next[product.id];
            return next;
          });
          return [...current, { ...product, quantity: 1 }];
        }

        return current.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      });
    };

    const decreaseItem = (productId: string) => {
      setCartItems((current) => {
        const updated = current
          .map((item) =>
            item.id === productId ? { ...item, quantity: item.quantity - 1 } : item,
          )
          .filter((item) => item.quantity > 0);

        const stillInCart = updated.some((item) => item.id === productId);
        if (!stillInCart) {
          setCookingRequests((prev) => {
            if (!(productId in prev)) return prev;
            const next = { ...prev };
            delete next[productId];
            return next;
          });
        }

        return updated;
      });
    };

    const clearCart = () => {
      setCartItems([]);
      setCookingRequests({});
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {}
      }
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
