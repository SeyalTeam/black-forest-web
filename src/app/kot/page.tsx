"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearActiveBillSession,
  readActiveBillSession,
  readBranchSession,
  readTableSession,
  writeActiveBillSession,
} from "@/components/branch-session";
import { BottomNav } from "@/components/bottom-nav";
import {
  BackIcon,
  BellIcon,
  CardPaymentIcon,
  CashIcon,
  CloseIcon,
  HistoryIcon,
  NoteAddIcon,
  NoteSavedIcon,
  PinIcon,
  TableIcon,
  UpiIcon,
  VegIcon,
} from "@/components/menu-icons";
import { useOrder } from "@/components/order-provider";
import type { BillSummaryData } from "@/lib/order-types";
import { readSessionCache, writeSessionCache } from "@/lib/session-cache";
import styles from "./kot-shell.module.css";

type CustomerDetailsConfig = {
  showCustomerDetails: boolean;
  allowSkip: boolean;
  autoSubmit: boolean;
  showHistory: boolean;
};

type CustomerLookupBill = {
  id: string;
  invoiceNumber: string;
  status: string;
  paymentMethod: string;
  totalAmount: number;
  createdAt: string;
  tableNumber: string;
  section: string;
  customerName: string;
};

type CustomerLookupResult = {
  name: string;
  phoneNumber: string;
  totalBills: number;
  totalAmount: number;
  isNewCustomer: boolean;
  bills: CustomerLookupBill[];
};

const defaultCustomerConfig: CustomerDetailsConfig = {
  showCustomerDetails: true,
  allowSkip: true,
  autoSubmit: true,
  showHistory: true,
};

const BILL_CACHE_KEY_PREFIX = "blackforest-order-web-bill:";

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

function formatShortDate(value: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function titleCase(value: string) {
  if (!value) return "";
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function KotPage() {
  const router = useRouter();
  const {
    cartItems,
    clearCart,
    addItem,
    decreaseItem,
    cookingRequests,
    updateCookingRequest,
  } = useOrder();
  const [editingRequestItemId, setEditingRequestItemId] = useState<string | null>(null);
  const [requestDraft, setRequestDraft] = useState("");
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [branchId, setBranchId] = useState("");
  const [branchName, setBranchName] = useState("VSeyal");
  const [sharedTableNumber, setSharedTableNumber] = useState("");
  const [isQrTableLocked, setIsQrTableLocked] = useState(false);
  const [preferredSection, setPreferredSection] = useState("");
  const [previousBillData, setPreviousBillData] = useState<BillSummaryData | null>(null);
  const [customerConfig, setCustomerConfig] =
    useState<CustomerDetailsConfig>(defaultCustomerConfig);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerPhoneDraft, setCustomerPhoneDraft] = useState("");
  const [customerNameDraft, setCustomerNameDraft] = useState("");
  const [customerLookupData, setCustomerLookupData] = useState<CustomerLookupResult | null>(null);
  const [historyLookupData, setHistoryLookupData] = useState<CustomerLookupResult | null>(null);
  const [isCustomerLookupLoading, setIsCustomerLookupLoading] = useState(false);
  const [isHistoryLookupLoading, setIsHistoryLookupLoading] = useState(false);
  const [customerLookupError, setCustomerLookupError] = useState("");
  const [customerModalError, setCustomerModalError] = useState("");
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [isSubmittingBill, setIsSubmittingBill] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("cash");
  const [billError, setBillError] = useState("");
  const [orderMessage, setOrderMessage] = useState("");
  const [orderError, setOrderError] = useState("");
  const lookupDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const session = readBranchSession();
      if (!session?.branchId) {
        setHasAccess(false);
        return;
      }

      setHasAccess(true);
      setBranchId(session.branchId);
      setBranchName(session.branchName || "VSeyal");
      const tableSession = readTableSession(session.branchId);
      if (tableSession?.tableNumber) {
        setSharedTableNumber(tableSession.tableNumber);
        setPreferredSection(tableSession.section);
        setIsQrTableLocked(true);
      } else {
        setIsQrTableLocked(false);
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!branchId) {
      return;
    }

    let isDisposed = false;

    const loadCustomerConfig = async () => {
      try {
        const response = await fetch(
          `/api/customer-details-config?branchId=${encodeURIComponent(branchId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as Partial<CustomerDetailsConfig>;
        if (isDisposed) {
          return;
        }

        setCustomerConfig({
          showCustomerDetails: payload.showCustomerDetails ?? true,
          allowSkip: payload.allowSkip ?? true,
          autoSubmit: payload.autoSubmit ?? true,
          showHistory: payload.showHistory ?? true,
        });
      } catch {
        if (!isDisposed) {
          setCustomerConfig(defaultCustomerConfig);
        }
      }
    };

    void loadCustomerConfig();
    return () => {
      isDisposed = true;
    };
  }, [branchId]);

  useEffect(() => {
    if (!branchId) {
      setPreviousBillData(null);
      return;
    }

    const activeBill = readActiveBillSession(branchId);
    if (!activeBill?.billId) {
      setPreviousBillData(null);
      return;
    }

    if (activeBill.tableNumber) {
      setSharedTableNumber((current) => current.trim() || activeBill.tableNumber);
    }
    if (activeBill.section) {
      setPreferredSection((current) => current.trim() || activeBill.section);
    }
    if (activeBill.customerName) {
      setCustomerName((current) => current.trim() || activeBill.customerName);
    }
    if (activeBill.customerPhone) {
      setCustomerPhone((current) => current.trim() || activeBill.customerPhone);
    }

    let isDisposed = false;
    const cacheKey = `${BILL_CACHE_KEY_PREFIX}${activeBill.billId}`;
    const cached = readSessionCache<BillSummaryData>(cacheKey);
    if (cached) {
      setPreviousBillData(cached);
    }

    const loadPreviousBill = async () => {
      try {
        const response = await fetch(
          `/api/bill-summary?billId=${encodeURIComponent(activeBill.billId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          if (!cached && !isDisposed) {
            setPreviousBillData(null);
          }
          return;
        }

        const payload = (await response.json()) as BillSummaryData;
        if (isDisposed) {
          return;
        }

        setPreviousBillData(payload);
        writeSessionCache(cacheKey, payload);
        if (payload.tableNumber) {
          setSharedTableNumber((current) => current.trim() || payload.tableNumber);
        }
        if (payload.section) {
          setPreferredSection((current) => current.trim() || payload.section);
        }
      } catch {
        if (!cached && !isDisposed) {
          setPreviousBillData(null);
        }
      }
    };

    void loadPreviousBill();
    return () => {
      isDisposed = true;
    };
  }, [branchId]);

  useEffect(() => {
    return () => {
      if (lookupDebounceRef.current !== null) {
        window.clearTimeout(lookupDebounceRef.current);
      }
    };
  }, []);

  const activeEditingRequestItemId =
    editingRequestItemId && cartItems.some((item) => item.id === editingRequestItemId)
      ? editingRequestItemId
      : null;
  const trimmedTableNumber = sharedTableNumber.trim();
  const tableChipLabel = trimmedTableNumber
    ? `Table ${trimmedTableNumber}`
    : previousBillData?.tableNumber
      ? `Table ${previousBillData.tableNumber}`
      : "Shared Tables";
  const sectionChipLabel = preferredSection.trim() || previousBillData?.section || "";
  const showDetailedTableChips = Boolean(trimmedTableNumber || sectionChipLabel);
  const matchingPreviousBill =
    previousBillData &&
    (!trimmedTableNumber || previousBillData.tableNumber === trimmedTableNumber) &&
    (!sectionChipLabel || !previousBillData.section || previousBillData.section === sectionChipLabel)
      ? previousBillData
      : null;
  const hasCurrentItems = cartItems.length > 0;
  const hasPreviousItems = Boolean(matchingPreviousBill?.items.length);
  const showBillFooter = !hasCurrentItems && hasPreviousItems;
  const normalizedCustomerPhoneDraft = normalizePhone(customerPhoneDraft);
  const hasExistingCustomerDetails =
    customerName.trim().length > 0 || customerPhone.trim().length > 0;
  const headerDisplayName = customerName.trim() || "Customer";
  const canOpenCustomerHistory =
    customerConfig.showHistory &&
    normalizedCustomerPhoneDraft.length >= 10 &&
    !isHistoryLookupLoading;
  const showCustomerSummary =
    normalizedCustomerPhoneDraft.length >= 10 && customerLookupData !== null;

  const closeRequestEditor = () => {
    setEditingRequestItemId(null);
    setRequestDraft("");
  };

  const returnToMenu = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/");
  };
  const saveRequestEditor = () => {
    if (!activeEditingRequestItemId) {
      return;
    }

    updateCookingRequest(activeEditingRequestItemId, requestDraft);
    closeRequestEditor();
  };

  const fetchCustomerLookup = useCallback(
    async (phone: string, limit = 20) => {
      const normalizedPhone = normalizePhone(phone);
      if (!branchId || normalizedPhone.length < 10) {
        return null;
      }

      const response = await fetch(
        `/api/customer-lookup?branchId=${encodeURIComponent(
          branchId,
        )}&phoneNumber=${encodeURIComponent(normalizedPhone)}&limit=${limit}`,
        { cache: "no-store" },
      );

      const payload = (await response.json()) as CustomerLookupResult & { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || "Unable to fetch customer details");
      }

      return payload;
    },
    [branchId],
  );

  const openCustomerModal = () => {
    setCustomerPhoneDraft(customerPhone);
    setCustomerNameDraft(customerName);
    setCustomerLookupData(null);
    setHistoryLookupData(null);
    setCustomerLookupError("");
    setCustomerModalError("");
    setIsHistoryModalOpen(false);
    setIsHistoryLookupLoading(false);
    setIsCustomerModalOpen(true);
  };

  const closeCustomerModal = () => {
    setIsCustomerModalOpen(false);
    setCustomerModalError("");
    setCustomerLookupError("");
    setIsHistoryModalOpen(false);
    setIsHistoryLookupLoading(false);
    setHistoryLookupData(null);
    if (lookupDebounceRef.current !== null) {
      window.clearTimeout(lookupDebounceRef.current);
      lookupDebounceRef.current = null;
    }
  };

  const closeHistoryModal = () => {
    setIsHistoryModalOpen(false);
  };

  const goHomeAfterBillCompletion = useCallback(
    (resolvedBillId: string) => {
      if (typeof window !== "undefined") {
        const normalizedBillId = resolvedBillId.trim();
        if (normalizedBillId) {
          window.sessionStorage.removeItem(`${BILL_CACHE_KEY_PREFIX}${normalizedBillId}`);
        }
      }

      clearActiveBillSession();
      router.replace("/");
    },
    [router],
  );

  const performOrderSubmission = async (customerDetails?: {
    name?: string;
    phoneNumber?: string;
  }) => {
    const trimmedTableNumber = sharedTableNumber.trim();
    if (!branchId) {
      setOrderError("Branch is not ready yet. Open the homepage again.");
      setOrderMessage("");
      return;
    }
    if (!trimmedTableNumber) {
      setOrderError("Enter a table number before placing the order.");
      setOrderMessage("");
      return;
    }
    if (cartItems.length === 0) {
      setOrderError("Add at least one item before placing the order.");
      setOrderMessage("");
      return;
    }

    setIsSubmittingOrder(true);
    setOrderError("");
    setOrderMessage("");

    try {
      const response = await fetch("/api/place-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branchId,
          branchName,
          tableNumber: trimmedTableNumber,
          preferredSection,
          customerDetails: {
            name: customerDetails?.name?.trim() ?? "",
            phoneNumber: customerDetails?.phoneNumber?.trim() ?? "",
          },
          items: cartItems.map((item) => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            note: cookingRequests[item.id] ?? "",
          })),
        }),
      });

      const payload = (await response.json()) as {
        message?: string;
        invoiceNumber?: string;
        billId?: string;
        tableNumber?: string;
        section?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message || "Unable to place the order.");
      }

      clearCart();
      if (payload.billId) {
        writeActiveBillSession({
          branchId,
          billId: payload.billId,
          tableNumber: payload.tableNumber || trimmedTableNumber,
          section: payload.section || preferredSection,
          customerName: customerDetails?.name?.trim() || customerName.trim(),
          customerPhone: customerDetails?.phoneNumber?.trim() || customerPhone.trim(),
        });
        router.replace("/");
        return;
      }

      setOrderMessage(
        payload.invoiceNumber
          ? `Order placed successfully. Invoice ${payload.invoiceNumber}.`
          : `Order placed successfully for table ${trimmedTableNumber}.`,
      );
    } catch (error) {
      setOrderError(
        error instanceof Error ? error.message : "Unable to place the order.",
      );
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const submitCustomerDetails = async ({ skip }: { skip: boolean }) => {
    if (skip) {
      setCustomerName("");
      setCustomerPhone("");
      closeCustomerModal();
      await performOrderSubmission();
      return;
    }

    const trimmedName = customerNameDraft.trim();
    const normalizedPhone = normalizePhone(customerPhoneDraft);

    if (!trimmedName && !normalizedPhone) {
      setCustomerModalError("Please enter customer name or phone number.");
      return;
    }

    if (normalizedPhone && normalizedPhone.length < 10) {
      setCustomerModalError("Enter a valid 10-digit phone number or clear the field.");
      return;
    }

    setCustomerName(trimmedName);
    setCustomerPhone(normalizedPhone);
    closeCustomerModal();
    await performOrderSubmission({
      name: trimmedName,
      phoneNumber: normalizedPhone,
    });
  };

  const completeBill = async () => {
    if (!matchingPreviousBill?.billId) {
      setBillError("Bill is not ready yet.");
      return;
    }

    setIsSubmittingBill(true);
    setBillError("");

    try {
      const response = await fetch("/api/complete-bill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          billId: matchingPreviousBill.billId,
          paymentMethod: selectedPaymentMethod,
        }),
      });

      const payload = (await response.json()) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message || "Unable to complete bill.");
      }

      goHomeAfterBillCompletion(matchingPreviousBill.billId);
    } catch (error) {
      setBillError(error instanceof Error ? error.message : "Unable to complete bill.");
    } finally {
      setIsSubmittingBill(false);
    }
  };

  const openCustomerHistory = async () => {
    if (!canOpenCustomerHistory) {
      return;
    }

    setIsHistoryLookupLoading(true);
    setCustomerLookupError("");
    try {
      const payload = await fetchCustomerLookup(customerPhoneDraft, 50);
      if (!payload) {
        throw new Error("No customer history found");
      }
      setHistoryLookupData(payload);
      if (payload.name) {
        setCustomerNameDraft((current) => current.trim() || payload.name);
      }
      setIsHistoryModalOpen(true);
    } catch (error) {
      setCustomerLookupError(
        error instanceof Error ? error.message : "Unable to load customer history",
      );
    } finally {
      setIsHistoryLookupLoading(false);
    }
  };

  useEffect(() => {
    if (!isCustomerModalOpen) {
      return;
    }

    const normalizedPhone = normalizePhone(customerPhoneDraft);
    if (lookupDebounceRef.current !== null) {
      window.clearTimeout(lookupDebounceRef.current);
      lookupDebounceRef.current = null;
    }

    if (normalizedPhone.length < 10) {
      setCustomerLookupData(null);
      setCustomerLookupError("");
      setIsCustomerLookupLoading(false);
      return;
    }

    let isDisposed = false;
    setCustomerLookupError("");
    setIsCustomerLookupLoading(true);
    lookupDebounceRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          const payload = await fetchCustomerLookup(normalizedPhone, 20);
          if (isDisposed || normalizePhone(customerPhoneDraft) !== normalizedPhone) {
            return;
          }
          setCustomerLookupData(payload);
          if (payload?.name) {
            setCustomerNameDraft((current) => current.trim() || payload.name);
          }
        } catch (error) {
          if (isDisposed || normalizePhone(customerPhoneDraft) !== normalizedPhone) {
            return;
          }
          setCustomerLookupData(null);
          setCustomerLookupError(
            error instanceof Error ? error.message : "Unable to fetch customer details",
          );
        } finally {
          if (!isDisposed && normalizePhone(customerPhoneDraft) === normalizedPhone) {
            setIsCustomerLookupLoading(false);
          }
        }
      })();
    }, 300);

    return () => {
      isDisposed = true;
      if (lookupDebounceRef.current !== null) {
        window.clearTimeout(lookupDebounceRef.current);
        lookupDebounceRef.current = null;
      }
    };
  }, [customerPhoneDraft, fetchCustomerLookup, isCustomerModalOpen]);

  const submitOrder = async () => {
    const trimmedTableNumber = sharedTableNumber.trim();
    setOrderError("");
    setOrderMessage("");

    if (!branchId) {
      setOrderError("Branch is not ready yet. Open the homepage again.");
      return;
    }
    if (!trimmedTableNumber) {
      setOrderError("Enter a table number before placing the order.");
      return;
    }
    if (cartItems.length === 0) {
      setOrderError("Add at least one item before placing the order.");
      return;
    }

    if (customerConfig.showCustomerDetails && !hasExistingCustomerDetails) {
      openCustomerModal();
      return;
    }

    await performOrderSubmission({
      name: customerName,
      phoneNumber: customerPhone,
    });
  };

  useEffect(() => {
    if (!matchingPreviousBill) {
      return;
    }

    setSelectedPaymentMethod(matchingPreviousBill.paymentMethod || "cash");
  }, [matchingPreviousBill]);

  const paymentOptions = [
    { id: "cash", label: "Cash", icon: CashIcon },
    { id: "upi", label: "UPI", icon: UpiIcon },
    { id: "card", label: "Card", icon: CardPaymentIcon },
  ] as const;

  if (hasAccess === false) {
    return (
      <main className={styles.page}>
        <section className={styles.shell}>
          <div className={styles.statusCard}>
            <strong>Access blocked</strong>
            Open the homepage first from the branch QR link.
          </div>
        </section>
      </main>
    );
  }

  if (hasAccess === null) {
    return (
      <main className={styles.page}>
        <section className={styles.shell}>
          <div className={styles.statusCard}>Checking access...</div>
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

          <h1 className={styles.headerTitle}>{headerDisplayName}</h1>

          <div className={styles.headerActions}>
            <button type="button" className={styles.headerIconButton} aria-label="Notifications">
              <BellIcon className={styles.headerIcon} />
            </button>
          </div>
        </header>

        <div className={styles.chipRow}>
          {showDetailedTableChips ? (
            <div className={styles.chip}>
              <TableIcon className={styles.chipIconSvg} />
              {tableChipLabel}
            </div>
          ) : (
            <div className={styles.chip}>
              <PinIcon className={styles.chipIconSvg} />
              Shared Tables
            </div>
          )}
        </div>

        <section className={styles.orderCard}>
          {hasCurrentItems || !hasPreviousItems ? (
            <>
              <div className={styles.titleRow}>
                <h2>Current Order</h2>
                <div className={styles.titleLine} />
              </div>

              <div className={styles.itemList}>
                {hasCurrentItems ? (
                  cartItems.map((item, index) => {
                    const itemNote = cookingRequests[item.id]?.trim() ?? "";
                    const hasSavedNote = itemNote.length > 0;

                    return (
                      <div key={item.id} className={styles.itemGroup}>
                        <article className={styles.itemRow}>
                          <div className={styles.itemLead}>
                            <VegIcon isVeg={item.isVeg} />
                            <div className={styles.itemMeta}>
                              <h3>{item.name}</h3>
                              {hasSavedNote ? (
                                <div className={styles.itemSavedNote}>{itemNote}</div>
                              ) : index === 0 ? (
                                <div className={styles.itemHintText}>
                                  Tap
                                  <NoteAddIcon className={styles.itemHintInlineIcon} />
                                  Icon to add a cooking note
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <button
                            type="button"
                            className={styles.noteButton}
                            onClick={() => {
                              setEditingRequestItemId(item.id);
                              setRequestDraft(cookingRequests[item.id] ?? "");
                            }}
                            aria-label="Cooking requests"
                          >
                            {hasSavedNote ? (
                              <NoteSavedIcon
                                className={`${styles.noteIcon} ${styles.noteSavedIcon}`}
                              />
                            ) : (
                              <NoteAddIcon className={styles.noteIcon} />
                            )}
                          </button>

                          <div className={styles.itemActions}>
                            <div className={styles.qtyBox}>
                              <button type="button" onClick={() => decreaseItem(item.id)}>
                                −
                              </button>
                              <span className={styles.qtyValue}>{item.quantity}</span>
                              <button type="button" onClick={() => addItem(item)}>
                                +
                              </button>
                            </div>
                            <div className={styles.itemPrice}>₹{item.price * item.quantity}</div>
                          </div>
                        </article>
                      </div>
                    );
                  })
                ) : (
                  <div className={styles.emptyState}>No items added yet.</div>
                )}
              </div>
            </>
          ) : null}

          {hasPreviousItems ? (
            <>
              {hasCurrentItems || !hasPreviousItems ? (
                <div className={styles.cardDivider} />
              ) : null}

              <div className={styles.titleRow}>
                <h2>Previous Orders</h2>
                <div className={styles.titleLine} />
              </div>

              <div className={styles.previousItemList}>
                {matchingPreviousBill!.items.map((item) => (
                  <article key={item.id} className={styles.previousItemRow}>
                    <div className={styles.itemLead}>
                      <VegIcon isVeg={item.isVeg} />
                      <div className={styles.previousItemMeta}>
                        <h3>{item.name}</h3>
                        <div className={styles.statusPill}>{item.status}</div>
                      </div>
                    </div>

                    <div className={styles.previousItemActions}>
                      <div className={styles.readonlyQtyBox}>{item.quantity}</div>
                      <div className={styles.itemPrice}>₹{item.subtotal}</div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}

          <button type="button" className={styles.addMoreButton} onClick={returnToMenu}>
            <span>＋</span>
            Add More Items
          </button>
        </section>
      </section>

      <div className={styles.footerDock}>
        <div className={styles.footerInner}>
          {showBillFooter ? (
            <>
              <div className={styles.totalText}>
                Total: ₹{(matchingPreviousBill?.totalAmount ?? 0).toFixed(2)}
              </div>

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
                        if (isSubmittingBill) {
                          return;
                        }
                        setSelectedPaymentMethod(option.id);
                        setBillError("");
                      }}
                      disabled={isSubmittingBill}
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
                onClick={() => {
                  void completeBill();
                }}
                disabled={isSubmittingBill}
              >
                {isSubmittingBill ? "BILLING..." : "BILL"}
              </button>

              {billError ? <div className={styles.billError}>{billError}</div> : null}
            </>
          ) : (
            <>
              {!isQrTableLocked ? (
                <input
                  value={sharedTableNumber}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setSharedTableNumber(nextValue);
                    const trimmedNextValue = nextValue.trim();
                    if (preferredSection && trimmedNextValue !== sharedTableNumber.trim()) {
                      setPreferredSection("");
                    }
                    if (orderError) setOrderError("");
                    if (orderMessage) setOrderMessage("");
                  }}
                  className={styles.sharedTableInput}
                  placeholder="Enter table number"
                />
              ) : null}
              <button
                type="button"
                className={styles.orderButton}
                onClick={() => {
                  void submitOrder();
                }}
                disabled={isSubmittingOrder}
              >
                {isSubmittingOrder ? "PLACING..." : "ORDER"}
              </button>
              {orderError ? <div className={styles.orderFeedbackError}>{orderError}</div> : null}
              {orderMessage ? <div className={styles.orderFeedbackSuccess}>{orderMessage}</div> : null}
            </>
          )}
        </div>
      </div>

      <BottomNav />

      {isCustomerModalOpen ? (
        <div className={styles.modalBackdrop}>
          <div
            className={styles.customerModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-details-title"
          >
            <div className={styles.customerModalHeader}>
              {customerConfig.showHistory ? (
                <button
                  type="button"
                  className={`${styles.historyButton} ${
                    !canOpenCustomerHistory ? styles.historyButtonDisabled : ""
                  }`}
                  onClick={() => {
                    void openCustomerHistory();
                  }}
                  disabled={!canOpenCustomerHistory}
                  aria-label="Customer history"
                >
                  {isHistoryLookupLoading ? (
                    <span className={styles.historySpinner} />
                  ) : (
                    <HistoryIcon className={styles.historyIcon} />
                  )}
                </button>
              ) : (
                <div className={styles.modalIconSpacer} />
              )}

              <h2 id="customer-details-title" className={styles.customerModalTitle}>
                Customer Details
              </h2>

              {customerConfig.allowSkip ? (
                <button
                  type="button"
                  className={styles.customerModalClose}
                  onClick={closeCustomerModal}
                  aria-label="Close customer details"
                >
                  <CloseIcon className={styles.customerModalCloseIcon} />
                </button>
              ) : (
                <div className={styles.modalIconSpacer} />
              )}
            </div>

            <label className={styles.customerFieldLabel} htmlFor="customer-phone">
              Phone Number
            </label>
            <div className={styles.customerField}>
              <input
                id="customer-phone"
                value={customerPhoneDraft}
                onChange={(event) => {
                  setCustomerPhoneDraft(normalizePhone(event.target.value).slice(0, 10));
                  setCustomerModalError("");
                  setCustomerLookupError("");
                  setHistoryLookupData(null);
                }}
                className={styles.customerInput}
                placeholder="Enter phone number"
                inputMode="numeric"
                autoFocus
              />
            </div>

            {isCustomerLookupLoading ? (
              <div className={styles.customerLookupLoading}>
                <span className={styles.historySpinner} />
                Looking up customer...
              </div>
            ) : null}

            {customerLookupError ? (
              <div className={styles.customerLookupError}>{customerLookupError}</div>
            ) : null}

            <label className={styles.customerFieldLabel} htmlFor="customer-name">
              Customer Name
            </label>
            <div className={styles.customerField}>
              <input
                id="customer-name"
                value={customerNameDraft}
                onChange={(event) => {
                  setCustomerNameDraft(event.target.value);
                  setCustomerModalError("");
                }}
                className={styles.customerInput}
                placeholder="Enter customer name"
              />
            </div>

            {showCustomerSummary ? (
              <button
                type="button"
                className={`${styles.customerSummaryCard} ${
                  canOpenCustomerHistory ? styles.customerSummaryCardActive : ""
                }`}
                onClick={() => {
                  void openCustomerHistory();
                }}
                disabled={!canOpenCustomerHistory}
              >
                <div className={styles.customerSummaryName}>
                  {customerLookupData?.name ||
                    (customerLookupData?.isNewCustomer ? "New customer" : "Customer details")}
                </div>
                <div className={styles.customerSummaryMeta}>
                  <span>{customerLookupData?.totalBills ?? 0} bills</span>
                  <span>{formatMoney(customerLookupData?.totalAmount ?? 0)} spent</span>
                </div>
              </button>
            ) : (
              <div className={styles.customerHint}>
                Enter a 10-digit phone number to load saved customer details and history.
              </div>
            )}

            {customerModalError ? (
              <div className={styles.customerLookupError}>{customerModalError}</div>
            ) : null}

            <div className={styles.customerDialogActions}>
              {customerConfig.allowSkip ? (
                <button
                  type="button"
                  className={styles.customerSkipButton}
                  onClick={() => {
                    void submitCustomerDetails({ skip: true });
                  }}
                  disabled={isSubmittingOrder}
                >
                  Skip
                </button>
              ) : null}

              <button
                type="button"
                className={styles.customerSubmitButton}
                onClick={() => {
                  void submitCustomerDetails({ skip: false });
                }}
                disabled={isSubmittingOrder}
              >
                {isSubmittingOrder ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCustomerModalOpen && isHistoryModalOpen ? (
        <div className={styles.modalBackdrop} onClick={closeHistoryModal}>
          <div
            className={styles.historyModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-history-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.historyModalHeader}>
              <h3 id="customer-history-title" className={styles.historyModalTitle}>
                Customer History
              </h3>
              <button
                type="button"
                className={styles.customerModalClose}
                onClick={closeHistoryModal}
                aria-label="Close customer history"
              >
                <CloseIcon className={styles.customerModalCloseIcon} />
              </button>
            </div>

            <div className={styles.historySummaryCard}>
              <div className={styles.historySummaryTitle}>
                {historyLookupData?.name || customerNameDraft.trim() || "Customer"}
              </div>
              <div className={styles.historySummaryMeta}>
                <span>{historyLookupData?.totalBills ?? 0} bills</span>
                <span>{formatMoney(historyLookupData?.totalAmount ?? 0)} spent</span>
              </div>
            </div>

            {historyLookupData?.bills.length ? (
              <div className={styles.historyList}>
                {historyLookupData.bills.map((bill) => (
                  <article key={bill.id || bill.invoiceNumber} className={styles.historyRow}>
                    <div className={styles.historyRowTop}>
                      <strong>{bill.invoiceNumber || bill.id || "Previous Bill"}</strong>
                      <span className={styles.historyAmount}>{formatMoney(bill.totalAmount)}</span>
                    </div>
                    <div className={styles.historyMeta}>
                      <span>{formatShortDate(bill.createdAt)}</span>
                      <span>{titleCase(bill.paymentMethod || "cash")}</span>
                      <span>{titleCase(bill.status || "completed")}</span>
                    </div>
                    {bill.tableNumber || bill.section ? (
                      <div className={styles.historyMeta}>
                        <span>{bill.section || "Table"}</span>
                        <span>{bill.tableNumber ? `Table ${bill.tableNumber}` : ""}</span>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.historyEmpty}>
                No previous completed bills were found for this customer yet.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {activeEditingRequestItemId ? (
        <div className={styles.modalBackdrop} onClick={closeRequestEditor}>
          <div
            className={styles.noteModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="special-note-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="special-note-title" className={styles.noteModalTitle}>
              Special Note
            </h2>
            <textarea
              value={requestDraft}
              onChange={(event) => setRequestDraft(event.target.value)}
              className={styles.noteModalInput}
              placeholder="Enter instructions..."
              autoFocus
            />
            <div className={styles.noteModalActions}>
              <button
                type="button"
                className={styles.noteModalButton}
                onClick={closeRequestEditor}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.noteModalButton} ${styles.noteModalButtonPrimary}`}
                onClick={saveRequestEditor}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
