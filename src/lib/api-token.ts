const TOKEN_MAP_ENV_KEY = "BLACKFOREST_BRANCH_API_TOKENS";

let cachedTokenMapRaw = "";
let cachedTokenMap = new Map<string, string>();

function toTrimmedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseTokenMap(raw: string) {
  const tokenMap = new Map<string, string>();
  const trimmedRaw = raw.trim();
  if (!trimmedRaw) {
    return tokenMap;
  }

  try {
    const parsed = JSON.parse(trimmedRaw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [branchId, tokenValue] of Object.entries(parsed as Record<string, unknown>)) {
        const normalizedBranchId = toTrimmedText(branchId);
        const normalizedToken = toTrimmedText(tokenValue);
        if (normalizedBranchId && normalizedToken) {
          tokenMap.set(normalizedBranchId, normalizedToken);
        }
      }
      return tokenMap;
    }
  } catch {
    // Fall back to line/comma separated parsing below.
  }

  const entries = trimmedRaw.split(/[\r\n,]+/);
  for (const entry of entries) {
    const normalizedEntry = entry.trim();
    if (!normalizedEntry) continue;

    const separatorIndex = normalizedEntry.search(/[=:]/);
    if (separatorIndex <= 0) continue;

    const branchId = normalizedEntry.slice(0, separatorIndex).trim().replace(/^['"]|['"]$/g, "");
    const token = normalizedEntry.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (branchId && token) {
      tokenMap.set(branchId, token);
    }
  }

  return tokenMap;
}

function readTokenMap() {
  const raw = process.env[TOKEN_MAP_ENV_KEY]?.trim() ?? "";
  if (raw === cachedTokenMapRaw) {
    return cachedTokenMap;
  }

  cachedTokenMapRaw = raw;
  cachedTokenMap = parseTokenMap(raw);
  return cachedTokenMap;
}

function readDefaultToken() {
  return (
    process.env.BLACKFOREST_API_TOKEN?.trim() ||
    process.env.BLACKFOREST_BILLING_TOKEN?.trim() ||
    process.env.BLACKFOREST_API_BEARER_TOKEN?.trim() ||
    ""
  );
}

export function resolveApiTokenForBranch(branchId?: string) {
  const normalizedBranchId = toTrimmedText(branchId);
  if (normalizedBranchId) {
    const tokenFromMap = readTokenMap().get(normalizedBranchId);
    if (tokenFromMap) {
      return tokenFromMap;
    }
  }

  return readDefaultToken();
}
