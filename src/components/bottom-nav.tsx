"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  readActiveBillSession,
  readBranchSession,
  readTableSession,
} from "@/components/branch-session";
import { CartIcon, HomeNavIcon, MenuNavIcon } from "@/components/menu-icons";
import { useOrder } from "@/components/order-provider";
import styles from "./bottom-nav.module.css";

function getActiveKey(pathname: string) {
  if (pathname === "/") {
    return "home";
  }

  if (pathname === "/categories" || pathname.startsWith("/products/")) {
    return "menu";
  }

  if (pathname === "/kot" || pathname.startsWith("/bill/")) {
    return "cart";
  }

  return "";
}

export function BottomNav() {
  const pathname = usePathname();
  const { totalItems } = useOrder();
  const activeKey = getActiveKey(pathname);
  const [waiterCallState, setWaiterCallState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [waiterCallMessage, setWaiterCallMessage] = useState("");
  const messageTimerRef = useRef<number | null>(null);

  const items = [
    { key: "home", href: "/", label: "Home", Icon: HomeNavIcon },
    { key: "menu", href: "/categories", label: "Menu", Icon: MenuNavIcon },
    { key: "cart", href: "/kot", label: "Cart", Icon: CartIcon },
  ] as const;
  const primaryItems = items.slice(0, 2);
  const cartItems = items.slice(2);

  const clearMessageTimer = useCallback(() => {
    if (messageTimerRef.current !== null) {
      window.clearTimeout(messageTimerRef.current);
      messageTimerRef.current = null;
    }
  }, []);

  const scheduleMessageReset = useCallback(
    (durationMs: number) => {
      clearMessageTimer();
      messageTimerRef.current = window.setTimeout(() => {
        setWaiterCallState("idle");
        setWaiterCallMessage("");
      }, durationMs);
    },
    [clearMessageTimer],
  );

  useEffect(
    () => () => {
      clearMessageTimer();
    },
    [clearMessageTimer],
  );

  const handleCallWaiter = useCallback(async () => {
    if (waiterCallState === "loading") {
      return;
    }

    const branchSession = readBranchSession();
    const branchId = branchSession?.branchId?.trim() ?? "";
    const activeBill = readActiveBillSession(branchId);
    const tableSession = readTableSession(branchId);

    const billId = activeBill?.billId?.trim() ?? "";
    const tableNumber =
      activeBill?.tableNumber?.trim() || tableSession?.tableNumber?.trim() || "";
    const section =
      activeBill?.section?.trim() || tableSession?.section?.trim() || "";

    if (!branchId) {
      setWaiterCallState("error");
      setWaiterCallMessage("Open the menu QR page first, then try SOS.");
      scheduleMessageReset(4200);
      return;
    }

    if (!billId && !tableNumber) {
      setWaiterCallState("error");
      setWaiterCallMessage("Table details are missing. Open Cart once and retry.");
      scheduleMessageReset(4200);
      return;
    }

    setWaiterCallState("loading");
    setWaiterCallMessage("Sending SOS to billing app...");

    try {
      const response = await fetch("/api/call-waiter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branchId,
          billId,
          tableNumber,
          section,
        }),
      });

      const payload = (await response.json()) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message || "Unable to call waiter right now.");
      }

      setWaiterCallState("success");
      setWaiterCallMessage(
        payload.message || "SOS sent. Waiter has been alerted.",
      );
      scheduleMessageReset(3800);
    } catch (error) {
      setWaiterCallState("error");
      setWaiterCallMessage(
        error instanceof Error ? error.message : "Unable to call waiter right now.",
      );
      scheduleMessageReset(4600);
    }
  }, [scheduleMessageReset, waiterCallState]);

  return (
    <nav className={styles.bottomNavShell} aria-label="Bottom navigation">
      {waiterCallMessage ? (
        <div
          className={
            waiterCallState === "success"
              ? `${styles.bottomNavNotice} ${styles.bottomNavNoticeSuccess}`
              : waiterCallState === "error"
                ? `${styles.bottomNavNotice} ${styles.bottomNavNoticeError}`
                : styles.bottomNavNotice
          }
          aria-live="polite"
        >
          {waiterCallMessage}
        </div>
      ) : null}
      <div className={styles.bottomNavInner}>
        {primaryItems.map(({ key, href, label, Icon }) => {
          const isActive = activeKey === key;
          return (
            <Link
              key={key}
              href={href}
              className={isActive ? styles.bottomNavItemActive : styles.bottomNavItem}
            >
              <Icon className={styles.bottomNavIcon} />
              <span className={styles.bottomNavLabel}>{label}</span>
              {key === "cart" && totalItems > 0 ? (
                <span className={styles.bottomNavBadge}>{totalItems}</span>
              ) : null}
            </Link>
          );
        })}
        <button
          type="button"
          className={styles.bottomNavSosButton}
          onClick={handleCallWaiter}
          disabled={waiterCallState === "loading"}
          aria-label="Call waiter"
        >
          <span className={styles.bottomNavSosLabel}>
            {waiterCallState === "loading" ? "WAIT" : "SOS"}
          </span>
          <span className={styles.bottomNavSosHint}>Call Waiter</span>
        </button>
        {cartItems.map(({ key, href, label, Icon }) => {
          const isActive = activeKey === key;
          return (
            <Link
              key={key}
              href={href}
              className={isActive ? styles.bottomNavItemActive : styles.bottomNavItem}
            >
              <Icon className={styles.bottomNavIcon} />
              <span className={styles.bottomNavLabel}>{label}</span>
              {key === "cart" && totalItems > 0 ? (
                <span className={styles.bottomNavBadge}>{totalItems}</span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
