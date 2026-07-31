import { beforeEach, describe, expect, it } from "vitest";
import {
  assertLoginAllowed,
  getLoginAttemptBuckets,
  recordLoginFailure,
  resetLoginLimiterForTests,
} from "@/lib/admin/login-limiter";

beforeEach(() => {
  resetLoginLimiterForTests();
});

describe("admin login limiter", () => {
  it("limits an IP and username pair without globally locking the identity after five attempts", () => {
    const firstClient = new Request("https://example.com/login", {
      headers: { "x-real-ip": "203.0.113.10" },
    });
    const secondClient = new Request("https://example.com/login", {
      headers: { "x-real-ip": "203.0.113.11" },
    });
    const firstBuckets = getLoginAttemptBuckets(firstClient, "admin@example.com", true);
    const secondBuckets = getLoginAttemptBuckets(secondClient, "admin@example.com", true);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      recordLoginFailure(firstBuckets, 1_000);
    }

    expect(() => assertLoginAllowed(firstBuckets, 1_001)).toThrowError(
      expect.objectContaining({ code: "too_many_attempts", status: 429 }),
    );
    expect(() => assertLoginAllowed(secondBuckets, 1_001)).not.toThrow();
  });

  it("ignores spoofable proxy headers unless proxy trust is explicit", () => {
    const first = getLoginAttemptBuckets(
      new Request("https://example.com/login", { headers: { "x-real-ip": "198.51.100.1" } }),
      "admin@example.com",
      false,
    );
    const second = getLoginAttemptBuckets(
      new Request("https://example.com/login", { headers: { "x-real-ip": "198.51.100.2" } }),
      "admin@example.com",
      false,
    );

    expect(first[0].key).toBe("client:direct-client");
    expect(second[0].key).toBe(first[0].key);
    expect(first).toHaveLength(2);
    expect(first.every((bucket) => bucket.maximumFailures === 100)).toBe(true);
  });
});
