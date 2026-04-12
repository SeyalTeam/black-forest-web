import { NextRequest, NextResponse } from "next/server";
import { COOKIE_ADMIN_TOKEN_KEY } from "@/components/branch-session";
import {
  API_BASE,
  fetchCurrentUser,
  readResponseMessage,
} from "@/lib/admin-auth";

export const runtime = "nodejs";

function toTrimmedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      username?: string;
      email?: string;
      password?: string;
    };
    const usernameOrEmail = toTrimmedText(body.username || body.email).toLowerCase();
    const password = toTrimmedText(body.password);

    if (!usernameOrEmail || !password) {
      return NextResponse.json({ message: "Enter username/email and password." }, { status: 400 });
    }

    const loginResponse = await fetch(`${API_BASE}/users/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: usernameOrEmail,
        password,
      }),
      cache: "no-store",
    });

    if (!loginResponse.ok) {
      return NextResponse.json(
        { message: await readResponseMessage(loginResponse) },
        { status: loginResponse.status },
      );
    }

    const loginPayload = (await loginResponse.json()) as {
      token?: string;
      data?: {
        token?: string;
      };
    };
    const sessionToken = toTrimmedText(loginPayload.token || loginPayload.data?.token);
    if (!sessionToken) {
      return NextResponse.json(
        { message: "Login succeeded but token was missing." },
        { status: 500 },
      );
    }

    const me = await fetchCurrentUser(sessionToken);
    if (!me.ok || !me.isSuperAdmin) {
      return NextResponse.json(
        { message: "Only superadmin is allowed for admin mode." },
        { status: 403 },
      );
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: COOKIE_ADMIN_TOKEN_KEY,
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to login";
    return NextResponse.json({ message }, { status: 500 });
  }
}
