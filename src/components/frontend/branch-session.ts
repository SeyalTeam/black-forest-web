export const SESSION_BRANCH_ID_KEY = "blackforest-order-web-branch-id";
export const SESSION_BRANCH_NAME_KEY = "blackforest-order-web-branch-name";
export const SESSION_UPI_ID_KEY = "blackforest-order-web-upi-id";
export const COOKIE_BRANCH_ID_KEY = "blackforest-order-web-branch-id";
export const COOKIE_BRANCH_NAME_KEY = "blackforest-order-web-branch-name";
export const COOKIE_UPI_ID_KEY = "blackforest-order-web-upi-id";
export const COOKIE_ADMIN_TOKEN_KEY = "blackforest-order-web-admin-token";
export const SESSION_TABLE_NUMBER_KEY = "blackforest-order-web-table-number";
export const SESSION_TABLE_SECTION_KEY = "blackforest-order-web-table-section";
export const SESSION_TABLE_BRANCH_ID_KEY = "blackforest-order-web-table-branch-id";
export const SESSION_ACTIVE_BILL_ID_KEY = "blackforest-order-web-active-bill-id";
export const SESSION_ACTIVE_BILL_BRANCH_ID_KEY =
  "blackforest-order-web-active-bill-branch-id";
export const SESSION_ACTIVE_BILL_TABLE_NUMBER_KEY =
  "blackforest-order-web-active-bill-table-number";
export const SESSION_ACTIVE_BILL_SECTION_KEY =
  "blackforest-order-web-active-bill-section";
export const SESSION_ACTIVE_BILL_CUSTOMER_NAME_KEY =
  "blackforest-order-web-active-bill-customer-name";
export const SESSION_ACTIVE_BILL_CUSTOMER_PHONE_KEY =
  "blackforest-order-web-active-bill-customer-phone";

export const COOKIE_ACTIVE_PAYMENT_METHOD_KEY = "blackforest-order-web-active-payment-method";
export const SESSION_ACTIVE_PAYMENT_METHOD_KEY = "blackforest-order-web-active-payment-method";

export type BranchSession = {
  branchId: string;
  branchName: string;
  upiId: string;
  activePaymentMethod: string;
};

export type TableSession = {
  branchId: string;
  tableNumber: string;
  section: string;
};

export type ActiveBillSession = {
  branchId: string;
  billId: string;
  tableNumber: string;
  section: string;
  customerName: string;
  customerPhone: string;
};

function getStorageItem(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(key)?.trim() || window.localStorage.getItem(key)?.trim() || "";
  } catch {
    return "";
  }
}

function setStorageItem(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
    window.localStorage.setItem(key, value);
  } catch {}
}

function removeStorageItem(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(key);
  } catch {}
}

function writeCookie(name: string, value: string, maxAgeSeconds = 60 * 60 * 24 * 30) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
}

function clearCookie(name: string) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function readBranchSession(): BranchSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const branchId = getStorageItem(SESSION_BRANCH_ID_KEY);
  if (!branchId) {
    return null;
  }

  return {
    branchId,
    branchName: getStorageItem(SESSION_BRANCH_NAME_KEY),
    upiId: getStorageItem(SESSION_UPI_ID_KEY),
    activePaymentMethod: getStorageItem(SESSION_ACTIVE_PAYMENT_METHOD_KEY) || "upi_direct",
  };
}

export function writeBranchSession(branchId: string, branchName: string, upiId: string = "", activePaymentMethod: string = "upi_direct") {
  if (typeof window === "undefined") {
    return;
  }

  setStorageItem(SESSION_BRANCH_ID_KEY, branchId);
  setStorageItem(SESSION_BRANCH_NAME_KEY, branchName);
  setStorageItem(SESSION_UPI_ID_KEY, upiId);
  setStorageItem(SESSION_ACTIVE_PAYMENT_METHOD_KEY, activePaymentMethod);
  writeCookie(COOKIE_BRANCH_ID_KEY, branchId);
  writeCookie(COOKIE_BRANCH_NAME_KEY, branchName);
  writeCookie(COOKIE_UPI_ID_KEY, upiId);
  writeCookie(COOKIE_ACTIVE_PAYMENT_METHOD_KEY, activePaymentMethod);
}

export function clearBranchSession() {
  if (typeof window === "undefined") {
    return;
  }

  removeStorageItem(SESSION_BRANCH_ID_KEY);
  removeStorageItem(SESSION_BRANCH_NAME_KEY);
  removeStorageItem(SESSION_ACTIVE_PAYMENT_METHOD_KEY);
  clearCookie(COOKIE_BRANCH_ID_KEY);
  clearCookie(COOKIE_BRANCH_NAME_KEY);
  clearCookie(COOKIE_ACTIVE_PAYMENT_METHOD_KEY);
  clearTableSession();
}

export function readTableSession(branchId?: string): TableSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const tableNumber = getStorageItem(SESSION_TABLE_NUMBER_KEY);
  const storedBranchId = getStorageItem(SESSION_TABLE_BRANCH_ID_KEY);

  if (!tableNumber || !storedBranchId) {
    return null;
  }

  if (branchId?.trim() && storedBranchId !== branchId.trim()) {
    return null;
  }

  return {
    branchId: storedBranchId,
    tableNumber,
    section: getStorageItem(SESSION_TABLE_SECTION_KEY),
  };
}

export function writeTableSession({
  branchId,
  tableNumber,
  section,
}: {
  branchId: string;
  tableNumber: string;
  section?: string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedTableNumber = tableNumber.trim();
  const normalizedBranchId = branchId.trim();
  const normalizedSection = section?.trim() ?? "";

  if (!normalizedTableNumber || !normalizedBranchId) {
    clearTableSession();
    return;
  }

  setStorageItem(SESSION_TABLE_BRANCH_ID_KEY, normalizedBranchId);
  setStorageItem(SESSION_TABLE_NUMBER_KEY, normalizedTableNumber);
  if (normalizedSection) {
    setStorageItem(SESSION_TABLE_SECTION_KEY, normalizedSection);
  } else {
    removeStorageItem(SESSION_TABLE_SECTION_KEY);
  }
}

export function clearTableSession() {
  if (typeof window === "undefined") {
    return;
  }

  removeStorageItem(SESSION_TABLE_BRANCH_ID_KEY);
  removeStorageItem(SESSION_TABLE_NUMBER_KEY);
  removeStorageItem(SESSION_TABLE_SECTION_KEY);
}

export function readActiveBillSession(branchId?: string): ActiveBillSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const billId = getStorageItem(SESSION_ACTIVE_BILL_ID_KEY);
  const storedBranchId = getStorageItem(SESSION_ACTIVE_BILL_BRANCH_ID_KEY);

  if (!billId || !storedBranchId) {
    return null;
  }

  if (branchId?.trim() && storedBranchId !== branchId.trim()) {
    return null;
  }

  return {
    branchId: storedBranchId,
    billId,
    tableNumber: getStorageItem(SESSION_ACTIVE_BILL_TABLE_NUMBER_KEY),
    section: getStorageItem(SESSION_ACTIVE_BILL_SECTION_KEY),
    customerName: getStorageItem(SESSION_ACTIVE_BILL_CUSTOMER_NAME_KEY),
    customerPhone: getStorageItem(SESSION_ACTIVE_BILL_CUSTOMER_PHONE_KEY),
  };
}

export function writeActiveBillSession({
  branchId,
  billId,
  tableNumber,
  section,
  customerName,
  customerPhone,
}: {
  branchId: string;
  billId: string;
  tableNumber?: string;
  section?: string;
  customerName?: string;
  customerPhone?: string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedBranchId = branchId.trim();
  const normalizedBillId = billId.trim();
  if (!normalizedBranchId || !normalizedBillId) {
    clearActiveBillSession();
    return;
  }

  setStorageItem(SESSION_ACTIVE_BILL_BRANCH_ID_KEY, normalizedBranchId);
  setStorageItem(SESSION_ACTIVE_BILL_ID_KEY, normalizedBillId);

  const normalizedTableNumber = tableNumber?.trim() ?? "";
  const normalizedSection = section?.trim() ?? "";
  if (normalizedTableNumber) {
    setStorageItem(SESSION_ACTIVE_BILL_TABLE_NUMBER_KEY, normalizedTableNumber);
  } else {
    removeStorageItem(SESSION_ACTIVE_BILL_TABLE_NUMBER_KEY);
  }

  if (normalizedSection) {
    setStorageItem(SESSION_ACTIVE_BILL_SECTION_KEY, normalizedSection);
  } else {
    removeStorageItem(SESSION_ACTIVE_BILL_SECTION_KEY);
  }

  const normalizedCustomerName = customerName?.trim() ?? "";
  const normalizedCustomerPhone = customerPhone?.trim() ?? "";
  if (normalizedCustomerName) {
    setStorageItem(SESSION_ACTIVE_BILL_CUSTOMER_NAME_KEY, normalizedCustomerName);
  } else {
    removeStorageItem(SESSION_ACTIVE_BILL_CUSTOMER_NAME_KEY);
  }

  if (normalizedCustomerPhone) {
    setStorageItem(SESSION_ACTIVE_BILL_CUSTOMER_PHONE_KEY, normalizedCustomerPhone);
  } else {
    removeStorageItem(SESSION_ACTIVE_BILL_CUSTOMER_PHONE_KEY);
  }
}

export function clearActiveBillSession() {
  if (typeof window === "undefined") {
    return;
  }

  removeStorageItem(SESSION_ACTIVE_BILL_BRANCH_ID_KEY);
  removeStorageItem(SESSION_ACTIVE_BILL_ID_KEY);
  removeStorageItem(SESSION_ACTIVE_BILL_TABLE_NUMBER_KEY);
  removeStorageItem(SESSION_ACTIVE_BILL_SECTION_KEY);
  removeStorageItem(SESSION_ACTIVE_BILL_CUSTOMER_NAME_KEY);
  removeStorageItem(SESSION_ACTIVE_BILL_CUSTOMER_PHONE_KEY);
}
