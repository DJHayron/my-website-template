import { describe, expect, it } from "vitest";
import { formatAdminTagInput, parseAdminTagInput } from "@/lib/admin/tag-input";

describe("admin tag input", () => {
  it("round-trips tags containing commas without splitting them", () => {
    const tags = ["C, C++", "Next.js", "CMS"];

    expect(parseAdminTagInput(formatAdminTagInput(tags))).toEqual(tags);
  });

  it("trims blank lines without changing punctuation", () => {
    expect(parseAdminTagInput("  Security, Privacy  \r\n\r\nOperations ")).toEqual([
      "Security, Privacy",
      "Operations",
    ]);
  });
});
