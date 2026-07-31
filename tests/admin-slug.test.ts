import { describe, expect, it } from "vitest";
import { getAdminArticleApiPath } from "@/lib/admin/article-url";
import {
  assertSafeArticleRoutePath,
  parseArticleSlug,
  parseExistingArticleSlug,
} from "@/lib/admin/articles/slug";

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

  it.each([
    ["CaseStudy", ["CaseStudy"]],
    ["LeetCodeEssential150/1.TwoSums", ["LeetCodeEssential150", "1.TwoSums"]],
    ["8.StringToInteger(atoi)", ["8.StringToInteger(atoi)"]],
    ["LeetCode/模板", ["LeetCode", "模板"]],
    ["155.Min Stack", ["155.Min Stack"]],
    ["legacy_name/question#1", ["legacy_name", "question#1"]],
  ])("preserves safe existing slug %s", (slug, pathSegments) => {
    expect(parseExistingArticleSlug(slug)).toEqual({ pathSegments, slug });
  });

  it.each([
    "",
    ".",
    "..",
    "posts/../secret",
    "three/levels/deep",
    " path",
    "path ",
    "path\\escape",
    "encoded%2fseparator",
    "encoded%252fseparator",
    "question?",
    "trailing.",
    "con.txt",
    "series/LPT1",
    "control\u0000character",
    "a".repeat(256),
  ])("rejects unsafe existing slug %s", (slug) => {
    expect(() => parseExistingArticleSlug(slug)).toThrowError(
      expect.objectContaining({ code: "invalid_slug", status: 400 }),
    );
  });

  it.each([
    "https://example.com/api/admin/posts/CaseStudy",
    "https://example.com/api/admin/posts/LeetCode/%E6%A8%A1%E6%9D%BF",
    "https://example.com/api/admin/posts/155.Min%20Stack",
    "https://example.com/api/admin/posts/8.StringToInteger%28atoi%29",
  ])("accepts an unambiguous encoded legacy API path %s", (url) => {
    expect(() => assertSafeArticleRoutePath(new Request(url))).not.toThrow();
  });

  it.each([
    "https://example.com/api/admin/posts/series%2Fsecret",
    "https://example.com/api/admin/posts/series%5Csecret",
    "https://example.com/api/admin/posts/encoded%252fseparator",
    "https://example.com/api/admin/posts/%2e%2e",
    "https://example.com/api/admin/posts/three/levels/deep",
    "https://example.com/not-api/admin/posts/release-notes",
  ])("rejects an ambiguous or unsafe encoded API path %s", (url) => {
    expect(() => assertSafeArticleRoutePath(new Request(url))).toThrowError(
      expect.objectContaining({ code: "invalid_slug" }),
    );
  });

  it.each([
    ["CaseStudy", "/api/admin/posts/CaseStudy"],
    ["LeetCode/模板", "/api/admin/posts/LeetCode/%E6%A8%A1%E6%9D%BF"],
    ["155.Min Stack", "/api/admin/posts/155.Min%20Stack"],
    ["8.StringToInteger(atoi)", "/api/admin/posts/8.StringToInteger%28atoi%29"],
    ["legacy/question#1", "/api/admin/posts/legacy/question%231"],
  ])("encodes existing slug %s segment by segment", (slug, expected) => {
    expect(getAdminArticleApiPath(slug)).toBe(expected);
  });
});
