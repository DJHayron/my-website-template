import { AdminApiError } from "@/lib/admin/http";

const WINDOW_MILLISECONDS = 15 * 60 * 1000;
const MAXIMUM_TRACKED_KEYS = 2_000;
const MAXIMUM_ACTIVE_HASHES = 4;
const MAXIMUM_QUEUED_HASHES = 20;

export type LoginAttemptBucket = {
  key: string;
  maximumFailures: number;
};

type Attempt = {
  failures: number;
  resetAt: number;
};

const attempts = new Map<string, Attempt>();
const hashWaiters: Array<() => void> = [];
let activeHashes = 0;

function prune(now: number) {
  for (const [key, attempt] of attempts) {
    if (attempt.resetAt <= now || attempts.size > MAXIMUM_TRACKED_KEYS) {
      attempts.delete(key);
    }
  }
}

function getClientAddress(request: Request, trustProxyHeaders: boolean) {
  if (!trustProxyHeaders) {
    return "direct-client";
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  const forwardedAddresses = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const address = realIp || forwardedAddresses?.at(-1) || "unknown-proxy-client";
  return address.slice(0, 128).replace(/[^A-Za-z0-9:._-]/g, "_");
}

export function getLoginAttemptBuckets(
  request: Request,
  username: string,
  trustProxyHeaders: boolean,
): LoginAttemptBucket[] {
  const address = getClientAddress(request, trustProxyHeaders);
  const identity = username.trim().toLocaleLowerCase("en-US");

  if (!trustProxyHeaders) {
    return [
      { key: "client:direct-client", maximumFailures: 100 },
      { key: `identity:${identity}`, maximumFailures: 100 },
    ];
  }

  return [
    { key: `client:${address}`, maximumFailures: 30 },
    { key: `credential:${address}:${identity}`, maximumFailures: 5 },
    { key: `identity:${identity}`, maximumFailures: 100 },
  ];
}

export function assertLoginAllowed(buckets: readonly LoginAttemptBucket[], now = Date.now()) {
  prune(now);
  let retryAfterSeconds = 0;

  for (const bucket of buckets) {
    const attempt = attempts.get(bucket.key);

    if (attempt && attempt.failures >= bucket.maximumFailures && attempt.resetAt > now) {
      retryAfterSeconds = Math.max(
        retryAfterSeconds,
        Math.ceil((attempt.resetAt - now) / 1_000),
      );
    }
  }

  if (retryAfterSeconds > 0) {
    throw new AdminApiError(
      429,
      "too_many_attempts",
      "登入失敗次數過多，請稍後再試。",
      { retryAfterSeconds },
    );
  }
}

export function recordLoginFailure(buckets: readonly LoginAttemptBucket[], now = Date.now()) {
  for (const bucket of buckets) {
    const current = attempts.get(bucket.key);

    if (!current || current.resetAt <= now) {
      attempts.set(bucket.key, { failures: 1, resetAt: now + WINDOW_MILLISECONDS });
    } else {
      attempts.set(bucket.key, { ...current, failures: current.failures + 1 });
    }
  }
}

export function clearLoginFailures(buckets: readonly LoginAttemptBucket[]) {
  buckets
    .filter((bucket) => !bucket.key.startsWith("client:"))
    .forEach((bucket) => attempts.delete(bucket.key));
}

export async function withLoginHashSlot<T>(task: () => Promise<T>) {
  if (activeHashes >= MAXIMUM_ACTIVE_HASHES) {
    if (hashWaiters.length >= MAXIMUM_QUEUED_HASHES) {
      throw new AdminApiError(429, "login_busy", "登入服務忙碌中，請稍後再試。");
    }

    await new Promise<void>((resolve) => hashWaiters.push(resolve));
  }

  activeHashes += 1;

  try {
    return await task();
  } finally {
    activeHashes -= 1;
    hashWaiters.shift()?.();
  }
}

export function resetLoginLimiterForTests() {
  attempts.clear();
}
