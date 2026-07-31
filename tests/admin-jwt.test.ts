import { describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "@/lib/admin/jwt";
import type { AdminConfig, ConfiguredAdminUser } from "@/lib/admin/config";

const user: ConfiguredAdminUser = {
  displayName: "Admin",
  passwordHash: "unused-in-token-tests",
  role: "admin",
  username: "admin@example.com",
};

function createConfig(overrides: Partial<AdminConfig> = {}): AdminConfig {
  return {
    allowedOrigins: new Set(),
    audience: "admin-console",
    issuer: "admin-cms",
    jwtSecret: "test-secret-that-is-longer-than-thirty-two-bytes",
    secureCookies: false,
    tokenTtlSeconds: 3_600,
    trustProxyHeaders: false,
    users: new Map([[user.username, user]]),
    writeEnabled: true,
    ...overrides,
  };
}

describe("admin JWT", () => {
  it("signs and verifies an allowlisted session", () => {
    const config = createConfig();
    const token = signSessionToken(user, config, 1_000);

    expect(verifySessionToken(token, config, 1_001)).toMatchObject({
      expiresAt: new Date(4_600_000),
      user: {
        role: "admin",
        username: "admin@example.com",
      },
    });
  });

  it("rejects expired and tampered tokens", () => {
    const config = createConfig();
    const token = signSessionToken(user, config, 1_000);
    const [header, payload, signature] = token.split(".");
    const tamperedHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
      "base64url",
    );

    expect(verifySessionToken(token, config, 4_600)).toBeNull();
    expect(verifySessionToken(`${tamperedHeader}.${payload}.${signature}`, config, 1_001)).toBeNull();
    expect(verifySessionToken(`${header}.${payload}.${signature.slice(0, -1)}A`, config, 1_001)).toBeNull();
  });

  it("pins issuer and audience", () => {
    const expectedConfig = createConfig();
    const wrongIssuerToken = signSessionToken(
      user,
      createConfig({ issuer: "another-issuer" }),
      1_000,
    );
    const wrongAudienceToken = signSessionToken(
      user,
      createConfig({ audience: "another-audience" }),
      1_000,
    );

    expect(verifySessionToken(wrongIssuerToken, expectedConfig, 1_001)).toBeNull();
    expect(verifySessionToken(wrongAudienceToken, expectedConfig, 1_001)).toBeNull();
  });

  it("invalidates a token after whitelist removal or role change", () => {
    const config = createConfig();
    const token = signSessionToken(user, config, 1_000);

    expect(verifySessionToken(token, createConfig({ users: new Map() }), 1_001)).toBeNull();
    expect(
      verifySessionToken(
        token,
        createConfig({
          users: new Map([[user.username, { ...user, role: "editor" }]]),
        }),
        1_001,
      ),
    ).toBeNull();
  });
});
