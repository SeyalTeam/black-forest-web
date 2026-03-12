import { NextRequest } from "next/server";
import { getProductsPageData } from "@/lib/home-data";

export async function GET(request: NextRequest) {
  try {
    const branchId = request.nextUrl.searchParams.get("branchId")?.trim() || undefined;
    const categoryId = request.nextUrl.searchParams.get("categoryId")?.trim() || "";
    const categoryName = request.nextUrl.searchParams.get("categoryName")?.trim() || undefined;

    if (!categoryId) {
      return Response.json({ message: "Category id is required" }, { status: 400 });
    }

    const payload = await getProductsPageData(categoryId, branchId, categoryName);
    return Response.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load products page data";
    return Response.json({ message }, { status: 500 });
  }
}
