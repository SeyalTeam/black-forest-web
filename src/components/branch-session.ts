export const SESSION_BRANCH_ID_KEY = "blackforest-order-web-branch-id";
export const SESSION_BRANCH_NAME_KEY = "blackforest-order-web-branch-name";
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

export type BranchSession = {
  branchId: string;
  branchName: string;
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
};

export function readBranchSession(): BranchSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const branchId = window.sessionStorage.getItem(SESSION_BRANCH_ID_KEY)?.trim() ?? "";
  if (!branchId) {
    return null;
  }

  return {
    branchId,
    branchName: window.sessionStorage.getItem(SESSION_BRANCH_NAME_KEY)?.trim() ?? "",
  };
}

export function writeBranchSession(branchId: string, branchName: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(SESSION_BRANCH_ID_KEY, branchId);
  window.sessionStorage.setItem(SESSION_BRANCH_NAME_KEY, branchName);
}

export function clearBranchSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(SESSION_BRANCH_ID_KEY);
  window.sessionStorage.removeItem(SESSION_BRANCH_NAME_KEY);
  clearTableSession();
}

export function readTableSession(branchId?: string): TableSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const tableNumber = window.sessionStorage.getItem(SESSION_TABLE_NUMBER_KEY)?.trim() ?? "";
  const storedBranchId =
    window.sessionStorage.getItem(SESSION_TABLE_BRANCH_ID_KEY)?.trim() ?? "";

  if (!tableNumber || !storedBranchId) {
    return null;
  }

  if (branchId?.trim() && storedBranchId !== branchId.trim()) {
    return null;
  }

  return {
    branchId: storedBranchId,
    tableNumber,
    section: window.sessionStorage.getItem(SESSION_TABLE_SECTION_KEY)?.trim() ?? "",
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

  window.sessionStorage.setItem(SESSION_TABLE_BRANCH_ID_KEY, normalizedBranchId);
  window.sessionStorage.setItem(SESSION_TABLE_NUMBER_KEY, normalizedTableNumber);
  if (normalizedSection) {
    window.sessionStorage.setItem(SESSION_TABLE_SECTION_KEY, normalizedSection);
  } else {
    window.sessionStorage.removeItem(SESSION_TABLE_SECTION_KEY);
  }
}

export function clearTableSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(SESSION_TABLE_BRANCH_ID_KEY);
  window.sessionStorage.removeItem(SESSION_TABLE_NUMBER_KEY);
  window.sessionStorage.removeItem(SESSION_TABLE_SECTION_KEY);
}

export function readActiveBillSession(branchId?: string): ActiveBillSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const billId = window.sessionStorage.getItem(SESSION_ACTIVE_BILL_ID_KEY)?.trim() ?? "";
  const storedBranchId =
    window.sessionStorage.getItem(SESSION_ACTIVE_BILL_BRANCH_ID_KEY)?.trim() ?? "";

  if (!billId || !storedBranchId) {
    return null;
  }

  if (branchId?.trim() && storedBranchId !== branchId.trim()) {
    return null;
  }

  return {
    branchId: storedBranchId,
    billId,
    tableNumber:
      window.sessionStorage.getItem(SESSION_ACTIVE_BILL_TABLE_NUMBER_KEY)?.trim() ?? "",
    section: window.sessionStorage.getItem(SESSION_ACTIVE_BILL_SECTION_KEY)?.trim() ?? "",
  };
}

export function writeActiveBillSession({
  branchId,
  billId,
  tableNumber,
  section,
}: {
  branchId: string;
  billId: string;
  tableNumber?: string;
  section?: string;
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

  window.sessionStorage.setItem(SESSION_ACTIVE_BILL_BRANCH_ID_KEY, normalizedBranchId);
  window.sessionStorage.setItem(SESSION_ACTIVE_BILL_ID_KEY, normalizedBillId);

  const normalizedTableNumber = tableNumber?.trim() ?? "";
  const normalizedSection = section?.trim() ?? "";
  if (normalizedTableNumber) {
    window.sessionStorage.setItem(
      SESSION_ACTIVE_BILL_TABLE_NUMBER_KEY,
      normalizedTableNumber,
    );
  } else {
    window.sessionStorage.removeItem(SESSION_ACTIVE_BILL_TABLE_NUMBER_KEY);
  }

  if (normalizedSection) {
    window.sessionStorage.setItem(SESSION_ACTIVE_BILL_SECTION_KEY, normalizedSection);
  } else {
    window.sessionStorage.removeItem(SESSION_ACTIVE_BILL_SECTION_KEY);
  }
}

export function clearActiveBillSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(SESSION_ACTIVE_BILL_BRANCH_ID_KEY);
  window.sessionStorage.removeItem(SESSION_ACTIVE_BILL_ID_KEY);
  window.sessionStorage.removeItem(SESSION_ACTIVE_BILL_TABLE_NUMBER_KEY);
  window.sessionStorage.removeItem(SESSION_ACTIVE_BILL_SECTION_KEY);
}
