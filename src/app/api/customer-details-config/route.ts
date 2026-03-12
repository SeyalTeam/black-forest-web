import { NextRequest } from "next/server";

const API_BASE = "https://blackforest.vseyal.com/api";

type CustomerDetailsConfig = {
  showCustomerDetails: boolean;
  allowSkip: boolean;
  autoSubmit: boolean;
  showHistory: boolean;
};

const defaultConfig: CustomerDetailsConfig = {
  showCustomerDetails: true,
  allowSkip: true,
  autoSubmit: true,
  showHistory: true,
};

function toMap(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseBool(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === "true" ||
      normalized === "1" ||
      normalized === "yes" ||
      normalized === "on" ||
      normalized === "enabled"
    ) {
      return true;
    }
    if (
      normalized === "false" ||
      normalized === "0" ||
      normalized === "no" ||
      normalized === "off" ||
      normalized === "disabled"
    ) {
      return false;
    }
  }
  return null;
}

function readBoolFromTree(node: unknown, keys: string[], fallback: boolean): boolean {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));

  const scan = (current: unknown): boolean | null => {
    if (Array.isArray(current)) {
      for (const entry of current) {
        const nested = scan(entry);
        if (nested !== null) {
          return nested;
        }
      }
      return null;
    }

    const map = toMap(current);
    if (!map) {
      return null;
    }

    for (const [key, value] of Object.entries(map)) {
      if (wanted.has(key.toLowerCase())) {
        const parsed = parseBool(value);
        if (parsed !== null) {
          return parsed;
        }
      }
    }

    for (const value of Object.values(map)) {
      const nested = scan(value);
      if (nested !== null) {
        return nested;
      }
    }

    return null;
  };

  return scan(node) ?? fallback;
}

export async function GET(request: NextRequest) {
  try {
    const branchId = request.nextUrl.searchParams.get("branchId")?.trim() ?? "";
    if (!branchId) {
      return Response.json(defaultConfig);
    }

    const token =
      process.env.BLACKFOREST_API_TOKEN?.trim() ||
      process.env.BLACKFOREST_BILLING_TOKEN?.trim() ||
      process.env.BLACKFOREST_API_BEARER_TOKEN?.trim() ||
      "";

    if (!token) {
      return Response.json(defaultConfig);
    }

    const response = await fetch(
      `${API_BASE}/widgets/table-customer-details-visibility?branchId=${encodeURIComponent(branchId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return Response.json(defaultConfig);
    }

    const decoded = (await response.json()) as Record<string, unknown>;
    const doc = toMap(decoded.doc);
    const data = toMap(decoded.data);
    const firstDoc = Array.isArray(decoded.docs) ? toMap(decoded.docs[0]) : null;
    const source = doc ?? data ?? firstDoc ?? decoded;

    const config: CustomerDetailsConfig = {
      showCustomerDetails: readBoolFromTree(
        source,
        [
          "showCustomerDetailsForTableOrders",
          "showCustomerDetailsForTableOrder",
          "showCustomerDetailsForTable",
          "showTableCustomerDetails",
          "show_table_customer_details",
          "showCustomerDetailsButtonForTableOrders",
          "showCustomerDetailsButtonForTableOrder",
        ],
        true,
      ),
      allowSkip: readBoolFromTree(
        source,
        [
          "allowSkipCustomerDetailsForTableOrders",
          "allowSkipCustomerDetailsForTableOrder",
          "allowSkipForTableOrders",
          "allowSkipForTable",
          "allow_skip_customer_details_for_table_orders",
          "allowSkipButtonForTableOrders",
          "allowSkipButtonForTableOrder",
        ],
        true,
      ),
      autoSubmit: readBoolFromTree(
        source,
        [
          "autoSubmitCustomerDetailsForTableOrders",
          "autoSubmitCustomerDetailsForTableOrder",
          "enableAutoSubmitCustomerDetailsForTableOrders",
          "enableAutoSubmitCustomerDetailsForTableOrder",
          "autoSubmitForTableOrders",
          "autoSubmitForTableOrder",
          "autoSubmitForTable",
          "auto_submit_customer_details_for_table_orders",
          "autoSubmitCustomerDetails",
        ],
        true,
      ),
      showHistory: readBoolFromTree(
        source,
        [
          "showCustomerHistoryForTableOrders",
          "showCustomerHistoryForTableOrder",
          "showCustomerHistoryForTable",
          "showTableCustomerHistory",
          "show_table_customer_history",
          "showCustomerHistoryButtonForTableOrders",
          "showCustomerHistoryButtonForTableOrder",
          "showCustomerHistory",
        ],
        true,
      ),
    };

    return Response.json(config);
  } catch {
    return Response.json(defaultConfig);
  }
}
