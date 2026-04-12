import { NextRequest, NextResponse } from "next/server";
import { COOKIE_ADMIN_TOKEN_KEY } from "@/components/branch-session";

export const runtime = "nodejs";

function toTrimmedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    const superAdminUsername =
      process.env.BLACKFOREST_SUPERADMIN_USERNAME?.trim() ||
      process.env.SUPERADMIN_USERNAME?.trim() ||
      "";
    const superAdminPassword =
      process.env.BLACKFOREST_SUPERADMIN_PASSWORD?.trim() ||
      process.env.SUPERADMIN_PASSWORD?.trim() ||
      "";
    const adminToken =
      process.env.BLACKFOREST_HOME_ADMIN_TOKEN?.trim() ||
      process.env.HOME_PAGE_ADMIN_TOKEN?.trim() ||
      "";

    if (!superAdminUsername || !superAdminPassword) {
      return NextResponse.json(
        {
          message:
            "Superadmin login is not configured. Add BLACKFOREST_SUPERADMIN_USERNAME and BLACKFOREST_SUPERADMIN_PASSWORD.",
        },
        { status: 503 },
      );
    }

    if (!adminToken) {
      return NextResponse.json(
        {
          message: "Admin session is not configured. Add BLACKFOREST_HOME_ADMIN_TOKEN.",
        },
        { status: 503 },
      );
    }

    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };
    const username = toTrimmedText(body.username).toLowerCase();
    const password = toTrimmedText(body.password);

    if (
      !username ||
      !password ||
      username !== superAdminUsername.toLowerCase() ||
      password !== superAdminPassword
    ) {
      return NextResponse.json(
        { message: "Invalid superadmin username or password" },
        { status: 401 },
      );
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: COOKIE_ADMIN_TOKEN_KEY,
      value: adminToken,
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
