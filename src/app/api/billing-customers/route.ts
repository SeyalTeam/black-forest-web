import { NextRequest } from "next/server";
import { COOKIE_ADMIN_TOKEN_KEY } from "@/components/branch-session";
import { resolveApiTokenForBranch } from "@/lib/api-token";

const API_BASE = "https://blackforest2.vseyal.com/api";

export const runtime = "nodejs";

function toTrimmedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
    const query = new URLSearchParams(request.nextUrl.searchParams);
    const branchId = toTrimmedText(query.get("branchId"));
    query.delete("branchId");

    if (![...query.keys()].length) {
      return Response.json({ message: "Query filters are required" }, { status: 400 });
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

    const upstreamResponse = await fetch(`${API_BASE}/billing-customers?${query}`, {
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
