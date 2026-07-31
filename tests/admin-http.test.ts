import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readJsonBody } from "@/lib/admin/http";
import {
  createArticleRequestSchema,
  previewArticleRequestSchema,
  updateArticleRequestSchema,
} from "@/lib/admin/schemas";

const schema = z.object({ value: z.string().min(1) }).strict();

describe("admin request parsing", () => {
  it("preserves significant leading Markdown indentation", () => {
    const content = "    first-line code\nnext";

    expect(previewArticleRequestSchema.parse({ content, slug: "code-sample" }).content).toBe(
      content,
    );
  });

  it("accepts an existing Unicode slug for the shared Markdown preview", () => {
    expect(
      previewArticleRequestSchema.parse({ content: "## 模板", slug: "LeetCode/模板" }),
    ).toEqual({ content: "## 模板", slug: "LeetCode/模板" });
  });

  it("rejects line breaks inside a tag so the line-based editor is lossless", () => {
    const result = createArticleRequestSchema.safeParse({
      content: "Body",
      date: "2026-07-31",
      description: "Summary",
      published: false,
      slug: "tag-lines",
      tags: ["Line one\nLine two"],
      title: "Tag validation",
    });

    expect(result.success).toBe(false);
  });

  it("defaults legacy updates to manual mode and rejects unsupported modes", () => {
    const request = {
      content: "Body",
      date: "2026-07-31",
      description: "Summary",
      published: false,
      revision: "a".repeat(64),
      tags: ["CMS"],
      title: "Save mode validation",
    };

    expect(updateArticleRequestSchema.parse(request).saveMode).toBe("manual");
    expect(
      updateArticleRequestSchema.safeParse({ ...request, saveMode: "manual" }).success,
    ).toBe(true);
    expect(
      updateArticleRequestSchema.safeParse({ ...request, saveMode: "autosave" }).success,
    ).toBe(true);
    expect(
      updateArticleRequestSchema.safeParse({ ...request, saveMode: "background" }).success,
    ).toBe(false);
    expect(
      updateArticleRequestSchema.safeParse({
        ...request,
        saveMode: "manual",
        unexpected: true,
      }).success,
    ).toBe(false);
  });

  it("parses schema-validated JSON", async () => {
    const request = new Request("https://example.com/api/admin", {
      body: JSON.stringify({ value: "ok" }),
      headers: { "content-type": "application/json; charset=utf-8" },
      method: "POST",
    });

    await expect(readJsonBody(request, schema)).resolves.toEqual({ value: "ok" });
  });

  it("rejects unsupported content types, invalid values, and oversized bodies", async () => {
    const wrongType = new Request("https://example.com/api/admin", {
      body: "value=ok",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    await expect(readJsonBody(wrongType, schema)).rejects.toMatchObject({
      code: "unsupported_media_type",
      status: 415,
    });

    const invalid = new Request("https://example.com/api/admin", {
      body: JSON.stringify({ value: "" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    await expect(readJsonBody(invalid, schema)).rejects.toMatchObject({
      code: "validation_error",
      status: 422,
    });

    const oversized = new Request("https://example.com/api/admin", {
      body: JSON.stringify({ value: "too large" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    await expect(readJsonBody(oversized, schema, 5)).rejects.toMatchObject({
      code: "request_too_large",
      status: 413,
    });
  });
});
