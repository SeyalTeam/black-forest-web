export const SESSION_BRANCH_ID_KEY = "blackforest-order-web-branch-id";
export const SESSION_BRANCH_NAME_KEY = "blackforest-order-web-branch-name";

export type BranchSession = {
  branchId: string;
  branchName: string;
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
}
