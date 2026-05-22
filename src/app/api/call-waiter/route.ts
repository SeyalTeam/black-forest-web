import { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";

function toTrimmedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = (await request.json()) as unknown;
    const body = toPayload(rawBody);

    const branchId = toTrimmedText(body?.branchId);
    const billId = toTrimmedText(body?.billId);
    const tableNumber = toTrimmedText(body?.tableNumber);
    const section = toTrimmedText(body?.section);

    if (!branchId) {
      return Response.json({ message: "Branch id is required" }, { status: 400 });
    }

    const payload: Record<string, unknown> = { 
      branchId,
      createdAt: new Date(),
      status: "pending"
    };
    if (billId) payload.billId = billId;
    if (tableNumber) payload.tableNumber = tableNumber;
    if (section) payload.section = section;

    const db = await getDb();
    await db.collection("waiterCalls").insertOne(payload);

    return Response.json({ message: "Waiter has been called", ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to call waiter";
    return Response.json({ message }, { status: 500 });
  }
}
