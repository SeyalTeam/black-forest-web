import { NextRequest } from "next/server";
import { COOKIE_ADMIN_TOKEN_KEY } from "@/components/branch-session";
import { API_BASE, fetchCurrentUser, readResponseMessage } from "@/lib/admin-auth";

type DynamicMap = Record<string, unknown>;

export const runtime = "nodejs";

function toTrimmedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toMap(value: unknown): DynamicMap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as DynamicMap;
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
}

function toBool(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["true", "1", "yes", "enabled", "on"].includes(normalized);
  }
  return false;
}

function extractRefId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return value.toString().trim();
  }

  const map = toMap(value);
  if (!map) return "";
  const candidates = [
    map.id,
    map._id,
    map.$oid,
    map.value,
    map.categoryId,
    map.category,
  ];

  for (const candidate of candidates) {
    const id = extractRefId(candidate);
    if (id) return id;
  }
  return "";
}

function looksLikeObjectId(value: string) {
  return /^[a-f0-9]{24}$/i.test(value.trim());
}

function ruleMatchesBranch(branchesNode: unknown, branchId: string) {
  const normalizedBranchId = branchId.trim();
  if (!normalizedBranchId) return false;

  const candidates = toArray(branchesNode);
  if (candidates.length === 0) {
    return false;
  }

  for (const candidate of candidates) {
    if (extractRefId(candidate) === normalizedBranchId) {
      return true;
    }
  }

  return false;
}

function reorderRuleCategories(
  categoriesNode: unknown,
  orderRank: Map<string, number>,
) {
  const original = toArray(categoriesNode);
  const originalIds = original.map((category) => extractRefId(category));

  const next = [...original].sort((left, right) => {
    const leftId = extractRefId(left);
    const rightId = extractRefId(right);
    const leftRank = orderRank.get(leftId);
    const rightRank = orderRank.get(rightId);

    if (leftRank === undefined && rightRank === undefined) {
      return 0;
    }
    if (leftRank === undefined) {
      return 1;
    }
    if (rightRank === undefined) {
      return -1;
    }

    return leftRank - rightRank;
  });

  const nextIds = next.map((category) => extractRefId(category));
  const changed =
    originalIds.length !== nextIds.length ||
    originalIds.some((id, index) => id !== nextIds[index]);

  return { changed, categories: next };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      branchId?: string;
      orderedCategoryIds?: string[];
    };

    const sessionToken = toTrimmedText(request.cookies.get(COOKIE_ADMIN_TOKEN_KEY)?.value);
    if (!sessionToken) {
      return Response.json(
        { message: "Admin login required. Open /admin and try again." },
        { status: 403 },
      );
    }
    const currentUser = await fetchCurrentUser(sessionToken);
    if (!currentUser.ok || !currentUser.isSuperAdmin) {
      return Response.json(
        { message: "Only superadmin is allowed for admin mode." },
        { status: 403 },
      );
    }

    const branchId = toTrimmedText(body.branchId);
    if (!branchId) {
      return Response.json({ message: "Branch id is required" }, { status: 400 });
    }

    const orderedCategoryIds = (Array.isArray(body.orderedCategoryIds)
      ? body.orderedCategoryIds
      : []
    )
      .map((value) => toTrimmedText(value))
      .filter((value) => value.length > 0);

    if (orderedCategoryIds.length === 0) {
      return Response.json(
        { message: "At least one category id is required" },
        { status: 400 },
      );
    }

    const settingsResponse = await fetch(`${API_BASE}/globals/widget-settings?depth=0`, {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
      cache: "no-store",
    });
    if (!settingsResponse.ok) {
      const message = await readResponseMessage(settingsResponse);
      return Response.json(
        { message: `Failed to read widget settings: ${message}` },
        { status: settingsResponse.status },
      );
    }

    const settings = (await settingsResponse.json()) as DynamicMap;
    const settingsId = toTrimmedText(settings.id);
    if (!looksLikeObjectId(settingsId)) {
      return Response.json(
        { message: "Failed to read widget settings id." },
        { status: 500 },
      );
    }

    const rules = toArray(settings.favoriteCategoriesByBranchRules);
    if (rules.length === 0) {
      return Response.json({ ok: true, updated: false, message: "No favorite rules found" });
    }

    const orderRank = new Map<string, number>();
    orderedCategoryIds.forEach((categoryId, index) => {
      if (!orderRank.has(categoryId)) {
        orderRank.set(categoryId, index);
      }
    });

    let touchedRules = 0;
    let changedRules = 0;

    const updatedRules = rules.map((rawRule) => {
      const rule = toMap(rawRule);
      if (!rule) {
        return rawRule;
      }
      if (!toBool(rule.enabled)) {
        return rawRule;
      }
      if (
        !ruleMatchesBranch(
          rule.branches ?? rule.branchesIds ?? rule.branchIds ?? rule.branch,
          branchId,
        )
      ) {
        return rawRule;
      }

      const targetKey = Array.isArray(rule.categories)
        ? "categories"
        : Array.isArray(rule.category)
          ? "category"
          : "categories";
      const { changed, categories } = reorderRuleCategories(rule[targetKey], orderRank);
      touchedRules += 1;
      if (!changed) {
        return rawRule;
      }

      changedRules += 1;
      return {
        ...rule,
        [targetKey]: categories,
      };
    });

    if (changedRules === 0) {
      return Response.json({
        ok: true,
        updated: false,
        touchedRules,
        message: "Favorite category order already matches",
      });
    }

    const updateResponse = await fetch(
      `${API_BASE}/globals/widget-settings/${settingsId}?depth=0`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          favoriteCategoriesByBranchRules: updatedRules,
        }),
        cache: "no-store",
      },
    );

    if (!updateResponse.ok) {
      const message = await readResponseMessage(updateResponse);
      return Response.json(
        { message: `Failed to save favorite order: ${message}` },
        { status: updateResponse.status },
      );
    }

    return Response.json({
      ok: true,
      updated: true,
      touchedRules,
      changedRules,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update favorite category order";
    return Response.json({ message }, { status: 500 });
  }
}
