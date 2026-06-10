const API_BASE = "https://blackforest.vseyal.com/api";

type DynamicMap = Record<string, unknown>;

function toMap(value: unknown): DynamicMap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as DynamicMap;
}

function toTrimmedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeRole(value: string) {
  return value.toLowerCase().replace(/[\s_-]/g, "");
}

function isSuperAdminText(value: string) {
  const normalized = normalizeRole(value.trim());
  return normalized === "superadmin" || normalized.includes("superadmin");
}

export function hasSuperAdminAccess(user: unknown): boolean {
  const scan = (node: unknown, keyHint = ""): boolean => {
    if (!node) return false;

    if (typeof node === "string") {
      if (!node.trim()) return false;

      const normalizedHint = normalizeKey(keyHint);
      if (
        normalizedHint.includes("role") ||
        normalizedHint.includes("permission") ||
        normalizedHint.includes("access") ||
        normalizedHint.includes("type") ||
        normalizedHint.includes("admin")
      ) {
        return isSuperAdminText(node);
      }

      return isSuperAdminText(node);
    }

    if (typeof node === "boolean") {
      const normalizedHint = normalizeKey(keyHint);
      if (
        normalizedHint === "issuperadmin" ||
        normalizedHint === "superadmin"
      ) {
        return node;
      }
      return false;
    }

    if (Array.isArray(node)) {
      return node.some((entry) => scan(entry, keyHint));
    }

    const map = toMap(node);
    if (!map) {
      return false;
    }

    for (const [key, value] of Object.entries(map)) {
      if (scan(value, key)) {
        return true;
      }
    }

    return false;
  };

  return scan(user);
}

export async function readResponseMessage(response: Response) {
  const raw = await response.text();
  try {
    const parsed = JSON.parse(raw) as {
      message?: string;
      errors?: Array<{
        message?: string;
      }>;
    };
    return parsed.message || parsed.errors?.[0]?.message || raw || "Request failed";
  } catch {
    return raw || "Request failed";
  }
}

export async function fetchCurrentUser(apiToken: string) {
  const token = toTrimmedText(apiToken);
  if (!token) {
    return {
      ok: false,
      isSuperAdmin: false,
      user: null as DynamicMap | null,
      message: "Missing authentication token.",
    };
  }

  const response = await fetch(`${API_BASE}/users/me?depth=0`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return {
      ok: false,
      isSuperAdmin: false,
      user: null as DynamicMap | null,
      message: await readResponseMessage(response),
    };
  }

  const payload = (await response.json()) as {
    user?: unknown;
    message?: string;
  };
  const user = toMap(payload.user);

  if (!user) {
    return {
      ok: false,
      isSuperAdmin: false,
      user: null as DynamicMap | null,
      message: payload.message || "User session is not valid.",
    };
  }

  return {
    ok: true,
    isSuperAdmin: hasSuperAdminAccess(user),
    user,
    message: "",
  };
}

export { API_BASE };
