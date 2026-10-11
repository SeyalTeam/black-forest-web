"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  clearActiveBillSession,
  readActiveBillSession,
  readBranchSession,
  readTableSession,
  writeActiveBillSession,
} from "@/components/frontend/branch-session";
import { BottomNav } from "@/components/frontend/bottom-nav";
import {
  BackIcon,
  BellIcon,
  CardPaymentIcon,
  CashIcon,
  CloseIcon,
  HistoryIcon,
  NoteAddIcon,
  PinIcon,
  TableIcon,
  UpiIcon,
  VegIcon,
} from "@/components/frontend/menu-icons";
import { useOrder } from "@/components/frontend/order-provider";
import type { BillSummaryData, BillSummaryItem } from "@/lib/order-types";
import { BILLING_DISABLED_MESSAGE, BILLING_ENABLED } from "@/lib/billing-config";
import { readSessionCache, writeSessionCache } from "@/lib/session-cache";
import { apiUrl } from "@/lib/api";
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

type CustomerLookupLiteResult = {
  exists: boolean;
  customerName: string;
  phoneNumber: string;
  skipped: boolean;
};

const defaultCustomerConfig: CustomerDetailsConfig = {
  showCustomerDetails: true,
  allowSkip: true,
  autoSubmit: true,
  showHistory: true,
};

const BILL_CACHE_KEY_PREFIX = "blackforest-order-web-bill:";
const PREPARATION_TIMER_START_DELAY_SECONDS = 60;
const PREPARATION_TIMER_INTERVAL_MS = 1_000;

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function toMap(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asList(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function toTrimmedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function safeJsonFetch<T = Record<string, unknown>>(
  url: string,
  options?: RequestInit,
): Promise<{ ok: boolean; status: number; payload: T | null }> {
  try {
    const finalUrl = url.startsWith("http") ? url : apiUrl(url);
    const response = await fetch(finalUrl, options);
    const text = await response.text();
    let payload: T | null = null;
    if (text) {
      try {
        payload = JSON.parse(text) as T;
      } catch {
        payload = null;
      }
    }
    return { ok: response.ok, status: response.status, payload };
  } catch {
    return { ok: false, status: 0, payload: null };
  }
}

function normalizeLookupBill(raw: unknown) {
  const bill = toMap(raw);
  if (!bill) {
    return null;
  }

  const tableDetails = toMap(bill.tableDetails);
  const customerDetails = toMap(bill.customerDetails) ?? toMap(bill.customer);
  return {
    id:
      toTrimmedText(bill.id) ||
      toTrimmedText(bill._id) ||
      toTrimmedText(bill.invoiceNumber),
    invoiceNumber:
      toTrimmedText(bill.invoiceNumber) ||
      toTrimmedText(bill.billNumber) ||
      toTrimmedText(bill.id),
    status: toTrimmedText(bill.status).toLowerCase() || "completed",
    paymentMethod: toTrimmedText(bill.paymentMethod ?? bill.paymentType).toLowerCase(),
    totalAmount: toNumber(
      bill.totalAmount ?? bill.grossAmount ?? bill.finalAmount ?? bill.subtotal ?? bill.amount,
    ),
    createdAt: toTrimmedText(bill.createdAt),
    tableNumber: toTrimmedText(tableDetails?.tableNumber ?? bill.tableNumber),
    section: toTrimmedText(tableDetails?.section ?? bill.section),
    customerName: toTrimmedText(customerDetails?.name ?? bill.customerName),
  } satisfies CustomerLookupBill;
}

function normalizeCustomerLookupPayload(payload: unknown, fallbackPhone: string, limit: number) {
  const data = toMap(payload) ?? {};
  const customer = toMap(data.customer);
  const billingSummary = toMap(data.billingSummary);
  const exists = data.exists === true;
  const isNewCustomer =
    typeof data.isNewCustomer === "boolean" ? data.isNewCustomer : !exists;

  const bills = asList(data.recentBills ?? data.bills)
    .map((entry) => normalizeLookupBill(entry))
    .filter((entry): entry is CustomerLookupBill => Boolean(entry))
    .slice(0, limit);

  const totalBills = Math.max(
    0,
    Math.trunc(
      toNumber(
        billingSummary?.totalBills ??
          billingSummary?.billCount ??
          data.totalBills ??
          data.billCount,
      ),
    ),
  );
  const parsedTotalAmount = toNumber(
    billingSummary?.totalAmount ??
      billingSummary?.amount ??
      data.totalAmount ??
      data.totalSpent,
  );
  const computedAmount = bills.reduce((sum, bill) => sum + toNumber(bill.totalAmount), 0);
  const totalAmount = parsedTotalAmount > 0 ? parsedTotalAmount : computedAmount;

  return {
    name: exists
      ? toTrimmedText(customer?.name ?? data.customerName ?? data.name)
      : "",
    phoneNumber: toTrimmedText(customer?.phoneNumber ?? data.phoneNumber) || fallbackPhone,
    totalBills: isNewCustomer ? 0 : totalBills || bills.length,
    totalAmount: isNewCustomer ? 0 : Number(totalAmount.toFixed(2)),
    isNewCustomer,
    bills,
  } satisfies CustomerLookupResult;
}

function normalizeCustomerLookupLitePayload(payload: unknown, fallbackPhone: string) {
  const data = toMap(payload) ?? {};
  const docs = asList(data.docs);
  const firstDoc = toMap(docs[0]);
  const totalDocs = Math.max(0, Math.trunc(toNumber(data.totalDocs)));
  const exists = totalDocs > 0 && Boolean(firstDoc);

  return {
    exists,
    customerName: exists ? toTrimmedText(firstDoc?.name) : "",
    phoneNumber: toTrimmedText(firstDoc?.phoneNumber ?? data.phoneNumber) || fallbackPhone,
    skipped: data.skipped === true,
  } satisfies CustomerLookupLiteResult;
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

function normalizeItemStatus(value: string) {
  return value.trim().toLowerCase();
}

function isPreparationTimerStoppedStatus(status: string) {
  const normalized = normalizeItemStatus(status);
  return (
    normalized === "prepared" ||
    normalized === "delivered" ||
    normalized === "completed" ||
    normalized === "cancelled" ||
    normalized === "canceled"
  );
}

function canShowPreparationTimer(status: string) {
  const normalized = normalizeItemStatus(status);
  return (
    normalized === "pending" ||
    normalized === "ordered" ||
    normalized === "confirmed" ||
    normalized === "prepared"
  );
}

function formatDurationClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function parseDateOrClockTime(value: unknown, referenceDateText: string) {
  const input = typeof value === "string" ? value.trim() : "";
  if (input) {
    const directDate = new Date(input);
    if (!Number.isNaN(directDate.getTime())) {
      return directDate.getTime();
    }
  }

  const refText = typeof referenceDateText === "string" ? referenceDateText.trim() : "";
  const refDate = refText ? new Date(refText) : new Date();
  const baseTimeMs = !Number.isNaN(refDate.getTime()) ? refDate.getTime() : Date.now();

  if (!input) {
    return baseTimeMs;
  }

  const timeMatch = input.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!timeMatch) {
    return baseTimeMs;
  }

  const hours = Number.parseInt(timeMatch[1], 10);
  const minutes = Number.parseInt(timeMatch[2], 10);
  const seconds = Number.parseInt(timeMatch[3] ?? "0", 10);

  const baseInIst = new Date(baseTimeMs);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(baseInIst);

  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  const targetIso = `${year}-${month}-${day}T${hh}:${mm}:${ss}+05:30`;
  const targetDate = new Date(targetIso);
  if (Number.isNaN(targetDate.getTime())) {
    return baseTimeMs;
  }

  let targetTimeMs = targetDate.getTime();
  const diff = targetTimeMs - baseTimeMs;
  if (diff > 12 * 3600 * 1000) {
    targetTimeMs -= 24 * 3600 * 1000;
  } else if (diff < -12 * 3600 * 1000) {
    targetTimeMs += 24 * 3600 * 1000;
  }

  return targetTimeMs;
}

function resolveOrderedTimestampMs(item: BillSummaryItem, billCreatedAt: string) {
  const candidates = [item.orderedAt, billCreatedAt];
  for (const candidate of candidates) {
    const timestamp = parseDateOrClockTime(candidate, billCreatedAt);
    if (timestamp !== null) {
      return timestamp;
    }
  }

  return null;
}

function resolvePreparationStartTimestampMs(
  item: BillSummaryItem,
  billCreatedAt: string,
) {
  if (item.preparationTimeSource === "billing-item") {
    const preparationUpdatedTimestamp = parseDateOrClockTime(
      item.preparationTimeUpdatedAt,
      billCreatedAt,
    );
    if (preparationUpdatedTimestamp !== null) {
      return preparationUpdatedTimestamp;
    }
  }

  return resolveOrderedTimestampMs(item, billCreatedAt);
}

function computePreparationRemainingSeconds(
  item: BillSummaryItem,
  billCreatedAt: string,
  nowMs: number,
) {
  const prepMinutes =
    typeof item.preparationTime === "number" && item.preparationTime > 0
      ? item.preparationTime
      : 15;

  const totalPreparationSeconds = Math.round(prepMinutes * 60);
  const preparationStartTimestamp =
    resolvePreparationStartTimestampMs(item, billCreatedAt) ??
    parseDateOrClockTime(billCreatedAt, billCreatedAt) ??
    nowMs;

  const elapsedSeconds = Math.max(
    0,
    Math.floor((nowMs - preparationStartTimestamp) / 1000),
  );
  return Math.max(0, totalPreparationSeconds - elapsedSeconds);
}

function formatBillBlockingItems(items: BillSummaryData["items"]) {
  if (items.length === 0) {
    return "";
  }

  const preview = items
    .slice(0, 2)
    .map((item) => `${item.name} (${titleCase(item.status)})`);

  if (items.length === 1) {
    return preview[0];
  }

  if (items.length === 2) {
    return preview.join(" and ");
  }

  const remainingCount = items.length - 2;
  return `${preview.join(", ")} and ${remainingCount} more item${remainingCount === 1 ? "" : "s"}`;
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
  const [branchUpiId, setBranchUpiId] = useState("");
  const [activePaymentMethod, setActivePaymentMethod] = useState("upi_direct");
  const [sharedTableNumber, setSharedTableNumber] = useState("");
  const [isQrTableLocked, setIsQrTableLocked] = useState(false);
  const [preferredSection, setPreferredSection] = useState("");
  const [previousBillData, setPreviousBillData] = useState<BillSummaryData | null>(null);
  const [customerConfig, setCustomerConfig] =
    useState<CustomerDetailsConfig>(defaultCustomerConfig);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [hasSubmittedCustomerDetails, setHasSubmittedCustomerDetails] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerPhoneDraft, setCustomerPhoneDraft] = useState("");
  const [customerNameDraft, setCustomerNameDraft] = useState("");
  const [historyLookupData, setHistoryLookupData] = useState<CustomerLookupResult | null>(null);
  const [isCustomerLookupLoading, setIsCustomerLookupLoading] = useState(false);
  const [isHistoryLookupLoading, setIsHistoryLookupLoading] = useState(false);
  const [customerLookupError, setCustomerLookupError] = useState("");
  const [customerModalError, setCustomerModalError] = useState("");
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [isSubmittingBill, setIsSubmittingBill] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("cash");
  const [upiBankTransactionId, setUpiBankTransactionId] = useState("");
  const [billError, setBillError] = useState("");
  const [showBillDisabledReason, setShowBillDisabledReason] = useState(false);
  const [orderMessage, setOrderMessage] = useState("");
  const [orderError, setOrderError] = useState("");
  const [preparationClockMs, setPreparationClockMs] = useState(() => Date.now());
  const [frozenPreparationSecondsByItem, setFrozenPreparationSecondsByItem] = useState<
    Record<string, number>
  >({});
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
      setBranchUpiId(session.upiId || "");
      setActivePaymentMethod(session.activePaymentMethod || "upi_direct");
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
          apiUrl(`/api/customer-details-config?branchId=${encodeURIComponent(branchId)}`),
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
    if (activeBill?.tableNumber) {
      setSharedTableNumber((current) => current.trim() || activeBill.tableNumber);
    }
    if (activeBill?.section) {
      setPreferredSection((current) => current.trim() || activeBill.section);
    }
    if (activeBill?.customerName) {
      setCustomerName((current) => current.trim() || activeBill.customerName);
    }
    if (activeBill?.customerPhone) {
      setCustomerPhone((current) => current.trim() || activeBill.customerPhone);
    }

    let isDisposed = false;
    const targetBillId = activeBill?.billId || "";
    const cacheKey = targetBillId ? `${BILL_CACHE_KEY_PREFIX}${targetBillId}` : null;
    const cached = cacheKey ? readSessionCache<BillSummaryData>(cacheKey) : null;
    if (cached) {
      const isCachedInactive = ["completed", "settled", "cancelled"].includes(
        cached.status?.toLowerCase(),
      );
      if (isCachedInactive) {
        clearActiveBillSession();
        if (cached.billId) {
          window.sessionStorage.removeItem(`${BILL_CACHE_KEY_PREFIX}${cached.billId}`);
        }
        setPreviousBillData(null);
      } else {
        setPreviousBillData(cached);
      }
    }

    const loadPreviousBill = async () => {
      try {
        const queryParams = new URLSearchParams();
        const currentActiveBill = readActiveBillSession(branchId);
        const activeBillTableMatches =
          !currentActiveBill?.tableNumber ||
          !sharedTableNumber.trim() ||
          currentActiveBill.tableNumber.trim().toLowerCase() === sharedTableNumber.trim().toLowerCase() ||
          currentActiveBill.tableNumber.trim().toLowerCase().startsWith(`${sharedTableNumber.trim().toLowerCase()}-`) ||
          sharedTableNumber.trim().toLowerCase().startsWith(`${currentActiveBill.tableNumber.trim().toLowerCase()}-`);
        const activeBillSectionMatches =
          !currentActiveBill?.section ||
          !preferredSection.trim() ||
          currentActiveBill.section.trim().toLowerCase() === preferredSection.trim().toLowerCase() ||
          currentActiveBill.section.trim().toLowerCase() === "shared tables" ||
          preferredSection.trim().toLowerCase() === "shared tables";

        const billIdToUse =
          activeBillTableMatches && activeBillSectionMatches ? currentActiveBill?.billId || "" : "";

        if (billIdToUse) {
          queryParams.set("billId", billIdToUse);
          queryParams.set("branchId", branchId);
        } else if (customerPhone.trim() || currentActiveBill?.customerPhone) {
          queryParams.set("branchId", branchId);
          queryParams.set("customerPhone", customerPhone.trim() || currentActiveBill?.customerPhone || "");
        } else {
          if (!cached && !isDisposed) {
            setPreviousBillData(null);
          }
          return;
        }

        if (!queryParams.has("billId") && !queryParams.has("tableNumber") && !queryParams.has("customerPhone")) {
          if (!cached && !isDisposed) {
            setPreviousBillData(null);
          }
          return;
        }

        const response = await fetch(apiUrl(`/api/bill-summary?${queryParams.toString()}`), { cache: "no-store" });
        if (!response.ok) {
          if (!isDisposed) {
            if (billIdToUse) {
              clearActiveBillSession();
              if (targetBillId) {
                window.sessionStorage.removeItem(`${BILL_CACHE_KEY_PREFIX}${targetBillId}`);
              }
            }
            setPreviousBillData(null);
          }
          return;
        }

        const payload = (await response.json()) as BillSummaryData;
        if (isDisposed) {
          return;
        }

        const isInactive = ["completed", "settled", "cancelled"].includes(
          payload.status?.toLowerCase(),
        );

        if (isInactive) {
          clearActiveBillSession();
          if (payload.billId) {
            window.sessionStorage.removeItem(`${BILL_CACHE_KEY_PREFIX}${payload.billId}`);
          }
          setPreviousBillData(null);

          if (billIdToUse) {
            const tableQueryParams = new URLSearchParams();
            tableQueryParams.set("branchId", branchId);
            const currentTable = sharedTableNumber.trim();
            if (currentTable) tableQueryParams.set("tableNumber", currentTable);
            const currentSection = preferredSection.trim();
            if (currentSection) tableQueryParams.set("section", currentSection);
            if (customerPhone.trim()) tableQueryParams.set("customerPhone", customerPhone.trim());

            if (tableQueryParams.has("tableNumber") || tableQueryParams.has("customerPhone")) {
              const retryRes = await fetch(apiUrl(`/api/bill-summary?${tableQueryParams.toString()}`), {
                cache: "no-store",
              });
              if (retryRes.ok && !isDisposed) {
                const retryPayload = (await retryRes.json()) as BillSummaryData;
                const isRetryInactive = ["completed", "settled", "cancelled"].includes(
                  retryPayload.status?.toLowerCase(),
                );
                if (!isRetryInactive && retryPayload.billId) {
                  setPreviousBillData(retryPayload);
                  writeSessionCache(`${BILL_CACHE_KEY_PREFIX}${retryPayload.billId}`, retryPayload);
                  writeActiveBillSession({
                    branchId,
                    billId: retryPayload.billId,
                    tableNumber: retryPayload.tableNumber || sharedTableNumber,
                    section: retryPayload.section || preferredSection,
                    customerName: customerName.trim(),
                    customerPhone: customerPhone.trim(),
                  });
                }
              }
            }
          }
          return;
        }

        setPreviousBillData(payload);
        if (payload.billId) {
          writeSessionCache(`${BILL_CACHE_KEY_PREFIX}${payload.billId}`, payload);
          writeActiveBillSession({
            branchId,
            billId: payload.billId,
            tableNumber: payload.tableNumber || sharedTableNumber,
            section: payload.section || preferredSection,
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
          });
        }

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
    const refreshTimerId = window.setInterval(() => {
      void loadPreviousBill();
    }, 5_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadPreviousBill();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isDisposed = true;
      window.clearInterval(refreshTimerId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [branchId, sharedTableNumber, preferredSection, customerPhone]);

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

  const prevTableBase = previousBillData?.tableNumber
    ? previousBillData.tableNumber.split("-")[0].trim().toLowerCase()
    : "";
  const currentTableBase = trimmedTableNumber
    ? trimmedTableNumber.split("-")[0].trim().toLowerCase()
    : "";

  const prevSection = previousBillData?.section
    ? previousBillData.section.trim().toLowerCase()
    : "";
  const currentSection = preferredSection.trim().toLowerCase();
  const isSectionMatch =
    !prevSection ||
    !currentSection ||
    prevSection === currentSection ||
    prevSection === "shared tables" ||
    currentSection === "shared tables";

  const isTableMatch = Boolean(
    previousBillData &&
    isSectionMatch &&
    (!trimmedTableNumber ||
      !previousBillData.tableNumber ||
      prevTableBase === currentTableBase ||
      previousBillData.tableNumber.toLowerCase() === trimmedTableNumber.toLowerCase() ||
      previousBillData.tableNumber.toLowerCase().startsWith(`${trimmedTableNumber.toLowerCase()}-`) ||
      trimmedTableNumber.toLowerCase().startsWith(`${previousBillData.tableNumber.toLowerCase()}-`))
  );

  const matchingPreviousBill =
    previousBillData && isTableMatch ? previousBillData : null;
  const hasCurrentItems = cartItems.length > 0;
  const hasPreviousItems = Boolean(matchingPreviousBill?.items.length);
  const showBillFooter = !hasCurrentItems && hasPreviousItems;
  const previousBillItems = matchingPreviousBill?.items ?? [];
  const undeliveredPreviousItems = previousBillItems.filter(
    (item) => normalizeItemStatus(item.status) !== "delivered",
  );
  const canCompleteBill =
    BILLING_ENABLED &&
    Boolean(matchingPreviousBill?.billId) &&
    previousBillItems.length > 0 &&
    undeliveredPreviousItems.length === 0;
  const billDisabledReason = !BILLING_ENABLED
    ? BILLING_DISABLED_MESSAGE
    : !matchingPreviousBill?.billId
      ? "Bill is not ready yet."
      : undeliveredPreviousItems.length > 0
        ? `Bill will be enabled only after all items are delivered. Waiting on ${formatBillBlockingItems(
            undeliveredPreviousItems,
          )}.`
        : "";

  const upiIntentUrl = useMemo(() => {
    if (!branchUpiId || !matchingPreviousBill) return "";
    const amount = (matchingPreviousBill.totalAmount ?? 0).toFixed(2);
    const trId = matchingPreviousBill.billId || `TR${Date.now()}`;
    return `upi://pay?pa=${branchUpiId}&pn=${encodeURIComponent(branchName)}&mc=5812&tr=${trId}&am=${amount}&cu=INR`;
  }, [branchUpiId, branchName, matchingPreviousBill]);

  const normalizedCustomerPhoneDraft = normalizePhone(customerPhoneDraft);
  const normalizedCustomerPhone = normalizePhone(customerPhone);
  const isGenericCustomerName =
    !customerName.trim() ||
    customerName.trim().toLowerCase() === "customer" ||
    customerName.trim().toLowerCase() === "cm";
  const hasExistingCustomerDetails =
    hasSubmittedCustomerDetails ||
    normalizedCustomerPhone.length >= 10 ||
    (!isGenericCustomerName && customerName.trim().length > 0) ||
    Boolean(matchingPreviousBill?.billId);
  const headerDisplayName =
    customerName.trim() && customerName.trim().toLowerCase() !== "cm"
      ? customerName.trim()
      : "Customer";
  const canOpenCustomerHistory =
    customerConfig.showHistory &&
    normalizedCustomerPhoneDraft.length >= 10 &&
    !isHistoryLookupLoading;

  useEffect(() => {
    setPreparationClockMs(Date.now());
  }, [matchingPreviousBill?.billId, matchingPreviousBill?.items]);

  useEffect(() => {
    const hasRunningPreparationTimers = (matchingPreviousBill?.items ?? []).some(
      (item) =>
        canShowPreparationTimer(item.status) &&
        item.preparationTime &&
        item.preparationTime > 0 &&
        !isPreparationTimerStoppedStatus(item.status),
    );
    if (!hasRunningPreparationTimers) {
      return;
    }

    const timerId = window.setInterval(() => {
      setPreparationClockMs(Date.now());
    }, PREPARATION_TIMER_INTERVAL_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [matchingPreviousBill?.items]);

  useEffect(() => {
    if (!matchingPreviousBill) {
      setFrozenPreparationSecondsByItem({});
      return;
    }

    const nowMs = Date.now();
    setFrozenPreparationSecondsByItem((current) => {
      const next: Record<string, number> = {};

      for (const item of matchingPreviousBill.items) {
        if (!canShowPreparationTimer(item.status)) {
          continue;
        }
        if (!item.preparationTime || item.preparationTime <= 0) {
          continue;
        }
        if (!isPreparationTimerStoppedStatus(item.status)) {
          continue;
        }

        const existing = current[item.id];
        if (existing !== undefined) {
          next[item.id] = existing;
          continue;
        }

        const remainingSeconds = computePreparationRemainingSeconds(
          item,
          matchingPreviousBill.createdAt,
          parseDateOrClockTime(item.preparedAt, matchingPreviousBill.createdAt) ?? nowMs,
        );
        if (remainingSeconds !== null) {
          next[item.id] = remainingSeconds;
        }
      }

      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(next);
      const isSame =
        currentKeys.length === nextKeys.length &&
        nextKeys.every((key) => current[key] === next[key]);

      return isSame ? current : next;
    });
  }, [matchingPreviousBill?.billId, matchingPreviousBill?.createdAt, matchingPreviousBill?.items]);

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

      const url = `/api/billing/customer-lookup?branchId=${encodeURIComponent(
        branchId,
      )}&phoneNumber=${encodeURIComponent(normalizedPhone)}&limit=${limit}`;

      let res = await safeJsonFetch<Record<string, unknown> & { message?: string }>(url, { cache: "no-store" });
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 400));
        res = await safeJsonFetch<Record<string, unknown> & { message?: string }>(url, { cache: "no-store" });
      }

      if (!res.ok || !res.payload) {
        const errMsg = res.payload && typeof res.payload.message === "string" ? res.payload.message : "";
        throw new Error(errMsg || "Unable to fetch customer details");
      }

      return normalizeCustomerLookupPayload(res.payload, normalizedPhone, limit);
    },
    [branchId],
  );

  const fetchCustomerLookupLite = useCallback(async (phone: string) => {
    const normalizedPhone = normalizePhone(phone);
    if (!branchId || normalizedPhone.length < 10) {
      return null;
    }

    const phone10 = normalizedPhone.slice(-10);
    const phoneWithPrefix = `91${phone10}`;
    const query = new URLSearchParams({
      limit: "1",
      depth: "0",
      branchId,
    });
    query.set("where[or][0][phoneNumber][equals]", phone10);
    query.set("where[or][1][phoneNumber][equals]", phoneWithPrefix);

    const url = `/api/billing-customers?${query.toString()}`;
    let res = await safeJsonFetch<Record<string, unknown> & { message?: string }>(url, { cache: "no-store" });
    if (!res.ok) {
      await new Promise((r) => setTimeout(r, 400));
      res = await safeJsonFetch<Record<string, unknown> & { message?: string }>(url, { cache: "no-store" });
    }

    if (!res.ok || !res.payload) {
      const errMsg = res.payload && typeof res.payload.message === "string" ? res.payload.message : "";
      throw new Error(errMsg || "Unable to fetch customer details");
    }

    return normalizeCustomerLookupLitePayload(res.payload, phone10);
  }, [branchId]);

  const openCustomerModal = () => {
    setCustomerPhoneDraft(customerPhone);
    setCustomerNameDraft(customerName);
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
      const response = await fetch(apiUrl("/api/place-order"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          billId: matchingPreviousBill?.billId,
          branchId,
          branchName,
          tableNumber: trimmedTableNumber,
          preferredSection,
          tableLocked: isQrTableLocked,
          customerDetails: {
            name: customerDetails?.name?.trim() ?? "",
            phoneNumber: customerDetails?.phoneNumber?.trim() ?? "",
          },
          items: cartItems.map((item) => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            category: item.category,
            categoryId: item.categoryId,
            department: item.category,
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
    setHasSubmittedCustomerDetails(true);
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
      const response = await fetch(apiUrl("/api/complete-bill"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          billId: matchingPreviousBill.billId,
          paymentMethod: selectedPaymentMethod,
          branchId,
          upiBankTransactionId: selectedPaymentMethod === "upi" ? upiBankTransactionId : undefined,
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
          const payload = await fetchCustomerLookupLite(normalizedPhone);
          if (isDisposed || normalizePhone(customerPhoneDraft) !== normalizedPhone) {
            return;
          }
          if (payload?.exists && payload.customerName) {
            setCustomerNameDraft((current) => current.trim() || payload.customerName);
          }
        } catch (error) {
          if (isDisposed || normalizePhone(customerPhoneDraft) !== normalizedPhone) {
            return;
          }
          const rawMsg = error instanceof Error ? error.message : "";
          const isRawSyntaxError =
            rawMsg.includes("Unexpected token") ||
            rawMsg.includes("is not valid JSON") ||
            rawMsg.includes("<!DOCTYPE");
          setCustomerLookupError(
            isRawSyntaxError
              ? "Unable to fetch customer details. Please try again."
              : rawMsg || "Unable to fetch customer details",
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
  }, [customerPhoneDraft, fetchCustomerLookupLite, isCustomerModalOpen]);

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

  useEffect(() => {
    if (canCompleteBill || !showBillFooter) {
      setShowBillDisabledReason(false);
    }
  }, [canCompleteBill, showBillFooter]);

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
            <>
              {tableChipLabel ? (
                <div className={styles.chip}>
                  <TableIcon className={styles.chipIconSvg} />
                  {tableChipLabel}
                </div>
              ) : null}
              {sectionChipLabel ? (
                <div className={styles.chip}>
                  <PinIcon className={styles.chipIconSvg} />
                  {sectionChipLabel}
                </div>
              ) : null}
            </>
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
                  cartItems.map((item) => {
                    const itemNote = cookingRequests[item.id]?.trim() ?? "";
                    const hasSavedNote = itemNote.length > 0;

                    return (
                      <div key={item.id} className={styles.itemGroup}>
                        <article className={styles.itemRow}>
                          <div className={`${styles.itemLead} ${styles.currentItemLead}`}>
                            <VegIcon isVeg={item.isVeg} />
                            <div className={styles.itemMeta}>
                              <h3>{item.name}</h3>
                              {hasSavedNote ? (
                                <div className={styles.itemSavedNote}>{itemNote}</div>
                              ) : null}
                              <button
                                type="button"
                                className={styles.requestButton}
                                onClick={() => {
                                  setEditingRequestItemId(item.id);
                                  setRequestDraft(cookingRequests[item.id] ?? "");
                                }}
                                aria-label="Cooking requests"
                              >
                                <NoteAddIcon className={styles.requestButtonIcon} />
                                <span>Cooking requests</span>
                              </button>
                            </div>
                          </div>

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
                            <div className={styles.itemPrice}>
                              ₹{item.price * item.quantity}
                              {item.gst && item.gst !== "0" ? <span style={{ fontSize: "0.75em", color: "#6b7280", marginLeft: "2px" }}>+{item.gst}% GST</span> : null}
                            </div>
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
                {matchingPreviousBill!.items.map((item) => {
                  const normalizedStatus = normalizeItemStatus(item.status);
                  const isStopped = isPreparationTimerStoppedStatus(normalizedStatus);
                  const liveRemainingSeconds = computePreparationRemainingSeconds(
                    item,
                    matchingPreviousBill!.createdAt,
                    preparationClockMs,
                  );
                  const frozenSeconds = frozenPreparationSecondsByItem[item.id];
                  const preparationSeconds =
                    isStopped && frozenSeconds !== undefined
                      ? frozenSeconds
                      : liveRemainingSeconds;
                  const showPreparationTimer =
                    canShowPreparationTimer(item.status) &&
                    preparationSeconds !== null;

                  return (
                    <article key={item.id} className={styles.previousItemRow}>
                      <div className={styles.itemLead}>
                        <VegIcon isVeg={item.isVeg} />
                        <div className={styles.previousItemMeta}>
                          <h3>{item.name}</h3>
                          <div className={styles.statusMetaRow}>
                            <div className={styles.statusPill}>{titleCase(item.status)}</div>
                            {showPreparationTimer ? (
                              <div className={styles.preparationTimer}>
                                <span className={styles.preparationTimerTitle}>
                                  Preparation Time
                                </span>
                                <span className={styles.preparationTimerValue}>
                                  {formatDurationClock(preparationSeconds ?? 0)}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className={styles.previousItemActions}>
                        <div className={styles.readonlyQtyBox}>{item.quantity}</div>
                        <div className={styles.itemPrice}>
                          ₹{item.subtotal}
                          {item.gst && item.gst !== "0" ? <span style={{ fontSize: "0.75em", color: "#6b7280", marginLeft: "2px" }}>+{item.gst}% GST</span> : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
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
                        if (isSubmittingBill || !BILLING_ENABLED) {
                          return;
                        }
                        setSelectedPaymentMethod(option.id);
                        setBillError("");
                      }}
                      disabled={isSubmittingBill || !BILLING_ENABLED}
                    >
                      <Icon className={styles.paymentIcon} />
                      {option.label}
                    </button>
                  );
                })}
              </div>
              
              {/* UPI input moved to modal */}
              
              <button
                type="button"
                className={`${styles.billButton} ${!canCompleteBill ? styles.billButtonDisabled : ""}`}
                onClick={() => {
                  if (!canCompleteBill) {
                    setShowBillDisabledReason(true);
                    setBillError("");
                    return;
                  }

                  setShowBillDisabledReason(false);

                  if (selectedPaymentMethod === "upi") {
                    if (activePaymentMethod === "disabled") {
                      // Waiter handles it
                      void completeBill();
                    } else if (activePaymentMethod === "hdfc_smartgateway") {
                      // Call the new create-payment-session endpoint
                      setIsSubmittingBill(true);
                      fetch(apiUrl("/api/create-payment-session"), {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          amount: matchingPreviousBill?.totalAmount ?? 0,
                          billId: matchingPreviousBill?.billId,
                          customerId: "", 
                          customerName: customerName,
                          customerPhone: customerPhone,
                        }),
                      })
                        .then((res) => res.json())
                        .then((data) => {
                          if (data.paymentUrl) {
                            window.location.href = data.paymentUrl;
                            setTimeout(() => {
                              void completeBill();
                            }, 1000);
                          } else {
                            setIsSubmittingBill(false);
                            setBillError(data.message || "Failed to create payment session.");
                          }
                        })
                        .catch(() => {
                          setIsSubmittingBill(false);
                          setBillError("Network error. Please try again.");
                        });
                    } else {
                      // upi_direct
                      if (upiIntentUrl) {
                        window.location.href = upiIntentUrl;
                        setTimeout(() => {
                          void completeBill();
                        }, 1000);
                      } else {
                        setBillError("UPI is not configured for this branch.");
                      }
                    }
                  } else {
                    void completeBill();
                  }
                }}
                disabled={isSubmittingBill}
                aria-disabled={isSubmittingBill || !canCompleteBill}
              >
                {isSubmittingBill ? "BILLING..." : "BILL"}
              </button>

              {showBillDisabledReason && billDisabledReason ? (
                <div className={styles.billHint}>{billDisabledReason}</div>
              ) : null}
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
              {false ? (
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

            {normalizedCustomerPhoneDraft.length < 10 ? (
              <div className={styles.customerHint}>
                Enter a 10-digit phone number to load saved customer details and history.
              </div>
            ) : null}

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
