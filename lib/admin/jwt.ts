import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { AdminConfig, ConfiguredAdminUser } from "@/lib/admin/config";
import type { AdminIdentity } from "@/types/admin";

const jwtHeaderSchema = z.object({
  alg: z.literal("HS256"),
  typ: z.literal("JWT"),
}).strict();

const jwtClaimsSchema = z.object({
  aud: z.string().min(1),
  exp: z.number().int().positive(),
  iat: z.number().int().nonnegative(),
  iss: z.string().min(1),
  jti: z.string().uuid(),
  role: z.enum(["admin", "editor"]),
  sub: z.string().min(1),
}).strict();

export type VerifiedSessionToken = {
  expiresAt: Date;
  user: AdminIdentity;
};

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function parseJsonSegment(segment: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

function createSignature(input: string, secret: string) {
  return createHmac("sha256", secret).update(input).digest();
}

export function signSessionToken(
  user: ConfiguredAdminUser,
  config: AdminConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({
    aud: config.audience,
    exp: nowSeconds + config.tokenTtlSeconds,
    iat: nowSeconds,
    iss: config.issuer,
    jti: randomUUID(),
    role: user.role,
    sub: user.username,
  });
  const signingInput = `${header}.${payload}`;
  const signature = createSignature(signingInput, config.jwtSecret).toString("base64url");

  return `${signingInput}.${signature}`;
}

export function verifySessionToken(
  token: string,
  config: AdminConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
): VerifiedSessionToken | null {
  if (token.length > 4_096) {
    return null;
  }

  const segments = token.split(".");

  if (segments.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = jwtHeaderSchema.safeParse(parseJsonSegment(encodedHeader));
  const claims = jwtClaimsSchema.safeParse(parseJsonSegment(encodedPayload));

  if (!header.success || !claims.success || !/^[A-Za-z0-9_-]+$/.test(encodedSignature)) {
    return null;
  }

  const expectedSignature = createSignature(
    `${encodedHeader}.${encodedPayload}`,
    config.jwtSecret,
  );
  const actualSignature = Buffer.from(encodedSignature, "base64url");

  if (
    actualSignature.length !== expectedSignature.length ||
    actualSignature.toString("base64url") !== encodedSignature ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return null;
  }

  const value = claims.data;

  if (
    value.iss !== config.issuer ||
    value.aud !== config.audience ||
    value.iat > nowSeconds + 60 ||
    value.exp <= value.iat ||
    value.exp <= nowSeconds ||
    value.exp - value.iat > config.tokenTtlSeconds
  ) {
    return null;
  }

  const configuredUser = config.users.get(value.sub.toLocaleLowerCase("en-US"));

  if (!configuredUser || configuredUser.role !== value.role) {
    return null;
  }

  return {
    expiresAt: new Date(value.exp * 1000),
    user: {
      displayName: configuredUser.displayName,
      role: configuredUser.role,
      username: configuredUser.username,
    },
  };
}
