import { NextRequest } from "next/server";
import { COOKIE_ADMIN_TOKEN_KEY } from "@/components/branch-session";
import { resolveApiTokenForBranch } from "@/lib/api-token";

const API_BASE = "https://blackforest1.vseyal.com/api";
const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 50;

export const runtime = "nodejs";

function toTrimmedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? String(DEFAULT_LIMIT), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

function readBooleanParam(value: string | null, fallback = false) {
  const normalized = toTrimmedText(value).toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

async function readJsonPayload(response: Response) {
  const raw = await response.text();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { message: raw };
  }
}

export async function GET(request: NextRequest) {
  try {
    const phoneNumber = toTrimmedText(request.nextUrl.searchParams.get("phoneNumber"));
    const branchId = toTrimmedText(request.nextUrl.searchParams.get("branchId"));
    const includeCancelled = readBooleanParam(
      request.nextUrl.searchParams.get("includeCancelled"),
      false,
    );
    const limit = readLimit(request.nextUrl.searchParams.get("limit"));

    if (!phoneNumber) {
      return Response.json({ message: "phoneNumber is required" }, { status: 400 });
    }

    const query = new URLSearchParams({
      phoneNumber,
      includeCancelled: includeCancelled ? "true" : "false",
      limit: String(limit),
    });
    if (branchId) {
      query.set("branchId", branchId);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const incomingAuthorization = toTrimmedText(request.headers.get("authorization"));
    if (incomingAuthorization) {
      headers.Authorization = incomingAuthorization;
    } else {
      const cookieToken = toTrimmedText(request.cookies.get(COOKIE_ADMIN_TOKEN_KEY)?.value);
      const branchToken = resolveApiTokenForBranch(branchId);
      const resolvedToken = cookieToken || branchToken;
      if (resolvedToken) {
        headers.Authorization = `Bearer ${resolvedToken}`;
      }
    }

    const incomingCookie = toTrimmedText(request.headers.get("cookie"));
    if (incomingCookie) {
      headers.cookie = incomingCookie;
    }

    const upstreamResponse = await fetch(`${API_BASE}/billing/customer-lookup?${query}`, {
      headers,
      cache: "no-store",
    });

    const payload = await readJsonPayload(upstreamResponse);
    return Response.json(payload, { status: upstreamResponse.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch customer details";
    return Response.json({ message }, { status: 500 });
  }
}
