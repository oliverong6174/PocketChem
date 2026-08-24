export function readStringOption<T extends string>(
  options: Record<string, unknown> | undefined,
  key: string,
  allowed: readonly T[],
  fallback?: T
): T | null {
  const value = options?.[key];

  if (typeof value === "string" && allowed.includes(value as T)) {
    return value as T;
  }

  return fallback ?? null;
}

export function readPositiveIntegerOption(
  options: Record<string, unknown> | undefined,
  key: string,
  fallback?: number
): number | undefined {
  const value = options?.[key];

  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  return fallback;
}

export function warnUnsupportedHandlerMode(
  handler: string,
  options?: Record<string, unknown>
): void {
  console.warn(`${handler} handler missing or unsupported mode:`, options);
}
