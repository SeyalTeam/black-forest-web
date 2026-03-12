import { NextRequest } from "next/server";
import type { BillSummaryData, BillSummaryItem } from "@/lib/order-types";

const API_BASE = "https://blackforest.vseyal.com/api";

function toTrimmedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    return ["true", "1", "yes"].includes(value.trim().toLowerCase());
  }
  return false;
}

function normalizeStatus(value: unknown) {
  const normalized = toTrimmedText(value).toLowerCase();
  return normalized || "ordered";
}

function normalizePaymentMethod(value: unknown) {
  const normalized = toTrimmedText(value).toLowerCase();
  if (normalized === "cash" || normalized === "upi" || normalized === "card") {
    return normalized;
  }
  return "cash";
}

function parseItems(value: unknown): BillSummaryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const item =
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? (entry as Record<string, unknown>)
          : null;
      if (!item) return null;

      const product =
        item.product && typeof item.product === "object" && !Array.isArray(item.product)
          ? (item.product as Record<string, unknown>)
          : null;

      return {
        id: toTrimmedText(item.id) || toTrimmedText(product?.id) || crypto.randomUUID(),
        name: toTrimmedText(item.name) || toTrimmedText(product?.name) || "Unknown item",
        quantity: Math.max(1, toFiniteNumber(item.quantity) || 1),
        subtotal: toFiniteNumber(item.subtotal),
        status: normalizeStatus(item.status),
        isVeg: toBoolean(product?.isVeg),
      } satisfies BillSummaryItem;
    })
    .filter((item): item is BillSummaryItem => item !== null);
}

export async function GET(request: NextRequest) {
  try {
    const billId = request.nextUrl.searchParams.get("billId")?.trim() || "";
    if (!billId) {
      return Response.json({ message: "Bill id is required" }, { status: 400 });
    }

    const response = await fetch(`${API_BASE}/billings/${billId}?depth=1`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return Response.json({ message: "Unable to load bill" }, { status: response.status });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const branch =
      payload.branch && typeof payload.branch === "object" && !Array.isArray(payload.branch)
        ? (payload.branch as Record<string, unknown>)
        : null;
    const tableDetails =
      payload.tableDetails &&
      typeof payload.tableDetails === "object" &&
      !Array.isArray(payload.tableDetails)
        ? (payload.tableDetails as Record<string, unknown>)
        : null;

    const summary: BillSummaryData = {
      billId: toTrimmedText(payload.id) || billId,
      invoiceNumber: toTrimmedText(payload.invoiceNumber),
      branchName: toTrimmedText(branch?.name) || "VSeyal",
      tableNumber: toTrimmedText(tableDetails?.tableNumber),
      section: toTrimmedText(tableDetails?.section),
      totalAmount: toFiniteNumber(payload.totalAmount),
      paymentMethod: normalizePaymentMethod(payload.paymentMethod),
      items: parseItems(payload.items),
    };

    return Response.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load bill";
    return Response.json({ message }, { status: 500 });
  }
}
