"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  readActiveBillSession,
  readBranchSession,
  readTableSession,
} from "@/components/frontend/branch-session";
import {
  ChevronRightIcon,
  CloseIcon,
} from "@/components/frontend/menu-icons";
import { productAvatarLabel, useOrder } from "@/components/frontend/order-provider";
import type { BillSummaryData } from "@/lib/order-types";
import { apiUrl } from "@/lib/api";
import styles from "./prepared-notification-bar.module.css";

type PreparedNoticeItem = {
  id: string;
  name: string;
  billId: string;
};

const POLL_INTERVAL_MS = 4_000;
const DISPLAY_DURATION_MS = 5_000;
const EXIT_ANIM_MS = 300;
const SHOWN_STORAGE_PREFIX = "blackforest-shown-prepared:";

function getSeenKeysFromStorage(billId: string): Set<string> {
  if (typeof window === "undefined" || !billId) return new Set();
  try {
    const raw = window.sessionStorage.getItem(`${SHOWN_STORAGE_PREFIX}${billId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveSeenKeysToStorage(billId: string, keys: Set<string>) {
  if (typeof window === "undefined" || !billId) return;
  try {
    window.sessionStorage.setItem(
      `${SHOWN_STORAGE_PREFIX}${billId}`,
      JSON.stringify(Array.from(keys)),
    );
  } catch {}
}

export function PreparedNotificationBar() {
  const { totalItems } = useOrder();
  const [currentItem, setCurrentItem] = useState<PreparedNoticeItem | null>(null);
  const [isExiting, setIsExiting] = useState(false);

  const queueRef = useRef<PreparedNoticeItem[]>([]);
  const currentItemRef = useRef<PreparedNoticeItem | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const animTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const seenKeysRef = useRef<Set<string>>(new Set());
  const activeBillIdRef = useRef<string>("");

  // Keep ref synchronized with state for callback access
  useEffect(() => {
    currentItemRef.current = currentItem;
  }, [currentItem]);

  const showNextItem = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);

    if (queueRef.current.length === 0) {
      setCurrentItem(null);
      setIsExiting(false);
      return;
    }

    const next = queueRef.current.shift()!;
    setCurrentItem(next);
    setIsExiting(false);

    // Show each prepared notification for exactly 5 seconds
    timerRef.current = setTimeout(() => {
      setIsExiting(true);
      animTimeoutRef.current = setTimeout(() => {
        showNextItem();
      }, EXIT_ANIM_MS);
    }, DISPLAY_DURATION_MS);
  }, []);

  const handleDismiss = useCallback(
    (e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);

      setIsExiting(true);
      animTimeoutRef.current = setTimeout(() => {
        showNextItem();
      }, 200);
    },
    [showNextItem],
  );

  const enqueueItems = useCallback(
    (itemsToEnqueue: PreparedNoticeItem[]) => {
      if (itemsToEnqueue.length === 0) return;

      queueRef.current.push(...itemsToEnqueue);

      // If no item is currently visible, show the first one immediately
      if (!currentItemRef.current) {
        showNextItem();
      }
    },
    [showNextItem],
  );

  useEffect(() => {
    let isDisposed = false;

    const checkActiveBillItems = async () => {
      if (isDisposed) return;

      const activeBill = readActiveBillSession();
      const branch = readBranchSession();
      const table = readTableSession();

      const branchId = activeBill?.branchId || branch?.branchId || table?.branchId || "";
      const billId = activeBill?.billId || "";
      const tableNumber = activeBill?.tableNumber || table?.tableNumber || "";
      const section = activeBill?.section || table?.section || "";

      if (!billId && !tableNumber) {
        return;
      }

      if (!branchId) {
        return;
      }

      // If active bill changed, reload seen keys cache
      if (billId && billId !== activeBillIdRef.current) {
        activeBillIdRef.current = billId;
        seenKeysRef.current = getSeenKeysFromStorage(billId);
      }

      try {
        const queryParams = new URLSearchParams();
        if (billId) {
          queryParams.set("billId", billId);
          queryParams.set("branchId", branchId);
        } else if (tableNumber) {
          queryParams.set("branchId", branchId);
          queryParams.set("tableNumber", tableNumber);
          if (section) queryParams.set("section", section);
        }

        const res = await fetch(apiUrl(`/api/bill-summary?${queryParams.toString()}`), {
          cache: "no-store",
        });

        if (!res.ok) return;

        const data = (await res.json()) as BillSummaryData;
        if (isDisposed || !data || !Array.isArray(data.items)) return;

        const resolvedBillId = data.billId || billId;
        if (resolvedBillId && resolvedBillId !== activeBillIdRef.current) {
          activeBillIdRef.current = resolvedBillId;
          seenKeysRef.current = getSeenKeysFromStorage(resolvedBillId);
        }

        const isInactive = ["completed", "settled", "cancelled"].includes(
          (data.status || "").toLowerCase(),
        );

        if (isInactive) {
          return;
        }

        const newPreparedItems: PreparedNoticeItem[] = [];

        for (const item of data.items) {
          const itemStatus = (item.status || "").trim().toLowerCase();
          if (itemStatus === "prepared") {
            const itemKey = `${resolvedBillId}:${item.id || item.name}`;
            if (!seenKeysRef.current.has(itemKey)) {
              seenKeysRef.current.add(itemKey);
              newPreparedItems.push({
                id: item.id || crypto.randomUUID(),
                name: item.name || "Item",
                billId: resolvedBillId,
              });
            }
          }
        }

        if (newPreparedItems.length > 0) {
          if (resolvedBillId) {
            saveSeenKeysToStorage(resolvedBillId, seenKeysRef.current);
          }
          enqueueItems(newPreparedItems);
        }
      } catch (err) {
        console.warn("[PreparedNotificationBar] poll error", err);
      }
    };

    // Run first check right after mount
    void checkActiveBillItems();

    const intervalId = window.setInterval(() => {
      void checkActiveBillItems();
    }, POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkActiveBillItems();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
    };
  }, [enqueueItems]);

  if (!currentItem) {
    return null;
  }

  const isAboveCart = totalItems > 0;
  const itemInitials = productAvatarLabel(currentItem.name);

  return (
    <div
      key={`${currentItem.billId}-${currentItem.id}`}
      className={`${styles.preparedBar} ${isAboveCart ? styles.preparedBarAboveCart : ""} ${
        isExiting ? styles.preparedBarExiting : ""
      }`}
      role="status"
      aria-live="polite"
    >
      <div className={styles.preparedInfo}>
        <div className={styles.avatarChip}>
          {itemInitials || "✓"}
        </div>
        <div className={styles.preparedText}>
          <strong>{currentItem.name} is Prepared</strong>
          <p>Arrived in few seconds</p>
        </div>
      </div>

      <div className={styles.actionsWrap}>
        <Link href="/kot" className={styles.preparedAction}>
          <span>View</span>
          <ChevronRightIcon className={styles.cartChevron} />
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          className={styles.dismissButton}
          aria-label="Close notification"
        >
          <CloseIcon className={styles.dismissIcon} />
        </button>
      </div>

      {/* 5-second animated progress bar */}
      <div className={styles.progressBar} />
    </div>
  );
}
