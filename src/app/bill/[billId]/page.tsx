"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { readBranchSession } from "@/components/branch-session";
import {
  BackIcon,
  BellIcon,
  CardPaymentIcon,
  CartIcon,
  CashIcon,
  PinIcon,
  TableIcon,
  UpiIcon,
  VegIcon,
} from "@/components/menu-icons";
import type { BillSummaryData } from "@/lib/order-types";
import { readSessionCache, writeSessionCache } from "@/lib/session-cache";
import styles from "./page.module.css";

const BILL_CACHE_KEY_PREFIX = "blackforest-order-web-bill:";

export default function BillSummaryPage() {
  const router = useRouter();
  const params = useParams<{ billId: string }>();
  const billId = decodeURIComponent(params.billId);

  const [pageData, setPageData] = useState<BillSummaryData | null>(null);
  const [branchName, setBranchName] = useState("VSeyal");
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("cash");
  const [billMessage, setBillMessage] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const session = readBranchSession();
      if (!session?.branchId) {
        setHasAccess(false);
        setIsLoading(false);
        return;
      }

      setHasAccess(true);
      if (session.branchName) {
        setBranchName(session.branchName);
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!billId) {
      setErrorMessage("Bill id is missing.");
      setIsLoading(false);
      return;
    }

    let isDisposed = false;
    const cacheKey = `${BILL_CACHE_KEY_PREFIX}${billId}`;
    const cached = readSessionCache<BillSummaryData>(cacheKey);
    if (cached) {
      setPageData(cached);
      setBranchName(cached.branchName || "VSeyal");
      setSelectedPaymentMethod(cached.paymentMethod || "cash");
      setIsLoading(false);
    }

    const loadBill = async () => {
      if (!cached) {
        setIsLoading(true);
      }
      setErrorMessage("");

      try {
        const response = await fetch(`/api/bill-summary?billId=${encodeURIComponent(billId)}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          const payload = (await response.json()) as { message?: string };
          throw new Error(payload.message || "Failed to load bill");
        }

        const payload = (await response.json()) as BillSummaryData;
        if (isDisposed) return;
        setPageData(payload);
        setBranchName(payload.branchName || "VSeyal");
        setSelectedPaymentMethod(payload.paymentMethod || "cash");
        writeSessionCache(cacheKey, payload);
      } catch (error) {
        if (isDisposed) return;
        if (cached) return;
        setErrorMessage(error instanceof Error ? error.message : "Failed to load bill");
      } finally {
        if (!isDisposed) {
          setIsLoading(false);
        }
      }
    };

    void loadBill();
    return () => {
      isDisposed = true;
    };
  }, [billId]);

  const returnToMenu = () => {
    router.push("/");
  };

  const tableLabel = pageData?.tableNumber ? `Table ${pageData.tableNumber}` : "Table";
  const sectionLabel = pageData?.section || "Shared Tables";
  const items = pageData?.items ?? [];
  const totalAmount = pageData?.totalAmount ?? 0;

  const paymentOptions = useMemo(
    () => [
      { id: "cash", label: "Cash", icon: CashIcon },
      { id: "upi", label: "UPI", icon: UpiIcon },
      { id: "card", label: "Card", icon: CardPaymentIcon },
    ],
    [],
  );

  if (hasAccess === false) {
    return (
      <main className={styles.page}>
        <section className={styles.shell}>
          <div className={styles.statusCard}>
            <strong>Access blocked</strong>
            Open the homepage first and complete branch location verification.
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <button
            type="button"
            className={styles.headerBackButton}
            aria-label="Back to menu"
            onClick={returnToMenu}
          >
            <BackIcon className={styles.headerBackIcon} />
          </button>

          <h1 className={styles.headerTitle}>{pageData?.branchName || branchName}</h1>

          <div className={styles.headerActions}>
            <button type="button" className={styles.headerIconButton} aria-label="Notifications">
              <BellIcon className={styles.headerIcon} />
            </button>
            <button type="button" className={styles.headerIconButton} aria-label="Cart">
              <CartIcon className={styles.headerIcon} />
            </button>
          </div>
        </header>

        <div className={styles.chipRow}>
          <div className={styles.chip}>
            <TableIcon className={styles.chipIcon} />
            {tableLabel}
          </div>
          <div className={styles.chip}>
            <PinIcon className={styles.chipIcon} />
            {sectionLabel}
          </div>
        </div>

        {isLoading ? <div className={styles.statusCard}>Loading bill...</div> : null}
        {!isLoading && errorMessage ? <div className={styles.statusCard}>{errorMessage}</div> : null}

        {!isLoading && !errorMessage && pageData ? (
          <section className={styles.orderCard}>
            <div className={styles.titleRow}>
              <h2>Previous Orders</h2>
              <div className={styles.titleLine} />
            </div>

            <div className={styles.itemList}>
              {items.map((item) => (
                <article key={item.id} className={styles.itemRow}>
                  <div className={styles.itemLead}>
                    <VegIcon isVeg={item.isVeg} />
                    <div className={styles.itemMeta}>
                      <h3>{item.name}</h3>
                      <div className={styles.statusPill}>{item.status}</div>
                    </div>
                  </div>

                  <div className={styles.itemActions}>
                    <div className={styles.qtyBox}>{item.quantity}</div>
                    <div className={styles.itemPrice}>₹{item.subtotal}</div>
                  </div>
                </article>
              ))}
            </div>

            <button type="button" className={styles.addMoreButton} onClick={returnToMenu}>
              <span>＋</span>
              Add More Items
            </button>
          </section>
        ) : null}
      </section>

      <div className={styles.footerDock}>
        <div className={styles.footerInner}>
          <div className={styles.totalText}>Total: ₹{totalAmount.toFixed(2)}</div>

          <div className={styles.paymentRow}>
            {paymentOptions.map((option) => {
              const Icon = option.icon;
              const isActive = selectedPaymentMethod === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={isActive ? styles.paymentButtonActive : styles.paymentButton}
                  onClick={() => {
                    setSelectedPaymentMethod(option.id);
                    setBillMessage("");
                  }}
                >
                  <Icon className={styles.paymentIcon} />
                  {option.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className={styles.billButton}
            onClick={() => setBillMessage(`Selected ${selectedPaymentMethod.toUpperCase()} billing mode.`)}
          >
            BILL
          </button>

          {billMessage ? <div className={styles.billMessage}>{billMessage}</div> : null}
        </div>
      </div>
    </main>
  );
}
