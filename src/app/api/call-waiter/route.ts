import { NextRequest } from "next/server";

const API_BASE = "https://blackforest.vseyal.com/api";
const ACTIVE_BILL_STATUSES = new Set([
  "pending",
  "ordered",
  "confirmed",
  "prepared",
  "delivered",
]);

type BillingLookupResponse = {
  docs?: Array<Record<string, unknown>>;
};

function toTrimmedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
    toTrimmedText(map.$oid) ||
    toTrimmedText(map.value)
  );
}

function mergeNotes(existingNotes: unknown, newNotes: string) {
  const existing = toTrimmedText(existingNotes);
  if (!existing) return newNotes;
  if (!newNotes) return existing;
  return `${existing} | ${newNotes}`;
}

function isActiveStatus(value: unknown) {
  const normalized = toTrimmedText(value).toLowerCase();
  return ACTIVE_BILL_STATUSES.has(normalized);
}

function readTableDetails(value: unknown) {
  const map = readRecord(value);
  const details = readRecord(map?.tableDetails);

  return {
    tableNumber:
      toTrimmedText(details?.tableNumber) || toTrimmedText(map?.tableNumber),
    section: toTrimmedText(details?.section) || toTrimmedText(map?.section),
  };
}

function readBranchId(value: unknown) {
  const map = readRecord(value);
  return (
    billDocId(map?.branch) ||
    billDocId(map?.branchId) ||
    toTrimmedText(map?.branch)
  );
}

function buildWaiterAlertNote({
  tableNumber,
  section,
}: {
  tableNumber: string;
  section: string;
}) {
  const noteParts = ["WAITER_CALL_SOS", new Date().toISOString()];
  if (tableNumber) {
    noteParts.push(`TABLE-${tableNumber}`);
  }
  if (section) {
    noteParts.push(`SECTION-${section.replace(/\s+/g, "_")}`);
  }
  return noteParts.join(" ");
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

async function fetchBillById({
  billId,
  token,
}: {
  billId: string;
  token: string;
}) {
  const response = await fetch(`${API_BASE}/billings/${billId}?depth=0`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await readResponseMessage(response);
    throw new Error(message);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  return readRecord(payload.doc) ?? payload;
}

async function findLatestActiveBillForTable({
  branchId,
  tableNumber,
  section,
  token,
}: {
  branchId: string;
  tableNumber: string;
  section: string;
  token: string;
}) {
  const runLookup = async (includeSection: boolean) => {
    const query = new URLSearchParams({
      "where[branch][equals]": branchId,
      "where[status][in]": Array.from(ACTIVE_BILL_STATUSES).join(","),
      "where[tableDetails.tableNumber][equals]": tableNumber,
      limit: "1",
      sort: "-updatedAt",
      depth: "0",
    });

    if (includeSection && section) {
      query.set("where[tableDetails.section][equals]", section);
    }

    const response = await fetch(`${API_BASE}/billings?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const message = await readResponseMessage(response);
      throw new Error(message);
    }

    const payload = (await response.json()) as BillingLookupResponse;
    return payload.docs?.[0] ?? null;
  };

  const firstTry = await runLookup(true);
  if (firstTry) {
    return firstTry;
  }
  if (!section) {
    return null;
  }
  return runLookup(false);
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
            "Waiter call is not enabled yet. Add BLACKFOREST_API_TOKEN in Vercel so the website can alert billing.",
        },
        { status: 503 },
      );
    }

    const body = (await request.json()) as {
      branchId?: string;
      billId?: string;
      tableNumber?: string;
      section?: string;
    };

    const branchId = toTrimmedText(body.branchId);
    const billId = toTrimmedText(body.billId);
    const tableNumber = toTrimmedText(body.tableNumber);
    const section = toTrimmedText(body.section);

    if (!branchId) {
      return Response.json({ message: "Branch id is required" }, { status: 400 });
    }
    if (!billId && !tableNumber) {
      return Response.json(
        { message: "Active bill or table details are required to call a waiter." },
        { status: 400 },
      );
    }

    let targetBill: Record<string, unknown> | null = null;
    if (billId) {
      try {
        targetBill = await fetchBillById({ billId, token });
      } catch (error) {
        if (!tableNumber) {
          throw error;
        }
      }
    }

    if (!targetBill && tableNumber) {
      targetBill = await findLatestActiveBillForTable({
        branchId,
        tableNumber,
        section,
        token,
      });
    }

    if (!targetBill) {
      return Response.json(
        { message: "No active bill found for this table right now." },
        { status: 404 },
      );
    }

    const resolvedBillId = billDocId(targetBill.id) || billDocId(targetBill._id) || billId;
    if (!resolvedBillId) {
      return Response.json({ message: "Unable to resolve bill id." }, { status: 422 });
    }

    const resolvedBillBranchId = readBranchId(targetBill);
    if (resolvedBillBranchId && resolvedBillBranchId !== branchId) {
      return Response.json(
        { message: "This bill belongs to a different branch." },
        { status: 409 },
      );
    }

    if (!isActiveStatus(targetBill.status)) {
      return Response.json(
        { message: "This bill is already closed. Open a new order to call a waiter." },
        { status: 409 },
      );
    }

    const details = readTableDetails(targetBill);
    const resolvedTableNumber = details.tableNumber || tableNumber;
    const resolvedSection = details.section || section;
    const waiterAlertNote = buildWaiterAlertNote({
      tableNumber: resolvedTableNumber,
      section: resolvedSection,
    });

    const writeResponse = await fetch(`${API_BASE}/billings/${resolvedBillId}?depth=0`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        notes: mergeNotes(targetBill.notes, waiterAlertNote),
      }),
      cache: "no-store",
    });

    if (!writeResponse.ok) {
      const message = await readResponseMessage(writeResponse);
      return Response.json({ message }, { status: writeResponse.status });
    }

    return Response.json({
      ok: true,
      billId: resolvedBillId,
      tableNumber: resolvedTableNumber,
      section: resolvedSection,
      message: resolvedTableNumber
        ? `SOS sent to billing for Table ${resolvedTableNumber}. Waiter is on the way.`
        : "SOS sent to billing. Waiter is on the way.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to call waiter";
    return Response.json({ message }, { status: 500 });
  }
}
