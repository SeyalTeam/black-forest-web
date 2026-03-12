import { NextRequest } from "next/server";

const API_BASE = "https://blackforest.vseyal.com/api";

function toMap(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asList(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function toTrimmedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readCount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function readMoney(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function readFirstPositiveCount(candidates: unknown[]) {
  for (const candidate of candidates) {
    const parsed = readCount(candidate);
    if (parsed > 0) return parsed;
  }
  return 0;
}

function readFirstPositiveMoney(candidates: unknown[]) {
  for (const candidate of candidates) {
    const parsed = readMoney(candidate);
    if (parsed > 0) return parsed;
  }
  return 0;
}

function extractBills(raw: unknown) {
  if (Array.isArray(raw)) {
    return raw;
  }

  const map = toMap(raw);
  if (!map) {
    return [];
  }

  return asList(
    map.bills ??
      map.billings ??
      map.docs ??
      map.history ??
      map.items ??
      map.rows ??
      map.results ??
      map.records,
  );
}

function readBillsFromPayload(payload: Record<string, unknown>) {
  const nestedData = toMap(payload.data) ?? toMap(payload.result) ?? payload;
  const summaryMap = toMap(payload.summary) ?? toMap(nestedData?.summary);
  const statsMap = toMap(payload.stats) ?? toMap(nestedData?.stats);
  const historyMap =
    toMap(payload.history) ??
    toMap(nestedData?.history) ??
    toMap(summaryMap?.history) ??
    toMap(statsMap?.history);

  return extractBills(
    payload.bills ??
      payload.billings ??
      payload.docs ??
      payload.history ??
      nestedData?.bills ??
      nestedData?.billings ??
      nestedData?.docs ??
      nestedData?.history ??
      summaryMap?.bills ??
      summaryMap?.docs ??
      historyMap?.bills ??
      historyMap?.billings ??
      historyMap?.docs,
  );
}

function historyCountOf(result: Record<string, unknown> | null) {
  return result ? readCount(result.totalBills) : 0;
}

function historyAmountOf(result: Record<string, unknown> | null) {
  return result ? readMoney(result.totalAmount) : 0;
}

function historyBillsOf(result: Record<string, unknown> | null) {
  return result && Array.isArray(result.bills) ? result.bills : [];
}

function hasHistorySnapshot(result: Record<string, unknown> | null) {
  if (!result) return false;
  return (
    historyCountOf(result) > 0 ||
    historyAmountOf(result) > 0 ||
    historyBillsOf(result).length > 0
  );
}

function preferBetterHistory(
  primary: Record<string, unknown>,
  candidate: Record<string, unknown>,
) {
  const primaryCount = historyCountOf(primary);
  const candidateCount = historyCountOf(candidate);
  if (candidateCount > primaryCount) return candidate;
  if (primaryCount > candidateCount) return primary;

  const primaryAmount = historyAmountOf(primary);
  const candidateAmount = historyAmountOf(candidate);
  if (candidateAmount > primaryAmount) return candidate;
  if (primaryAmount > candidateAmount) return primary;

  const primaryBills = historyBillsOf(primary).length;
  const candidateBills = historyBillsOf(candidate).length;
  if (candidateBills > primaryBills) return candidate;
  return primary;
}

function mergeLookupWithFallback(
  lookup: Record<string, unknown>,
  fallback: Record<string, unknown>,
) {
  const merged = { ...lookup };
  const mergedName = toTrimmedText(merged.name);
  const fallbackName = toTrimmedText(fallback.name);
  if (!mergedName && fallbackName) {
    merged.name = fallbackName;
  }

  if (historyCountOf(fallback) > historyCountOf(merged)) {
    merged.totalBills = historyCountOf(fallback);
  }
  if (historyAmountOf(fallback) > historyAmountOf(merged)) {
    merged.totalAmount = historyAmountOf(fallback);
  }
  if (historyBillsOf(fallback).length > historyBillsOf(merged).length) {
    merged.bills = historyBillsOf(fallback);
  }
  if (historyCountOf(merged) > 0 || historyAmountOf(merged) > 0) {
    merged.isNewCustomer = false;
  }
  return merged;
}

function shouldTryBillingFallback(lookupResult: Record<string, unknown>) {
  const totalBills = historyCountOf(lookupResult);
  const totalAmount = historyAmountOf(lookupResult);
  const loadedBills = historyBillsOf(lookupResult).length;
  const hasHistory = hasHistorySnapshot(lookupResult);
  const isNewCustomer = lookupResult.isNewCustomer === true;
  const resolvedName = toTrimmedText(lookupResult.name);

  if (!hasHistory) {
    return !(isNewCustomer && !resolvedName);
  }

  const hasPartialDocs = totalBills > loadedBills && loadedBills > 0;
  const hasMissingDocs = totalBills > 0 && loadedBills === 0;
  const hasMissingAmount = totalBills > 0 && totalAmount <= 0;
  return hasPartialDocs || hasMissingDocs || hasMissingAmount;
}

function parseLookupPreview(
  lookupData: Record<string, unknown>,
  normalizedPhone: string,
) {
  const nestedData = toMap(lookupData.data) ?? toMap(lookupData.result);
  const summaryMap = toMap(lookupData.summary) ?? toMap(nestedData?.summary);
  const statsMap = toMap(lookupData.stats) ?? toMap(nestedData?.stats);
  const historyMap =
    toMap(lookupData.history) ??
    toMap(nestedData?.history) ??
    toMap(summaryMap?.history) ??
    toMap(statsMap?.history);
  const bills = readBillsFromPayload(lookupData);

  let customerDoc =
    toMap(lookupData.customer) ??
    toMap(lookupData.customerDoc) ??
    toMap(lookupData.customerDetails) ??
    toMap(nestedData?.customer) ??
    toMap(nestedData?.customerDoc) ??
    toMap(nestedData?.customerDetails) ??
    toMap(summaryMap?.customer) ??
    toMap(summaryMap?.customerDoc) ??
    toMap(summaryMap?.customerDetails) ??
    toMap(historyMap?.customer) ??
    toMap(historyMap?.customerDoc) ??
    toMap(historyMap?.customerDetails) ??
    toMap(statsMap?.customer) ??
    toMap(statsMap?.customerDoc) ??
    toMap(statsMap?.customerDetails);

  if (!customerDoc) {
    const customerList = asList(
      lookupData.customers ??
        lookupData.customerDocs ??
        nestedData?.customers ??
        nestedData?.docs ??
        summaryMap?.customers ??
        summaryMap?.customerDocs ??
        historyMap?.customers ??
        historyMap?.customerDocs,
    );
    customerDoc = toMap(customerList[0]);
  }

  const directName = toTrimmedText(lookupData.name);
  const docName = toTrimmedText(customerDoc?.name);
  const firstBill = toMap(bills[0]);
  const firstBillCustomer = toMap(firstBill?.customerDetails);
  const billName = toTrimmedText(firstBillCustomer?.name);
  const resolvedName = directName || docName || billName;

  const meta = toMap(lookupData.meta);
  const pagination = toMap(lookupData.pagination);
  const nestedMeta = toMap(nestedData?.meta);
  const nestedPagination = toMap(nestedData?.pagination);
  const summaryMeta = toMap(summaryMap?.meta);
  const summaryPagination = toMap(summaryMap?.pagination);
  const statsSummary = toMap(statsMap?.summary);
  const customerHistoryMap = toMap(customerDoc?.history);
  const customerStatsMap = toMap(customerDoc?.stats);

  let totalBills = readFirstPositiveCount([
    lookupData.totalBills,
    lookupData.billCount,
    lookupData.count,
    lookupData.historyCount,
    lookupData.totalDocs,
    nestedData?.totalBills,
    nestedData?.billCount,
    nestedData?.count,
    nestedData?.historyCount,
    nestedData?.totalDocs,
    customerDoc?.totalBills,
    customerDoc?.billCount,
    customerDoc?.count,
    customerDoc?.historyCount,
    historyMap?.totalBills,
    historyMap?.billCount,
    historyMap?.count,
    historyMap?.historyCount,
    historyMap?.totalDocs,
    summaryMap?.totalBills,
    summaryMap?.billCount,
    summaryMap?.count,
    summaryMap?.historyCount,
    summaryMap?.totalDocs,
    statsMap?.totalBills,
    statsMap?.billCount,
    statsMap?.count,
    statsMap?.historyCount,
    statsMap?.totalDocs,
    customerHistoryMap?.totalBills,
    customerHistoryMap?.billCount,
    customerHistoryMap?.count,
    customerHistoryMap?.historyCount,
    customerHistoryMap?.totalDocs,
    customerStatsMap?.totalBills,
    customerStatsMap?.billCount,
    customerStatsMap?.count,
    customerStatsMap?.historyCount,
    customerStatsMap?.totalDocs,
    meta?.totalBills,
    meta?.billCount,
    meta?.count,
    meta?.totalDocs,
    pagination?.total,
    pagination?.totalDocs,
    nestedMeta?.totalBills,
    nestedMeta?.billCount,
    nestedMeta?.count,
    nestedMeta?.totalDocs,
    nestedPagination?.total,
    nestedPagination?.totalDocs,
    summaryMeta?.totalBills,
    summaryMeta?.billCount,
    summaryMeta?.count,
    summaryMeta?.totalDocs,
    summaryPagination?.total,
    summaryPagination?.totalDocs,
    statsSummary?.totalBills,
    statsSummary?.billCount,
    statsSummary?.count,
    statsSummary?.totalDocs,
  ]);
  if (totalBills <= 0) totalBills = bills.length;

  let totalAmount = readFirstPositiveMoney([
    lookupData.totalAmount,
    lookupData.totalSpent,
    lookupData.totalSpend,
    lookupData.spentAmount,
    lookupData.spent,
    lookupData.lifetimeSpend,
    lookupData.customerSpend,
    nestedData?.totalAmount,
    nestedData?.totalSpent,
    nestedData?.totalSpend,
    nestedData?.spentAmount,
    nestedData?.spent,
    nestedData?.lifetimeSpend,
    nestedData?.customerSpend,
    customerDoc?.totalAmount,
    customerDoc?.totalSpent,
    customerDoc?.spentAmount,
    customerDoc?.spent,
    customerDoc?.lifetimeSpend,
    customerHistoryMap?.totalAmount,
    customerHistoryMap?.totalSpent,
    customerHistoryMap?.spentAmount,
    customerHistoryMap?.spent,
    customerStatsMap?.totalAmount,
    customerStatsMap?.totalSpent,
    customerStatsMap?.spentAmount,
    customerStatsMap?.spent,
    historyMap?.totalAmount,
    historyMap?.totalSpent,
    historyMap?.spentAmount,
    historyMap?.spent,
    summaryMap?.totalAmount,
    summaryMap?.totalSpent,
    summaryMap?.spentAmount,
    summaryMap?.spent,
    statsMap?.totalAmount,
    statsMap?.totalSpent,
    statsMap?.spentAmount,
    statsMap?.spent,
    statsSummary?.totalAmount,
    statsSummary?.totalSpent,
    statsSummary?.spentAmount,
    statsSummary?.spent,
  ]);

  if (totalAmount <= 0 && bills.length > 0) {
    totalAmount = bills.reduce((sum, entry) => {
      const bill = toMap(entry);
      if (!bill) return sum;
      return (
        sum +
        readMoney(
          bill.totalAmount ??
            bill.grossAmount ??
            bill.finalAmount ??
            bill.subtotal ??
            bill.amount,
        )
      );
    }, 0);
  }

  const isNewCustomer =
    typeof lookupData.isNewCustomer === "boolean"
      ? lookupData.isNewCustomer
      : !customerDoc && totalBills === 0;

  return {
    name: resolvedName,
    phoneNumber: normalizedPhone,
    totalBills,
    totalAmount,
    isNewCustomer,
    orderType: "all",
    ...(bills.length > 0 ? { bills } : {}),
  } satisfies Record<string, unknown>;
}

function summarizeBills(rawBills: unknown[], limit: number) {
  return rawBills.slice(0, limit).map((entry) => {
    const bill = toMap(entry) ?? {};
    const details = toMap(bill.tableDetails);
    return {
      id:
        toTrimmedText(bill.id) ||
        toTrimmedText(bill._id) ||
        toTrimmedText(bill.invoiceNumber),
      invoiceNumber: toTrimmedText(bill.invoiceNumber),
      status: toTrimmedText(bill.status).toLowerCase() || "completed",
      paymentMethod: toTrimmedText(bill.paymentMethod).toLowerCase(),
      totalAmount: readMoney(
        bill.totalAmount ?? bill.grossAmount ?? bill.finalAmount ?? bill.amount,
      ),
      createdAt: toTrimmedText(bill.createdAt),
      tableNumber: toTrimmedText(details?.tableNumber),
      section: toTrimmedText(details?.section),
      customerName: toTrimmedText(toMap(bill.customerDetails)?.name),
    };
  });
}

async function requestLookupData({
  token,
  normalizedPhone,
  branchId,
  limit,
}: {
  token: string;
  normalizedPhone: string;
  branchId?: string;
  limit: number;
}) {
  const lookupQuery = new URLSearchParams({
    phoneNumber: normalizedPhone,
    limit: String(limit),
    includeCancelled: "false",
  });
  if (branchId) {
    lookupQuery.set("branchId", branchId);
  }

  const response = await fetch(`${API_BASE}/billing/customer-lookup?${lookupQuery}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const decoded = (await response.json()) as Record<string, unknown>;
  return decoded;
}

async function requestBillingHistoryFallback({
  token,
  normalizedPhone,
  branchId,
  limit,
}: {
  token: string;
  normalizedPhone: string;
  branchId?: string;
  limit: number;
}) {
  const possiblePhoneFields = [
    "customerDetails.phoneNumber",
    "customerDetails.phone",
    "customerPhone",
    "phoneNumber",
  ];

  const baseQuery: Record<string, string> = {
    sort: "-createdAt",
    limit: "100",
    depth: "0",
  };
  if (branchId) {
    baseQuery["where[branch][equals]"] = branchId;
  }

  for (const phoneField of possiblePhoneFields) {
    const query = { ...baseQuery, [`where[${phoneField}][equals]`]: normalizedPhone };
    const firstPageResponse = await fetch(
      `${API_BASE}/billings?${new URLSearchParams(query)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );
    if (!firstPageResponse.ok) {
      continue;
    }

    const payload = (await firstPageResponse.json()) as Record<string, unknown>;
    const collectedBills: Record<string, unknown>[] = [];
    const seenBillIds = new Set<string>();

    const addBills = (rawBills: unknown) => {
      for (const entry of extractBills(rawBills)) {
        const bill = toMap(entry);
        if (!bill) continue;
        const billId =
          toTrimmedText(bill.id) ||
          toTrimmedText(bill._id) ||
          toTrimmedText(bill.$oid) ||
          toTrimmedText(bill.invoiceNumber);
        if (billId && seenBillIds.has(billId)) continue;
        if (billId) seenBillIds.add(billId);
        collectedBills.push(bill);
      }
    };

    addBills(readBillsFromPayload(payload));

    const payloadData = toMap(payload.data) ?? toMap(payload.result);
    const payloadMeta = toMap(payload.meta);
    const payloadPagination = toMap(payload.pagination);
    const payloadDataMeta = toMap(payloadData?.meta);
    const payloadDataPagination = toMap(payloadData?.pagination);

    const totalBillsHint = readFirstPositiveCount([
      payload.totalBills,
      payload.billCount,
      payload.count,
      payload.historyCount,
      payload.totalDocs,
      payloadData?.totalBills,
      payloadData?.billCount,
      payloadData?.count,
      payloadData?.historyCount,
      payloadData?.totalDocs,
      payloadMeta?.totalBills,
      payloadMeta?.billCount,
      payloadMeta?.count,
      payloadMeta?.totalDocs,
      payloadPagination?.total,
      payloadPagination?.totalDocs,
      payloadDataMeta?.totalBills,
      payloadDataMeta?.billCount,
      payloadDataMeta?.count,
      payloadDataMeta?.totalDocs,
      payloadDataPagination?.total,
      payloadDataPagination?.totalDocs,
    ]);

    let totalPages = readFirstPositiveCount([
      payload.totalPages,
      payloadData?.totalPages,
      payloadMeta?.totalPages,
      payloadPagination?.totalPages,
      payloadDataMeta?.totalPages,
      payloadDataPagination?.totalPages,
    ]);
    if (totalPages <= 0 && totalBillsHint > 0) {
      totalPages = Math.ceil(totalBillsHint / 100);
    }
    if (totalPages < 1) totalPages = 1;

    const pagesToFetch = Math.min(totalPages, 10);
    for (let page = 2; page <= pagesToFetch; page += 1) {
      const pageQuery = { ...query, page: String(page) };
      const pageResponse = await fetch(
        `${API_BASE}/billings?${new URLSearchParams(pageQuery)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        },
      );
      if (!pageResponse.ok) {
        break;
      }
      const pagePayload = (await pageResponse.json()) as Record<string, unknown>;
      addBills(readBillsFromPayload(pagePayload));
    }

    const bills = collectedBills
      .filter((bill) => {
        const status = toTrimmedText(bill.status).toLowerCase();
        return status !== "cancelled" && status !== "canceled";
      })
      .sort((left, right) => {
        const leftDate = Date.parse(toTrimmedText(left.createdAt) || "1970-01-01");
        const rightDate = Date.parse(toTrimmedText(right.createdAt) || "1970-01-01");
        return rightDate - leftDate;
      });

    const totalAmount = bills.reduce((sum, bill) => {
      return (
        sum +
        readMoney(
          bill.totalAmount ?? bill.grossAmount ?? bill.finalAmount ?? bill.subtotal ?? bill.amount,
        )
      );
    }, 0);

    const totalBills = totalBillsHint > 0 ? totalBillsHint : bills.length;

    let resolvedName = toTrimmedText(payload.name);
    if (!resolvedName) {
      for (const bill of bills) {
        const customer = toMap(bill.customerDetails);
        const billName = toTrimmedText(customer?.name);
        if (billName) {
          resolvedName = billName;
          break;
        }
      }
    }

    const result: Record<string, unknown> = {
      name: resolvedName,
      phoneNumber: normalizedPhone,
      totalBills,
      totalAmount: Number(totalAmount.toFixed(2)),
      isNewCustomer: totalBills === 0,
      orderType: "all",
      ...(bills.length > 0 ? { bills: bills.slice(0, limit) } : {}),
    };

    if (hasHistorySnapshot(result) || resolvedName) {
      return result;
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const branchId = request.nextUrl.searchParams.get("branchId")?.trim() ?? "";
    const phoneNumber =
      request.nextUrl.searchParams.get("phoneNumber")?.replaceAll(/\D/g, "") ?? "";
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "20", 10) || 20),
    );

    if (phoneNumber.length < 10) {
      return Response.json({ message: "Enter a valid phone number" }, { status: 400 });
    }

    const token =
      process.env.BLACKFOREST_API_TOKEN?.trim() ||
      process.env.BLACKFOREST_BILLING_TOKEN?.trim() ||
      process.env.BLACKFOREST_API_BEARER_TOKEN?.trim() ||
      "";

    if (!token) {
      return Response.json(
        {
          message:
            "Customer lookup is not enabled yet. Add BLACKFOREST_API_TOKEN in Vercel so the website can read customer details.",
        },
        { status: 503 },
      );
    }

    const scopedLookup = await requestLookupData({
      token,
      normalizedPhone: phoneNumber,
      branchId: branchId || undefined,
      limit,
    });

    let preferredResult: Record<string, unknown> = scopedLookup
      ? parseLookupPreview(scopedLookup, phoneNumber)
      : ({
          name: "",
          phoneNumber,
          totalBills: 0,
          totalAmount: 0,
          isNewCustomer: true,
          orderType: "all",
        } satisfies Record<string, unknown>);

    if (branchId) {
      const globalLookup = await requestLookupData({
        token,
        normalizedPhone: phoneNumber,
        limit,
      });
      if (globalLookup) {
        preferredResult = preferBetterHistory(
          preferredResult,
          parseLookupPreview(globalLookup, phoneNumber),
        );
      }
    }

    if (shouldTryBillingFallback(preferredResult)) {
      const scopedFallback = await requestBillingHistoryFallback({
        token,
        normalizedPhone: phoneNumber,
        branchId: branchId || undefined,
        limit,
      });

      let bestFallback = scopedFallback;
      if (branchId) {
        const globalFallback = await requestBillingHistoryFallback({
          token,
          normalizedPhone: phoneNumber,
          limit,
        });
        if (globalFallback) {
          bestFallback = bestFallback
            ? preferBetterHistory(bestFallback, globalFallback)
            : globalFallback;
        }
      }

      if (bestFallback) {
        preferredResult = mergeLookupWithFallback(preferredResult, bestFallback);
      }
    }

    return Response.json({
      name: toTrimmedText(preferredResult.name),
      phoneNumber,
      totalBills: historyCountOf(preferredResult),
      totalAmount: historyAmountOf(preferredResult),
      isNewCustomer: preferredResult.isNewCustomer === true,
      bills: summarizeBills(historyBillsOf(preferredResult), limit),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch customer details";
    return Response.json({ message }, { status: 500 });
  }
}
