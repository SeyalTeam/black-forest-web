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

function toFiniteInteger(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
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

function parseTableNumberToken(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const direct = Number.parseInt(trimmed, 10);
  if (Number.isFinite(direct)) {
    return direct;
  }

  const withoutPrefix = trimmed.replace(/^table[\s\-_:]*/i, "");
  const parsed = Number.parseInt(withoutPrefix, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSections(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const map =
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? (entry as Record<string, unknown>)
          : null;
      if (!map) return null;
      return {
        name: toTrimmedText(map.name),
        tableCount: toFiniteInteger(map.tableCount),
      };
    })
    .filter(
      (section): section is { name: string; tableCount: number } => section !== null,
    );
}

async function resolveLiveSectionsForTableNumber({
  tableNumber,
  branchId,
  token,
  preferredSection,
}: {
  tableNumber: number;
  branchId: string;
  token: string;
  preferredSection?: string;
}) {
  const tablesUrl = `${API_BASE}/tables?where[branch][equals]=${encodeURIComponent(branchId)}&limit=100&depth=1`;
  const response = await fetch(tablesUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    docs?: Array<Record<string, unknown>>;
  };
  const sectionNames = new Set<string>();

  for (const root of payload.docs ?? []) {
    const sections = parseSections(root.sections);
    for (const section of sections) {
      if (tableNumber > 0 && tableNumber <= section.tableCount && section.name) {
        sectionNames.add(section.name);
      }
    }
  }

  const orderedSections = Array.from(sectionNames);
  const normalizedPreferredSection = preferredSection?.trim().toLowerCase() ?? "";
  if (!normalizedPreferredSection) {
    return orderedSections;
  }

  return orderedSections.sort((left, right) => {
    const leftIsPreferred = left.toLowerCase() === normalizedPreferredSection;
    const rightIsPreferred = right.toLowerCase() === normalizedPreferredSection;
    if (leftIsPreferred === rightIsPreferred) {
      return 0;
    }
    return leftIsPreferred ? -1 : 1;
  });
}

async function isLiveTableOccupied({
  tableNumber,
  sectionName,
  branchId,
  token,
}: {
  tableNumber: string;
  sectionName: string;
  branchId: string;
  token: string;
}) {
  const lookupParams = new URLSearchParams({
    "where[status][in]": "pending,ordered,confirmed,prepared,delivered",
    "where[tableDetails.tableNumber][equals]": tableNumber,
    "where[tableDetails.section][equals]": sectionName,
    "where[createdAt][greater_than_equal]": getIndiaDayStartIso(),
    "where[branch][equals]": branchId,
    limit: "1",
    depth: "0",
  });

  const response = await fetch(`${API_BASE}/billings?${lookupParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    return false;
  }

  const payload = (await response.json()) as BillingLookupResponse;
  return Boolean(payload.docs?.length);
}

async function resolveTableTarget({
  tableNumberInput,
  branchId,
  token,
  preferredSection,
}: {
  tableNumberInput: string;
  branchId: string;
  token: string;
  preferredSection?: string;
}) {
  const tableNumber = tableNumberInput.trim();
  const parsedTable = parseTableNumberToken(tableNumberInput);
  if (parsedTable === null || !tableNumber) {
    return {
      tableNumber,
      section: SHARED_TABLE_SECTION,
      useShared: true,
    };
  }

  const liveSections = await resolveLiveSectionsForTableNumber({
    tableNumber: parsedTable,
    branchId,
    token,
    preferredSection,
  });
  if (liveSections.length === 0) {
    return {
      tableNumber,
      section: SHARED_TABLE_SECTION,
      useShared: true,
    };
  }

  for (const liveSection of liveSections) {
    const occupied = await isLiveTableOccupied({
      tableNumber,
      sectionName: liveSection,
      branchId,
      token,
    });
    if (!occupied) {
      return {
        tableNumber,
        section: liveSection,
        useShared: false,
      };
    }
  }

  return {
    tableNumber,
    section: SHARED_TABLE_SECTION,
    useShared: true,
  };
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

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function billDocId(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);

  const map = readRecord(value);
  if (!map) return "";

  return (
    toTrimmedText(map.id) ||
    toTrimmedText(map._id) ||
    toTrimmedText(map.$oid)
  );
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
      preferredSection?: string;
      items?: IncomingOrderItem[];
    };

    const branchId = toTrimmedText(body.branchId);
    const tableNumberInput = toTrimmedText(body.tableNumber);
    const preferredSection = toTrimmedText(body.preferredSection);
    const incomingItems = Array.isArray(body.items) ? body.items : [];

    if (!branchId) {
      return Response.json({ message: "Branch id is required" }, { status: 400 });
    }
    if (!tableNumberInput) {
      return Response.json({ message: "Table number is required" }, { status: 400 });
    }

    const billingItems = incomingItems
      .map((item) => buildBillingItem(item))
      .filter((item): item is Record<string, unknown> => item !== null);

    if (billingItems.length === 0) {
      return Response.json({ message: "At least one valid item is required" }, { status: 400 });
    }

    const resolvedTarget = await resolveTableTarget({
      tableNumberInput,
      branchId,
      token,
      preferredSection,
    });
    const tableNumber = resolvedTarget.tableNumber;
    const sectionName = resolvedTarget.section;

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
      "where[tableDetails.section][equals]": sectionName,
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
        section: sectionName,
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
    const writeDoc = readRecord(writePayload.doc) ?? writePayload;
    return Response.json({
      ok: true,
      billId:
        billDocId(writeDoc) ||
        billDocId(writePayload.id) ||
        billDocId(writePayload._id) ||
        billDocId(writePayload.doc) ||
        existingId,
      invoiceNumber:
        toTrimmedText(writeDoc.invoiceNumber) ||
        toTrimmedText(writePayload.invoiceNumber),
      merged: Boolean(existingId),
      tableNumber,
      section: sectionName,
      useShared: resolvedTarget.useShared,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to place order";
    return Response.json({ message }, { status: 500 });
  }
}
