"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  readActiveBillSession,
  readBranchSession,
  readTableSession,
} from "@/components/frontend/branch-session";
import {
  ChatBubbleIcon,
  CloseIcon,
  PaperPlaneIcon,
} from "@/components/frontend/menu-icons";
import type { BillSummaryData, BillSummaryItem } from "@/lib/order-types";
import { apiUrl } from "@/lib/api";
import styles from "./floating-review-bar.module.css";

// 5 minutes delay after delivery before review prompt appears (5 mins = 300,000 ms)
const REVIEW_DELAY_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 5_000;
const REVIEWED_STORAGE_PREFIX = "blackforest-reviewed-products:";
const SKIPPED_STORAGE_PREFIX = "blackforest-skipped-reviews:";
const DELIVERY_TIME_STORAGE_PREFIX = "blackforest-delivered-time:";

function getStorageSet(prefix: string, billId: string): Set<string> {
  if (typeof window === "undefined" || !billId) return new Set();
  try {
    const raw = window.sessionStorage.getItem(`${prefix}${billId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveStorageSet(prefix: string, billId: string, set: Set<string>) {
  if (typeof window === "undefined" || !billId) return;
  try {
    window.sessionStorage.setItem(
      `${prefix}${billId}`,
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
  const [queue, setQueue] = useState<ReviewQueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // State maps per product
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showSuccessCard, setShowSuccessCard] = useState<boolean>(false);
  const [isExiting, setIsExiting] = useState<boolean>(false);
  const [isDismissedSession, setIsDismissedSession] = useState<boolean>(false);

  const reviewedKeysRef = useRef<Set<string>>(new Set());
  const skippedKeysRef = useRef<Set<string>>(new Set());
  const activeBillIdRef = useRef<string>("");

  const currentItem = queue[currentIndex] ?? null;
  const currentRating = currentItem ? ratings[currentItem.id] || 0 : 0;
  const currentFeedback = currentItem ? feedbacks[currentItem.id] || "" : "";

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
        saveStorageSet(REVIEWED_STORAGE_PREFIX, billId, reviewedKeysRef.current);
      }
    } catch {}
  }, []);

  // Poll active bill items and schedule review queue
  useEffect(() => {
    let isDisposed = false;

    const checkDeliveredItems = async () => {
      if (isDisposed || isDismissedSession) return;

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
        reviewedKeysRef.current = getStorageSet(REVIEWED_STORAGE_PREFIX, billId);
        skippedKeysRef.current = getStorageSet(SKIPPED_STORAGE_PREFIX, billId);
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
          reviewedKeysRef.current = getStorageSet(REVIEWED_STORAGE_PREFIX, resolvedBillId);
          skippedKeysRef.current = getStorageSet(SKIPPED_STORAGE_PREFIX, resolvedBillId);
          void syncBackendReviews(resolvedBillId);
        }

        const now = Date.now();
        const eligibleQueue: ReviewQueueItem[] = [];

        for (const item of data.items) {
          const itemStatus = (item.status || "").trim().toLowerCase();
          if (itemStatus !== "delivered") {
            continue;
          }

          const prodId = item.productId || item.id;
          if (!prodId) continue;

          // If already reviewed or skipped for this session, ignore
          if (
            reviewedKeysRef.current.has(prodId) ||
            reviewedKeysRef.current.has(item.id) ||
            skippedKeysRef.current.has(item.id)
          ) {
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
          const prevIds = new Set(prevQueue.map((q) => q.id));
          const newItems = eligibleQueue.filter((q) => !prevIds.has(q.id));
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
  }, [syncBackendReviews, isDismissedSession]);

  // Navigate between items (Back & Next)
  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentIndex < queue.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  // Skip current product
  const handleSkip = () => {
    if (!currentItem) return;

    skippedKeysRef.current.add(currentItem.id);
    saveStorageSet(SKIPPED_STORAGE_PREFIX, currentItem.billId, skippedKeysRef.current);

    // If there are more items to review, advance
    const remaining = queue.filter((_, idx) => idx !== currentIndex);
    if (remaining.length > 0) {
      setQueue(remaining);
      if (currentIndex >= remaining.length) {
        setCurrentIndex(remaining.length - 1);
      }
    } else {
      // Last item skipped: close modal
      setIsExiting(true);
      window.setTimeout(() => {
        setQueue([]);
        setCurrentIndex(0);
        setIsExiting(false);
      }, 250);
    }
  };

  // Close completely for session
  const handleClose = () => {
    setIsDismissedSession(true);
    setIsExiting(true);
    window.setTimeout(() => {
      setQueue([]);
      setCurrentIndex(0);
      setIsExiting(false);
    }, 250);
  };

  // Submit compulsory star rating with optional feedback
  const handleSubmitReview = async () => {
    if (!currentItem || currentRating < 1) return;

    setIsSubmitting(true);

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
          rating: currentRating,
          feedback: currentFeedback.trim(), // Optional text!
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
      saveStorageSet(REVIEWED_STORAGE_PREFIX, currentItem.billId, reviewedKeysRef.current);

      // Show brief celebratory confirmation
      setShowSuccessCard(true);

      window.setTimeout(() => {
        setShowSuccessCard(false);

        // Remove reviewed item from queue
        const remaining = queue.filter((_, idx) => idx !== currentIndex);
        if (remaining.length > 0) {
          setQueue(remaining);
          if (currentIndex >= remaining.length) {
            setCurrentIndex(remaining.length - 1);
          }
        } else {
          // All done! Smoothly slide down
          setIsExiting(true);
          window.setTimeout(() => {
            setQueue([]);
            setCurrentIndex(0);
            setIsExiting(false);
          }, 250);
        }
      }, 1200);
    } catch (err) {
      console.error("[FloatingReviewBar] submit error", err);
      alert("Submission failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentItem || isDismissedSession) {
    return null;
  }

  const totalInQueue = queue.length;
  const currentStep = currentIndex + 1;
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < totalInQueue - 1;

  return (
    <>
      {/* Dimmed Backdrop */}
      <div className={styles.overlay} onClick={handleClose} />

      {/* Main Review Card Modal */}
      <div
        className={`${styles.cardContainer} ${
          isExiting ? styles.cardContainerExiting : ""
        }`}
        role="dialog"
        aria-labelledby="review-dialog-title"
      >
        {showSuccessCard ? (
          <div className={styles.successCard}>
            <div className={styles.successIcon}>⭐</div>
            <strong>Thank you for reviewing!</strong>
            <p>Your feedback helps our chefs serve you the best.</p>
          </div>
        ) : (
          <div className={styles.cardInner}>
            {/* 3D Chef Character with thumbs-up popping out */}
            <div className={styles.chefWrapper}>
              <Image
                src="/chef-clean.png"
                alt="Chef"
                width={140}
                height={133}
                className={styles.chefImage}
                priority
              />
              <div className={styles.sparkles}>✨</div>
            </div>

            {/* Close Button */}
            <button
              type="button"
              className={styles.closeButton}
              onClick={handleClose}
              aria-label="Close review"
            >
              <CloseIcon className={styles.closeIcon} />
            </button>

            {/* Right Top Content next to Chef */}
            <div className={styles.topContent}>
              <div className={styles.topRow}>
                {/* 1 of 3 Pagination Badge with Back and Next */}
                <div className={styles.navBadge}>
                  <button
                    type="button"
                    onClick={handlePrev}
                    disabled={!canGoPrev}
                    className={styles.navArrowBtn}
                    aria-label="Previous order item"
                  >
                    ‹
                  </button>
                  <span className={styles.navText}>
                    {currentStep} of {totalInQueue}
                  </span>
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={!canGoNext}
                    className={styles.navArrowBtn}
                    aria-label="Next order item"
                  >
                    ›
                  </button>
                </div>
              </div>

              {/* Title & Product Name */}
              <div className={styles.titleArea}>
                <h3 className={styles.titleSubtitle}>How was your</h3>
                <h2 id="review-dialog-title" className={styles.titleProductName}>
                  {currentItem.name}?
                </h2>
                {/* Hand-drawn yellow underline SVG */}
                <svg
                  className={styles.underlineAccent}
                  viewBox="0 0 140 8"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M3 5.5C40 2.2 100 2.2 137 5.5"
                    stroke="#f59e0b"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>

            {/* 5 Big Cartoon Gold Stars */}
            <div className={styles.starRow}>
              {[1, 2, 3, 4, 5].map((star) => {
                const isActive = star <= currentRating;
                return (
                  <button
                    key={star}
                    type="button"
                    className={`${styles.starBtn} ${isActive ? styles.starActive : ""}`}
                    onClick={() => {
                      setRatings((prev) => ({ ...prev, [currentItem.id]: star }));
                    }}
                    aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                  >
                    <svg
                      className={styles.starSvg}
                      viewBox="0 0 32 32"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <defs>
                        <linearGradient id={`starGrad-${star}`} x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#fef08a" />
                          <stop offset="50%" stopColor="#facc15" />
                          <stop offset="100%" stopColor="#f59e0b" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M16 2.8l3.95 8.01 8.84 1.28-6.4 6.24 1.51 8.8-7.9-4.16-7.9 4.16 1.51-8.8-6.4-6.24 8.84-1.28L16 2.8z"
                        fill={isActive ? `url(#starGrad-${star})` : "#f3f4f6"}
                        stroke={isActive ? "#92400e" : "#d1d5db"}
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                );
              })}
            </div>

            {/* Feedback Box (Optional text) */}
            <div className={styles.inputWrap}>
              <ChatBubbleIcon className={styles.chatIcon} />
              <input
                type="text"
                className={styles.feedbackInput}
                placeholder="Tell us what you liked or how we can improve... (Optional)"
                value={currentFeedback}
                onChange={(e) => {
                  const val = e.target.value;
                  setFeedbacks((prev) => ({ ...prev, [currentItem.id]: val }));
                }}
              />
            </div>

            {/* Bottom Actions Row */}
            <div className={styles.actionsRow}>
              <button
                type="button"
                className={styles.submitBtn}
                onClick={() => {
                  void handleSubmitReview();
                }}
                disabled={currentRating < 1 || isSubmitting}
              >
                <PaperPlaneIcon className={styles.submitIcon} />
                <span>{isSubmitting ? "Submitting..." : "Submit Review"}</span>
              </button>

              <button
                type="button"
                className={styles.skipBtn}
                onClick={handleSkip}
              >
                Skip for now
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
