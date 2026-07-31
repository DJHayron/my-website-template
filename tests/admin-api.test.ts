import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/admin/auth/login/route";
import { POST as logout } from "@/app/api/admin/auth/logout/route";
import { GET as getSession } from "@/app/api/admin/session/route";
import { POST as preview } from "@/app/api/admin/preview/route";
import { GET as listPosts } from "@/app/api/admin/posts/route";
import { GET as getPost } from "@/app/api/admin/posts/[...slug]/route";
import { resetLoginLimiterForTests } from "@/lib/admin/login-limiter";
import { hashPassword } from "@/lib/admin/password";

const origin = "http://localhost:3000";
let passwordHash = "";

function jsonRequest(pathname: string, body: unknown, cookie?: string) {
  return new Request(`${origin}${pathname}`, {
    body: JSON.stringify(body),
    headers: {
      ...(cookie ? { cookie } : {}),
      "content-type": "application/json",
      origin,
    },
    method: "POST",
  });
}

async function loginSuccessfully() {
  const response = await login(
    jsonRequest("/api/admin/auth/login", {
      password: "correct horse battery staple",
      username: "editor@example.com",
    }),
  );
  const setCookie = response.headers.get("set-cookie") ?? "";
  return { cookie: setCookie.split(";", 1)[0], response, setCookie };
}

beforeAll(async () => {
  passwordHash = await hashPassword(
    "correct horse battery staple",
    Buffer.from("api-test-salt-123"),
  );
});

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("ADMIN_JWT_SECRET", "api-test-secret-that-is-longer-than-thirty-two-bytes");
  vi.stubEnv(
    "ADMIN_USERS_JSON",
    JSON.stringify([
      {
        displayName: "編輯測試帳號",
        passwordHash,
        role: "editor",
        username: "editor@example.com",
      },
    ]),
  );
  resetLoginLimiterForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin auth API", () => {
  it("logs in, reads the current session, and logs out with hardened cookies", async () => {
    const { cookie, response, setCookie } = await loginSuccessfully();
    expect(response.status).toBe(200);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=strict");
    expect(setCookie).not.toContain("Secure");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const sessionResponse = await getSession(
      new Request(`${origin}/api/admin/session`, { headers: { cookie } }),
    );
    await expect(sessionResponse.json()).resolves.toMatchObject({
      data: {
        user: {
          role: "editor",
          username: "editor@example.com",
        },
      },
      ok: true,
    });

    const logoutResponse = await logout(
      new Request(`${origin}/api/admin/auth/logout`, {
        headers: { cookie, origin },
        method: "POST",
      }),
    );
    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("returns a generic error for invalid credentials and rejects cross-origin login", async () => {
    const invalid = await login(
      jsonRequest("/api/admin/auth/login", {
        password: "this password is not correct",
        username: "editor@example.com",
      }),
    );
    expect(invalid.status).toBe(401);
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: "invalid_credentials" },
      ok: false,
    });

    const crossOrigin = await login(
      new Request(`${origin}/api/admin/auth/login`, {
        body: JSON.stringify({
          password: "correct horse battery staple",
          username: "editor@example.com",
        }),
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
        },
        method: "POST",
      }),
    );
    expect(crossOrigin.status).toBe(403);
  });

  it("fails closed without valid server configuration", async () => {
    vi.stubEnv("ADMIN_JWT_SECRET", "short");
    const response = await login(
      jsonRequest("/api/admin/auth/login", {
        password: "correct horse battery staple",
        username: "editor@example.com",
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "admin_unavailable",
        message: "後台尚未完成安全設定。",
      },
      ok: false,
    });
  });
});

describe("protected admin API", () => {
  it("does not expose the article list without a session", async () => {
    const response = await listPosts(new Request(`${origin}/api/admin/posts`));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("uses the existing sanitized Markdown renderer for preview", async () => {
    const { cookie } = await loginSuccessfully();
    const response = await preview(
      jsonRequest(
        "/api/admin/preview",
        {
          content:
            "# 安全預覽\n\n<script>alert('xss')</script>\n\n[危險連結](javascript:alert('xss'))",
          slug: "safe-preview",
        },
        cookie,
      ),
    );
    const payload = (await response.json()) as { data: { html: string }; ok: true };

    expect(response.status).toBe(200);
    expect(payload.data.html).toContain("安全預覽");
    expect(payload.data.html).not.toContain("<script");
    expect(payload.data.html).not.toContain("javascript:");
  });

  it("returns a revision-only heartbeat view and rejects unknown views", async () => {
    const { cookie } = await loginSuccessfully();
    const context = { params: Promise.resolve({ slug: ["benchmark-notes"] }) };
    const heartbeat = await getPost(
      new Request(`${origin}/api/admin/posts/benchmark-notes?view=revision`, {
        headers: { cookie },
      }),
      context,
    );
    const payload = (await heartbeat.json()) as {
      data: { revision: string; updatedAt: string };
      ok: true;
    };

    expect(heartbeat.status).toBe(200);
    expect(Object.keys(payload.data).sort()).toEqual(["revision", "updatedAt"]);
    expect(payload.data.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(Number.isNaN(Date.parse(payload.data.updatedAt))).toBe(false);

    const invalid = await getPost(
      new Request(`${origin}/api/admin/posts/benchmark-notes?view=unknown`, {
        headers: { cookie },
      }),
      context,
    );

    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: "invalid_view" },
      ok: false,
    });
  });
});
