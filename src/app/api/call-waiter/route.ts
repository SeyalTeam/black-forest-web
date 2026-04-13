import { NextRequest } from "next/server";

const API_BASE = "https://blackforest.vseyal.com/api";

function toTrimmedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

async function readResponsePayload(response: Response) {
  const raw = await response.text();
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { message: String(parsed) };
  } catch {
    return { message: raw };
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
            "Waiter call is not enabled yet. Add BLACKFOREST_API_TOKEN in Vercel so the website can alert billing.",
        },
        { status: 503 },
      );
    }

    const rawBody = (await request.json()) as unknown;
    const body = toPayload(rawBody);

    const branchId = toTrimmedText(body?.branchId);
    const billId = toTrimmedText(body?.billId);
    const tableNumber = toTrimmedText(body?.tableNumber);
    const section = toTrimmedText(body?.section);

    if (!branchId) {
      return Response.json({ message: "Branch id is required" }, { status: 400 });
    }

    const payload: Record<string, string> = { branchId };
    if (billId) {
      payload.billId = billId;
    }
    if (tableNumber) {
      payload.tableNumber = tableNumber;
    }
    if (section) {
      payload.section = section;
    }

    const upstreamResponse = await fetch(`${API_BASE}/call-waiter`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const upstreamPayload = await readResponsePayload(upstreamResponse);
    return Response.json(upstreamPayload, { status: upstreamResponse.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to call waiter";
    return Response.json({ message }, { status: 500 });
  }
}
