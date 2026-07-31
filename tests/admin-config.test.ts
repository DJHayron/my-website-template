import { describe, expect, it } from "vitest";
import { AdminConfigurationError, loadAdminConfig } from "@/lib/admin/config";

const encodedHash = `scrypt$16384$8$5$${Buffer.alloc(16, 1).toString("base64url")}$${Buffer.alloc(64, 2).toString("base64url")}`;

function createEnvironment(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ADMIN_JWT_SECRET: "a-secure-test-key-with-more-than-32-bytes",
    ADMIN_USERS_JSON: JSON.stringify([
      {
        displayName: "內容管理員",
        passwordHash: encodedHash,
        role: "admin",
        username: "Admin@example.com",
      },
    ]),
    NODE_ENV: "test",
  };

  return Object.assign(environment, overrides);
}

describe("admin configuration", () => {
  it("normalizes the whitelist and applies safe defaults", () => {
    const config = loadAdminConfig(createEnvironment());

    expect(config.users.get("admin@example.com")).toMatchObject({
      displayName: "內容管理員",
      role: "admin",
      username: "admin@example.com",
    });
    expect(config.tokenTtlSeconds).toBe(3_600);
    expect(config.secureCookies).toBe(false);
    expect(config.writeEnabled).toBe(true);
    expect(config.trustProxyHeaders).toBe(false);
  });

  it("fails closed when required values are missing or weak", () => {
    expect(() => loadAdminConfig(createEnvironment({ ADMIN_JWT_SECRET: "short" }))).toThrow(
      AdminConfigurationError,
    );
    expect(() => loadAdminConfig(createEnvironment({ ADMIN_USERS_JSON: "[]" }))).toThrow(
      AdminConfigurationError,
    );
    expect(() =>
      loadAdminConfig(
        createEnvironment({
          ADMIN_USERS_JSON: JSON.stringify([
            {
              passwordHash: "scrypt$999$1$1$YQ$Yg",
              role: "admin",
              username: "admin@example.com",
            },
          ]),
        }),
      ),
    ).toThrow(AdminConfigurationError);
  });

  it("rejects placeholder secrets in production and enables Secure cookies", () => {
    expect(() =>
      loadAdminConfig(
        createEnvironment({
          ADMIN_JWT_SECRET: "change-me-this-is-long-but-not-production-safe",
          NODE_ENV: "production",
        }),
      ),
    ).toThrow(/CSPRNG-generated/);

    const config = loadAdminConfig(
      createEnvironment({
        ADMIN_JWT_SECRET: Buffer.from(
          Array.from({ length: 32 }, (_, index) => index + 1),
        ).toString("base64url"),
        NODE_ENV: "production",
      }),
    );
    expect(config.secureCookies).toBe(true);

    expect(() =>
      loadAdminConfig(
        createEnvironment({
          ADMIN_JWT_SECRET: Buffer.alloc(32, 7).toString("base64url"),
          NODE_ENV: "production",
        }),
      ),
    ).toThrow(/CSPRNG-generated/);
  });

  it("rejects duplicate users, unsafe TTLs, and origins with paths", () => {
    const duplicateUsers = JSON.stringify([
      { passwordHash: encodedHash, role: "admin", username: "same@example.com" },
      { passwordHash: encodedHash, role: "editor", username: "SAME@example.com" },
    ]);

    expect(() =>
      loadAdminConfig(createEnvironment({ ADMIN_USERS_JSON: duplicateUsers })),
    ).toThrow(/duplicate/);
    expect(() =>
      loadAdminConfig(createEnvironment({ ADMIN_TOKEN_TTL_SECONDS: "10" })),
    ).toThrow(/between/);
    expect(() =>
      loadAdminConfig(createEnvironment({ ADMIN_ALLOWED_ORIGINS: "https://example.com/path" })),
    ).toThrow(/invalid origin/);
    expect(() =>
      loadAdminConfig(createEnvironment({ ADMIN_CMS_WRITE_ENABLED: "False" })),
    ).toThrow(/true or false/);
    expect(() =>
      loadAdminConfig(createEnvironment({ ADMIN_TRUST_PROXY_HEADERS: "yes" })),
    ).toThrow(/true or false/);
  });
});
