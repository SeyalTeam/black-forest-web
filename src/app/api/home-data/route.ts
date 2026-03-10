import { NextRequest } from "next/server";
import { getHomePageData } from "@/lib/home-data";

export async function GET(request: NextRequest) {
  try {
    const branchId = request.nextUrl.searchParams.get("branchId")?.trim() || undefined;
    const payload = await getHomePageData(branchId);
    return Response.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load homepage data";
    return Response.json({ message }, { status: 500 });
  }
}
