import { NextRequest } from "next/server";

const API_BASE = "https://blackforest.vseyal.com/api";

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
    const token =
      process.env.BLACKFOREST_API_TOKEN?.trim() ||
      process.env.BLACKFOREST_BILLING_TOKEN?.trim() ||
      process.env.BLACKFOREST_API_BEARER_TOKEN?.trim() ||
      "";

    if (!token) {
      return Response.json(
        {
          message:
            "Billing is not enabled yet. Add BLACKFOREST_API_TOKEN in Vercel so the website can complete bills.",
        },
        { status: 503 },
      );
    }

    const body = (await request.json()) as {
      billId?: string;
      paymentMethod?: string;
    };

    const billId = toTrimmedText(body.billId);
    const paymentMethod = normalizePaymentMethod(body.paymentMethod);

    if (!billId) {
      return Response.json({ message: "Bill id is required" }, { status: 400 });
    }
    if (!paymentMethod) {
      return Response.json({ message: "Select a payment method" }, { status: 400 });
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
