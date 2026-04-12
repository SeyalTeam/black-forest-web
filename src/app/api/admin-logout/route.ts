import { NextResponse } from "next/server";
import { COOKIE_ADMIN_TOKEN_KEY } from "@/components/branch-session";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: COOKIE_ADMIN_TOKEN_KEY,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
