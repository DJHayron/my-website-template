import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "@/lib/admin/origin";
import { canMutateArticle, getUpdateMutation } from "@/lib/admin/policy";

describe("admin RBAC", () => {
  it("allows admins to control the complete article lifecycle", () => {
    expect(canMutateArticle("admin", "create-published")).toBe(true);
    expect(canMutateArticle("admin", "update-published")).toBe(true);
    expect(canMutateArticle("admin", "archive")).toBe(true);
  });

  it("limits editors to draft creation and draft updates", () => {
    expect(canMutateArticle("editor", "create-draft")).toBe(true);
    expect(canMutateArticle("editor", "update-draft")).toBe(true);
    expect(canMutateArticle("editor", "create-published")).toBe(false);
    expect(canMutateArticle("editor", "update-published")).toBe(false);
    expect(canMutateArticle("editor", "archive")).toBe(false);
    expect(getUpdateMutation(true, false)).toBe("update-published");
    expect(getUpdateMutation(false, true)).toBe("update-published");
  });
});

describe("same-origin protection", () => {
  it("accepts the request URL origin and explicit trusted origins", () => {
    expect(
      isSameOriginRequest(
        new Request("https://portfolio.example.com/api/admin/posts", {
          headers: { origin: "https://portfolio.example.com" },
          method: "POST",
        }),
      ),
    ).toBe(true);

    expect(
      isSameOriginRequest(
        new Request("http://localhost:3000/api/admin/posts", {
          headers: {
            host: "127.0.0.1:3000",
            origin: "http://127.0.0.1:3000",
          },
          method: "POST",
        }),
      ),
    ).toBe(true);

    expect(
      isSameOriginRequest(
        new Request("http://internal:3000/api/admin/posts", {
          headers: { origin: "https://portfolio.example.com" },
          method: "POST",
        }),
        new Set(["https://portfolio.example.com"]),
      ),
    ).toBe(true);
  });

  it("rejects missing, malformed, and cross-site origins", () => {
    expect(isSameOriginRequest(new Request("https://portfolio.example.com/api/admin/posts"))).toBe(
      false,
    );
    expect(
      isSameOriginRequest(
        new Request("https://portfolio.example.com/api/admin/posts", {
          headers: { origin: "https://attacker.example" },
          method: "POST",
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginRequest(
        new Request("https://portfolio.example.com/api/admin/posts", {
          headers: {
            origin: "https://portfolio.example.com",
            "sec-fetch-site": "cross-site",
          },
          method: "POST",
        }),
      ),
    ).toBe(false);
  });
});
