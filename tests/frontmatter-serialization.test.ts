import { describe, expect, it } from "vitest";
import {
  parseFrontmatter,
  patchFrontmatter,
  serializeFrontmatter,
} from "@/lib/content/frontmatter";

describe("front matter serialization", () => {
  it("round-trips supported values and preserves unknown fields", () => {
    const source = serializeFrontmatter(
      {
        customFlag: true,
        date: "2026-07-31",
        featuredRank: 2,
        published: false,
        summary: "包含冒號: 與引號 \" 的摘要",
        tags: ["Next.js", "CMS"],
        title: "後台實作紀錄",
      },
      "## 內容\n\n這是正文。",
    );
    const parsed = parseFrontmatter(source);

    expect(parsed.data).toEqual({
      customFlag: true,
      date: "2026-07-31",
      featuredRank: 2,
      published: false,
      summary: "包含冒號: 與引號 \" 的摘要",
      tags: ["Next.js", "CMS"],
      title: "後台實作紀錄",
    });
    expect(parsed.content.trim()).toBe("## 內容\n\n這是正文。");
  });

  it("preserves top-level comments that follow a managed field", () => {
    const source = `---
# keep: before managed fields
title: Old title
# keep: between managed fields
date: 2026-07-31
summary: Old summary
tags:
  - CMS
published: false
# keep: after managed fields
---

Body
`;
    const updated = patchFrontmatter(
      source,
      {
        date: "2026-07-31",
        published: false,
        summary: "New summary",
        tags: ["CMS"],
        title: "New title",
      },
      "Body",
    );

    expect(updated).toContain("# keep: before managed fields");
    expect(updated).toContain("# keep: between managed fields");
    expect(updated).toContain("# keep: after managed fields");
  });

  it("preserves an indented managed-list comment without keeping old list items", () => {
    const source = `---
title: Commented tags
date: 2026-07-31
summary: Old summary
tags:
  # keep: tag guidance
  - Old
published: false
---

Body
`;
    const updated = patchFrontmatter(
      source,
      {
        date: "2026-07-31",
        published: false,
        summary: "New summary",
        tags: ["New"],
        title: "Commented tags",
      },
      "Body",
    );

    expect(updated).toContain("  # keep: tag guidance");
    expect(updated).toContain('  - "New"');
    expect(updated).not.toContain("  - Old");
  });
});
