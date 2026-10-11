const TRUTHY_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);

function toBool(value: string | undefined, defaultValue = true) {
  if (value === undefined) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return TRUTHY_VALUES.has(normalized);
}

export const BILLING_ENABLED = toBool(process.env.NEXT_PUBLIC_ENABLE_BILLING, true);
export const BILLING_DISABLED_MESSAGE = "Billing is currently disabled.";
