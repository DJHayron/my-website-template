import { describe, expect, it } from "vitest";
import { formatAdminUpdatedAt } from "@/lib/admin/date";

describe("admin date formatting", () => {
  it("formats an article update timestamp without incompatible Intl options", () => {
    expect(formatAdminUpdatedAt("2026-07-31T12:34:56.000Z")).not.toHaveLength(0);
  });
});
