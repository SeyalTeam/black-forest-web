import { NextRequest } from "next/server";
import { getCategoriesPageData } from "@/lib/home-data";

export async function GET(request: NextRequest) {
  try {
    const branchId = request.nextUrl.searchParams.get("branchId")?.trim() || undefined;
    const payload = await getCategoriesPageData(branchId);
    return Response.json(payload, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load categories page data";
    return Response.json(
      { message },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
