import { describe, expect, it } from "vitest";
import { assertUnencodedArticlePath, parseArticleSlug } from "@/lib/admin/articles/slug";

describe("admin article slugs", () => {
  it.each([
    ["release-notes", ["release-notes"]],
    ["engineering/release-notes", ["engineering", "release-notes"]],
  ])("accepts canonical slug %s", (slug, pathSegments) => {
    expect(parseArticleSlug(slug)).toEqual({ pathSegments, slug });
  });

  it.each([
    "",
    ".",
    "..",
    "posts/../secret",
    "three/levels/deep",
    "Uppercase",
    "has space",
    "中文",
    "path\\escape",
    "encoded%2fseparator",
    "encoded%252fseparator",
    "con",
    "series/lpt1",
    `${"a".repeat(65)}`,
  ])("rejects unsafe slug %s", (slug) => {
    expect(() => parseArticleSlug(slug)).toThrowError(
      expect.objectContaining({ code: "invalid_slug", status: 400 }),
    );
  });

  it("rejects encoded route path segments before decoded params are trusted", () => {
    expect(() =>
      assertUnencodedArticlePath(
        new Request("https://example.com/api/admin/posts/series%2Fsecret"),
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_slug" }));
  });
});
