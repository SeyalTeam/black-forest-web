import { NextRequest } from "next/server";
import { BILLING_DISABLED_MESSAGE, BILLING_ENABLED } from "@/lib/billing-config";
import { resolveApiTokenForBranch } from "@/lib/api-token";

const API_BASE = "https://blackforest2.vseyal.com/api";

function toTrimmedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePaymentMethod(value: unknown) {
  const normalized = toTrimmedText(value).toLowerCase();
  if (normalized === "cash" || normalized === "upi" || normalized === "card") {
    return normalized;
  }
  return "";
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
    if (!BILLING_ENABLED) {
      return Response.json({ message: BILLING_DISABLED_MESSAGE }, { status: 503 });
    }

    const body = (await request.json()) as {
      billId?: string;
      paymentMethod?: string;
      branchId?: string;
    };

    const billId = toTrimmedText(body.billId);
    const paymentMethod = normalizePaymentMethod(body.paymentMethod);
    const branchId = toTrimmedText(body.branchId);

    if (!billId) {
      return Response.json({ message: "Bill id is required" }, { status: 400 });
    }
    if (!paymentMethod) {
      return Response.json({ message: "Select a payment method" }, { status: 400 });
    }

    const token = resolveApiTokenForBranch(branchId);
    if (!token) {
      return Response.json(
        {
          message:
            "Billing is not enabled yet. Add BLACKFOREST_BRANCH_API_TOKENS or BLACKFOREST_API_TOKEN in Vercel so the website can complete bills.",
        },
        { status: 503 },
      );
    }

    const writeResponse = await fetch(`${API_BASE}/billings/${billId}?depth=0`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "completed",
        paymentMethod,
      }),
      cache: "no-store",
    });

    if (!writeResponse.ok) {
      const message = await readResponseMessage(writeResponse);
      return Response.json({ message }, { status: writeResponse.status });
    }

    const payload = (await writeResponse.json()) as Record<string, unknown>;
    return Response.json({
      ok: true,
      billId: toTrimmedText(payload.id) || billId,
      invoiceNumber: toTrimmedText(payload.invoiceNumber),
      paymentMethod,
      status: "completed",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to complete bill";
    return Response.json({ message }, { status: 500 });
  }
}
