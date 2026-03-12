import { NextRequest } from "next/server";

const API_BASE = "https://blackforest.vseyal.com/api";
const SHARED_TABLE_SECTION = "Shared Tables";

type IncomingOrderItem = {
  id?: string;
  name?: string;
  price?: number;
  quantity?: number;
  note?: string;
};

type BillingLookupResponse = {
  docs?: Array<Record<string, unknown>>;
};

export const runtime = "nodejs";

function toFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toTrimmedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePaymentMethod(value: unknown) {
  const normalized = toTrimmedText(value).toLowerCase();
  if (normalized === "cash" || normalized === "upi" || normalized === "card") {
    return normalized;
  }
  return "cash";
}

function getIndiaDayStartIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return new Date(`${year}-${month}-${day}T00:00:00+05:30`).toISOString();
}

function buildBillingItem(item: IncomingOrderItem) {
  const productId = toTrimmedText(item.id);
  const name = toTrimmedText(item.name);
  const quantity = Math.max(1, toFiniteNumber(item.quantity) || 1);
  const unitPrice = Math.max(0, toFiniteNumber(item.price));
  const note = toTrimmedText(item.note);

  if (!productId || !name) {
    return null;
  }

  const payload: Record<string, unknown> = {
    product: productId,
    name,
    quantity,
    unitPrice,
    subtotal: unitPrice * quantity,
  };

  if (note) {
    payload.specialNote = note;
    payload.notes = note;
    payload.note = note;
    payload.instructions = note;
  }

  return payload;
}

function normalizeCustomerDetails(value: unknown) {
  const map =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;

  return {
    name: toTrimmedText(map?.name),
    phoneNumber: toTrimmedText(map?.phoneNumber),
    address: toTrimmedText(map?.address),
  };
}

function mergeNotes(existingNotes: unknown, newNotes: string) {
  const existing = toTrimmedText(existingNotes);
  if (!existing) return newNotes;
  if (!newNotes) return existing;
  return `${existing} | ${newNotes}`;
}

async function readResponseMessage(response: Response) {
  const raw = await response.text();
  try {
    const parsed = JSON.parse(raw) as {
      message?: string;
      errors?: Array<{ message?: string }>;
    };
    return parsed.message || parsed.errors?.[0]?.message || raw || "Request failed";
  } catch {
    return raw || "Request failed";
  }
}

export async function POST(request: NextRequest) {
  try {
    const token =
      process.env.BLACKFOREST_API_TOKEN?.trim() ||
      process.env.BLACKFOREST_BILLING_TOKEN?.trim() ||
      process.env.BLACKFOREST_API_BEARER_TOKEN?.trim() ||
      "";

    if (!token) {
      return Response.json(
        {
          message:
            "Ordering is not enabled yet. Add BLACKFOREST_API_TOKEN in Vercel so the website can create billing orders.",
        },
        { status: 503 },
      );
    }

    const body = (await request.json()) as {
      branchId?: string;
      tableNumber?: string;
      items?: IncomingOrderItem[];
    };

    const branchId = toTrimmedText(body.branchId);
    const tableNumber = toTrimmedText(body.tableNumber);
    const incomingItems = Array.isArray(body.items) ? body.items : [];

    if (!branchId) {
      return Response.json({ message: "Branch id is required" }, { status: 400 });
    }
    if (!tableNumber) {
      return Response.json({ message: "Table number is required" }, { status: 400 });
    }

    const billingItems = incomingItems
      .map((item) => buildBillingItem(item))
      .filter((item): item is Record<string, unknown> => item !== null);

    if (billingItems.length === 0) {
      return Response.json({ message: "At least one valid item is required" }, { status: 400 });
    }

    const newTotalAmount = billingItems.reduce(
      (sum, item) => sum + toFiniteNumber(item.subtotal),
      0,
    );
    const newNotes = billingItems
      .map((item) => {
        const note = toTrimmedText(item.specialNote);
        const name = toTrimmedText(item.name);
        return note && name ? `${name}: ${note}` : "";
      })
      .filter(Boolean)
      .join(", ");

    const lookupParams = new URLSearchParams({
      "where[status][in]": "pending,ordered",
      "where[tableDetails.tableNumber][equals]": tableNumber,
      "where[tableDetails.section][equals]": SHARED_TABLE_SECTION,
      "where[branch][equals]": branchId,
      "where[createdAt][greater_than_equal]": getIndiaDayStartIso(),
      limit: "1",
      sort: "-updatedAt",
      depth: "0",
    });

    const lookupResponse = await fetch(`${API_BASE}/billings?${lookupParams.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!lookupResponse.ok) {
      const message = await readResponseMessage(lookupResponse);
      return Response.json({ message }, { status: lookupResponse.status });
    }

    const lookupPayload = (await lookupResponse.json()) as BillingLookupResponse;
    const existingBill = lookupPayload.docs?.[0];
    const existingId = toTrimmedText(existingBill?.id);
    const existingItems = Array.isArray(existingBill?.items)
      ? (existingBill.items as Record<string, unknown>[])
      : [];

    const payload: Record<string, unknown> = {
      branch: branchId,
      items: existingItems.concat(billingItems),
      totalAmount: toFiniteNumber(existingBill?.totalAmount) + newTotalAmount,
      customerDetails: normalizeCustomerDetails(existingBill?.customerDetails),
      paymentMethod: normalizePaymentMethod(existingBill?.paymentMethod),
      applyCustomerOffer: existingBill?.applyCustomerOffer === true,
      status: toTrimmedText(existingBill?.status) || "pending",
      tableDetails: {
        section: SHARED_TABLE_SECTION,
        tableNumber,
      },
    };

    const mergedNotes = mergeNotes(existingBill?.notes, newNotes);
    if (mergedNotes) {
      payload.notes = mergedNotes;
    }

    const companyId = toTrimmedText(existingBill?.company);
    if (companyId) {
      payload.company = companyId;
    }

    const writeUrl = existingId
      ? `${API_BASE}/billings/${existingId}?depth=0`
      : `${API_BASE}/billings?depth=0`;
    const writeResponse = await fetch(writeUrl, {
      method: existingId ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!writeResponse.ok) {
      const message = await readResponseMessage(writeResponse);
      return Response.json({ message }, { status: writeResponse.status });
    }

    const writePayload = (await writeResponse.json()) as Record<string, unknown>;
    return Response.json({
      ok: true,
      billId: toTrimmedText(writePayload.id) || existingId,
      invoiceNumber: toTrimmedText(writePayload.invoiceNumber),
      merged: Boolean(existingId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to place order";
    return Response.json({ message }, { status: 500 });
  }
}
