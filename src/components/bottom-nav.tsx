"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  readActiveBillSession,
  readBranchSession,
} from "@/components/branch-session";
import {
  CallWaiterIcon,
  CartIcon,
  HomeNavIcon,
  MenuNavIcon,
} from "@/components/menu-icons";
import { useOrder } from "@/components/order-provider";
import styles from "./bottom-nav.module.css";

const WAITER_COOLDOWN_SECONDS = 30;

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
  const [hasActiveBillForWaiterCall, setHasActiveBillForWaiterCall] = useState(false);
  const messageTimerRef = useRef<number | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);
  const [waiterCooldownSeconds, setWaiterCooldownSeconds] = useState(0);

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

  const clearCooldownTimer = useCallback(() => {
    if (cooldownTimerRef.current !== null) {
      window.clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
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
      clearCooldownTimer();
    },
    [clearCooldownTimer, clearMessageTimer],
  );

  const refreshWaiterEligibility = useCallback(() => {
    const branchSession = readBranchSession();
    const branchId = branchSession?.branchId?.trim() ?? "";
    const activeBill = readActiveBillSession(branchId);
    const billId = activeBill?.billId?.trim() ?? "";
    setHasActiveBillForWaiterCall(Boolean(branchId && billId));
  }, []);

  useEffect(() => {
    refreshWaiterEligibility();
  }, [pathname, refreshWaiterEligibility]);

  useEffect(() => {
    const handleFocus = () => {
      refreshWaiterEligibility();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleFocus);
    };
  }, [refreshWaiterEligibility]);

  const startWaiterCooldown = useCallback(() => {
    clearCooldownTimer();
    setWaiterCooldownSeconds(WAITER_COOLDOWN_SECONDS);
    cooldownTimerRef.current = window.setInterval(() => {
      setWaiterCooldownSeconds((current) => {
        if (current <= 1) {
          clearCooldownTimer();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }, [clearCooldownTimer]);

  const mapWaiterCallErrorMessage = useCallback(
    (status: number, fallbackMessage: string) => {
      if (status === 404) {
        return "No active bill for this table";
      }

      if (status === 409) {
        const normalized = fallbackMessage.trim().toLowerCase();
        if (
          normalized.includes("branch mismatch") ||
          normalized.includes("different branch")
        ) {
          return "Branch mismatch";
        }

        if (
          normalized.includes("bill already closed") ||
          normalized.includes("closed") ||
          normalized.includes("completed") ||
          normalized.includes("settled") ||
          normalized.includes("cancelled") ||
          normalized.includes("canceled")
        ) {
          return "Bill already closed";
        }
      }

      return fallbackMessage || "Unable to call waiter right now.";
    },
    [],
  );

  const handleCallWaiter = useCallback(async () => {
    if (waiterCallState === "loading" || waiterCooldownSeconds > 0) {
      return;
    }

    const branchSession = readBranchSession();
    const branchId = branchSession?.branchId?.trim() ?? "";
    const activeBill = readActiveBillSession(branchId);

    const billId = activeBill?.billId?.trim() ?? "";
    const tableNumber = activeBill?.tableNumber?.trim() ?? "";
    const section = activeBill?.section?.trim() ?? "";

    if (!branchId) {
      setWaiterCallState("error");
      setWaiterCallMessage("Open the menu QR page first, then tap Call waiter.");
      scheduleMessageReset(4200);
      return;
    }

    if (!billId) {
      setWaiterCallState("error");
      setWaiterCallMessage("Call waiter is available only after order is placed.");
      scheduleMessageReset(4200);
      return;
    }

    setWaiterCallState("loading");
    setWaiterCallMessage("Sending waiter call to billing app...");

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
        throw new Error(
          mapWaiterCallErrorMessage(
            response.status,
            payload.message || "Unable to call waiter right now.",
          ),
        );
      }

      setWaiterCallState("success");
      setWaiterCallMessage(
        payload.message || "Waiter call sent. Staff has been alerted.",
      );
      startWaiterCooldown();
      scheduleMessageReset(3800);
    } catch (error) {
      setWaiterCallState("error");
      setWaiterCallMessage(
        error instanceof Error ? error.message : "Unable to call waiter right now.",
      );
      scheduleMessageReset(4600);
    }
  }, [
    mapWaiterCallErrorMessage,
    scheduleMessageReset,
    startWaiterCooldown,
    waiterCallState,
    waiterCooldownSeconds,
  ]);

  const isWaiterButtonDisabled =
    waiterCallState === "loading" ||
    waiterCooldownSeconds > 0 ||
    !hasActiveBillForWaiterCall;

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
          disabled={isWaiterButtonDisabled}
          aria-label="Call waiter"
        >
          <CallWaiterIcon className={styles.bottomNavSosIcon} />
          <span className={styles.bottomNavSosHint}>
            {!hasActiveBillForWaiterCall
              ? "Place Order"
              : waiterCallState === "loading"
              ? "Calling..."
              : waiterCooldownSeconds > 0
                ? `Wait ${waiterCooldownSeconds}s`
                : "Call Waiter"}
          </span>
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
