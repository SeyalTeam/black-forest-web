import { NextRequest } from "next/server";
import { findBranchByCoordinates } from "@/lib/home-data";

export async function GET(request: NextRequest) {
  try {
    const latitude = Number.parseFloat(request.nextUrl.searchParams.get("lat") ?? "");
    const longitude = Number.parseFloat(request.nextUrl.searchParams.get("lng") ?? "");

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return Response.json({ message: "Latitude and longitude are required" }, { status: 400 });
    }

    const payload = await findBranchByCoordinates(latitude, longitude);
    return Response.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resolve branch";
    return Response.json({ message }, { status: 500 });
  }
}
