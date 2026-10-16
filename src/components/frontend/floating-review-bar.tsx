"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  readActiveBillSession,
  readBranchSession,
  readTableSession,
} from "@/components/frontend/branch-session";
import { productAvatarLabel, useOrder } from "@/components/frontend/order-provider";
import type { BillSummaryData, BillSummaryItem } from "@/lib/order-types";
import { apiUrl } from "@/lib/api";
import styles from "./floating-review-bar.module.css";

// 5 minutes delay after delivery before review prompt appears (5 mins = 300,000 ms)
const REVIEW_DELAY_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 5_000;
const REVIEWED_STORAGE_PREFIX = "blackforest-reviewed-products:";
const DELIVERY_TIME_STORAGE_PREFIX = "blackforest-delivered-time:";

function getReviewedKeys(billId: string): Set<string> {
  if (typeof window === "undefined" || !billId) return new Set();
  try {
    const raw = window.sessionStorage.getItem(`${REVIEWED_STORAGE_PREFIX}${billId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveReviewedKeys(billId: string, set: Set<string>) {
  if (typeof window === "undefined" || !billId) return;
  try {
    window.sessionStorage.setItem(
      `${REVIEWED_STORAGE_PREFIX}${billId}`,
      JSON.stringify(Array.from(set)),
    );
  } catch {}
}

function getStoredDeliveryTime(billId: string, itemId: string): number | null {
  if (typeof window === "undefined" || !billId || !itemId) return null;
  try {
    const raw = window.sessionStorage.getItem(
      `${DELIVERY_TIME_STORAGE_PREFIX}${billId}:${itemId}`,
    );
    if (!raw) return null;
    const num = Number.parseInt(raw, 10);
    return Number.isFinite(num) ? num : null;
  } catch {
    return null;
  }
}

function recordDeliveryTime(billId: string, itemId: string, timestamp: number) {
  if (typeof window === "undefined" || !billId || !itemId) return;
  try {
    window.sessionStorage.setItem(
      `${DELIVERY_TIME_STORAGE_PREFIX}${billId}:${itemId}`,
      String(timestamp),
    );
  } catch {}
}

function parseClockOrIso(value: unknown, referenceDateText: string): number | null {
  const input = typeof value === "string" ? value.trim() : "";
  if (!input) return null;

  const directDate = new Date(input);
  if (!Number.isNaN(directDate.getTime())) {
    return directDate.getTime();
  }

  const timeMatch = input.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!timeMatch) return null;

  const hours = Number.parseInt(timeMatch[1], 10);
  const minutes = Number.parseInt(timeMatch[2], 10);
  const seconds = Number.parseInt(timeMatch[3] ?? "0", 10);

  const refText = typeof referenceDateText === "string" ? referenceDateText.trim() : "";
  const baseDate = refText ? new Date(refText) : new Date();
  const baseTimeMs = !Number.isNaN(baseDate.getTime()) ? baseDate.getTime() : Date.now();

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(baseTimeMs));

  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  const targetDate = new Date(`${year}-${month}-${day}T${hh}:${mm}:${ss}+05:30`);
  return Number.isNaN(targetDate.getTime()) ? null : targetDate.getTime();
}

type ReviewQueueItem = {
  id: string;
  productId: string;
  name: string;
  billId: string;
};

export function FloatingReviewBar() {
  const { totalItems } = useOrder();

  const [queue, setQueue] = useState<ReviewQueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [feedbackText, setFeedbackText] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showSuccessCard, setShowSuccessCard] = useState<boolean>(false);
  const [isExiting, setIsExiting] = useState<boolean>(false);

  const reviewedKeysRef = useRef<Set<string>>(new Set());
  const activeBillIdRef = useRef<string>("");
  const itemsCacheRef = useRef<BillSummaryItem[]>([]);
  const billCreatedAtRef = useRef<string>("");

  const currentItem = queue[currentIndex] ?? null;

  // Sync reviewed set from backend once when bill is discovered
  const syncBackendReviews = useCallback(async (billId: string) => {
    if (!billId) return;
    try {
      const res = await fetch(apiUrl(`/api/reviews?bill=${encodeURIComponent(billId)}`), {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      const docs = Array.isArray(data?.docs) ? data.docs : [];
      if (docs.length > 0) {
        const reviewDoc = docs[0];
        const reviewedItems = Array.isArray(reviewDoc.items) ? reviewDoc.items : [];
        for (const item of reviewedItems) {
          const prodId =
            typeof item.product === "object" ? item.product?.id : item.product;
          if (prodId) {
            reviewedKeysRef.current.add(prodId);
          }
        }
        saveReviewedKeys(billId, reviewedKeysRef.current);
      }
    } catch {}
  }, []);

  // Poll active bill items and schedule review queue
  useEffect(() => {
    let isDisposed = false;

    const checkDeliveredItems = async () => {
      if (isDisposed) return;

      const activeBill = readActiveBillSession();
      const branch = readBranchSession();
      const table = readTableSession();

      const branchId = activeBill?.branchId || branch?.branchId || table?.branchId || "";
      const billId = activeBill?.billId || "";
      const tableNumber = activeBill?.tableNumber || table?.tableNumber || "";
      const section = activeBill?.section || table?.section || "";

      if ((!billId && !tableNumber) || !branchId) {
        return;
      }

      if (billId && billId !== activeBillIdRef.current) {
        activeBillIdRef.current = billId;
        reviewedKeysRef.current = getReviewedKeys(billId);
        void syncBackendReviews(billId);
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
          reviewedKeysRef.current = getReviewedKeys(resolvedBillId);
          void syncBackendReviews(resolvedBillId);
        }

        itemsCacheRef.current = data.items;
        billCreatedAtRef.current = data.createdAt || "";

        const now = Date.now();
        const eligibleQueue: ReviewQueueItem[] = [];

        for (const item of data.items) {
          const itemStatus = (item.status || "").trim().toLowerCase();
          if (itemStatus !== "delivered") {
            continue;
          }

          const prodId = item.productId || item.id;
          if (!prodId) continue;

          // If already reviewed, skip!
          if (reviewedKeysRef.current.has(prodId) || reviewedKeysRef.current.has(item.id)) {
            continue;
          }

          // Determine delivery time
          let deliveryTimeMs =
            getStoredDeliveryTime(resolvedBillId, item.id) ||
            parseClockOrIso(item.deliveredAt, data.createdAt);

          if (!deliveryTimeMs) {
            deliveryTimeMs = now;
            recordDeliveryTime(resolvedBillId, item.id, deliveryTimeMs);
          }

          // Check if at least 5 minutes have passed since delivery
          const elapsedMs = now - deliveryTimeMs;
          if (elapsedMs >= REVIEW_DELAY_MS) {
            eligibleQueue.push({
              id: item.id,
              productId: prodId,
              name: item.name,
              billId: resolvedBillId,
            });
          }
        }

        // Update queue with eligible unreviewed products
        setQueue((prevQueue) => {
          // If queue already has items being reviewed, retain order and append newly eligible
          const prevIds = new Set(prevQueue.map((q) => q.productId));
          const newItems = eligibleQueue.filter((q) => !prevIds.has(q.productId));
          if (prevQueue.length === 0 && newItems.length === 0) return prevQueue;
          return [...prevQueue, ...newItems];
        });
      } catch (err) {
        console.warn("[FloatingReviewBar] check error", err);
      }
    };

    void checkDeliveredItems();

    const intervalId = window.setInterval(() => {
      void checkDeliveredItems();
    }, POLL_INTERVAL_MS);

    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
    };
  }, [syncBackendReviews]);

  // Submit compulsory rating & feedback
  const handleSubmitReview = async () => {
    if (!currentItem) return;

    if (!selectedRating || selectedRating < 1) {
      setErrorMessage("Please select a star rating (1 to 5 stars).");
      return;
    }

    const trimmedFeedback = feedbackText.trim();
    if (!trimmedFeedback) {
      setErrorMessage("Please write your review before submitting.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const activeBill = readActiveBillSession();
      const branch = readBranchSession();

      const customerName = activeBill?.customerName || "";
      const customerPhone = activeBill?.customerPhone || "";
      const branchId = activeBill?.branchId || branch?.branchId || "";

      const res = await fetch(apiUrl("/api/reviews"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bill: currentItem.billId,
          product: currentItem.productId,
          rating: selectedRating,
          feedback: trimmedFeedback,
          customerName: customerName || undefined,
          customerPhone: customerPhone || undefined,
          branch: branchId || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error("Unable to save review. Please try again.");
      }

      // Mark this product as reviewed
      reviewedKeysRef.current.add(currentItem.productId);
      reviewedKeysRef.current.add(currentItem.id);
      saveReviewedKeys(currentItem.billId, reviewedKeysRef.current);

      // Show success celebration
      setShowSuccessCard(true);

      window.setTimeout(() => {
        setShowSuccessCard(false);
        setSelectedRating(0);
        setFeedbackText("");
        setErrorMessage("");

        // Advance to next product in queue
        if (currentIndex + 1 < queue.length) {
          setCurrentIndex((prev) => prev + 1);
        } else {
          // All done! Smoothly slide down and clear queue
          setIsExiting(true);
          window.setTimeout(() => {
            setQueue([]);
            setCurrentIndex(0);
            setIsExiting(false);
          }, 300);
        }
      }, 1400);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Submission failed. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentItem) {
    return null;
  }

  const isAboveCart = totalItems > 0;
  const itemInitials = productAvatarLabel(currentItem.name);
  const totalInQueue = queue.length;
  const currentStep = currentIndex + 1;

  return (
    <div
      className={`${styles.reviewContainer} ${isAboveCart ? styles.reviewContainerAboveCart : ""} ${
        isExiting ? styles.reviewContainerExiting : ""
      }`}
      role="region"
      aria-label="Product Review"
    >
      {showSuccessCard ? (
        <div className={styles.successCard}>
          <div className={styles.successStar}>⭐</div>
          <strong>Thank you for reviewing!</strong>
          <p>Your feedback helps our chefs serve you best.</p>
        </div>
      ) : (
        <div className={styles.reviewInner}>
          <div className={styles.reviewHeader}>
            <div className={styles.productLead}>
              <div className={styles.avatarChip}>{itemInitials || "★"}</div>
              <div className={styles.productInfo}>
                <strong>How was the {currentItem.name}?</strong>
                <p>Delivered 5 mins ago • Please share your review</p>
              </div>
            </div>

            {totalInQueue > 1 ? (
              <span className={styles.queueBadge}>
                {currentStep} of {totalInQueue}
              </span>
            ) : null}
          </div>

          {/* Compulsory 5-Star Rating */}
          <div className={styles.starRatingRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className={`${styles.starButton} ${
                  star <= selectedRating ? styles.starButtonActive : ""
                }`}
                onClick={() => {
                  setSelectedRating(star);
                  if (errorMessage.includes("star")) setErrorMessage("");
                }}
                aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
              >
                ★
              </button>
            ))}
          </div>

          {/* Compulsory Review Typing Box */}
          <div className={styles.feedbackAreaWrap}>
            <textarea
              className={styles.feedbackInput}
              rows={2}
              placeholder="Tell us what you liked or how we can improve (compulsory)..."
              value={feedbackText}
              onChange={(e) => {
                setFeedbackText(e.target.value);
                if (errorMessage.includes("write")) setErrorMessage("");
              }}
            />
            {errorMessage ? (
              <div className={styles.errorBanner}>{errorMessage}</div>
            ) : null}
          </div>

          <button
            type="button"
            className={styles.reviewSubmitBtn}
            onClick={() => {
              void handleSubmitReview();
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Submitting Review..." : "Submit Review"}
          </button>
        </div>
      )}
    </div>
  );
}
