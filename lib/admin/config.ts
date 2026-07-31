import { z } from "zod";
import { isValidScryptHash } from "@/lib/admin/password";
import type { AdminIdentity, AdminRole } from "@/types/admin";

const MINIMUM_SECRET_BYTES = 32;
const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60;
const MAXIMUM_TOKEN_TTL_SECONDS = 24 * 60 * 60;

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(128)
  .regex(/^[A-Za-z0-9._@+-]+$/);

const configuredUserSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  passwordHash: z.string().refine(isValidScryptHash),
  role: z.enum(["admin", "editor"]),
  username: usernameSchema,
}).strict();

const configuredUsersSchema = z.array(configuredUserSchema).min(1).max(20);

export type ConfiguredAdminUser = AdminIdentity & {
  passwordHash: string;
};

export type AdminConfig = {
  allowedOrigins: ReadonlySet<string>;
  audience: string;
  issuer: string;
  jwtSecret: string;
  secureCookies: boolean;
  tokenTtlSeconds: number;
  trustProxyHeaders: boolean;
  users: ReadonlyMap<string, ConfiguredAdminUser>;
  writeEnabled: boolean;
};

export class AdminConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminConfigurationError";
  }
}

function requiredValue(environment: NodeJS.ProcessEnv, name: string) {
  const value = environment[name]?.trim();

  if (!value) {
    throw new AdminConfigurationError(`${name} is required.`);
  }

  return value;
}

function parseUsers(rawValue: string) {
  let value: unknown;

  try {
    value = JSON.parse(rawValue);
  } catch {
    throw new AdminConfigurationError("ADMIN_USERS_JSON must be valid JSON.");
  }

  const parsedUsers = configuredUsersSchema.safeParse(value);

  if (!parsedUsers.success) {
    throw new AdminConfigurationError("ADMIN_USERS_JSON has an invalid shape.");
  }

  const users = new Map<string, ConfiguredAdminUser>();

  for (const entry of parsedUsers.data) {
    const username = entry.username.toLocaleLowerCase("en-US");

    if (users.has(username)) {
      throw new AdminConfigurationError("ADMIN_USERS_JSON contains duplicate usernames.");
    }

    users.set(username, {
      displayName: entry.displayName ?? entry.username,
      passwordHash: entry.passwordHash,
      role: entry.role,
      username,
    });
  }

  return users;
}

function parseTokenTtl(environment: NodeJS.ProcessEnv) {
  const rawValue = environment.ADMIN_TOKEN_TTL_SECONDS;

  if (!rawValue) {
    return DEFAULT_TOKEN_TTL_SECONDS;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 300 || value > MAXIMUM_TOKEN_TTL_SECONDS) {
    throw new AdminConfigurationError(
      `ADMIN_TOKEN_TTL_SECONDS must be between 300 and ${MAXIMUM_TOKEN_TTL_SECONDS}.`,
    );
  }

  return value;
}

function parseAllowedOrigins(environment: NodeJS.ProcessEnv) {
  const rawValue = environment.ADMIN_ALLOWED_ORIGINS?.trim();

  if (!rawValue) {
    return new Set<string>();
  }

  const origins = new Set<string>();

  for (const entry of rawValue.split(",")) {
    try {
      const url = new URL(entry.trim());

      if (url.origin !== url.toString().replace(/\/$/, "") || !["http:", "https:"].includes(url.protocol)) {
        throw new Error("Origin must not contain a path.");
      }

      origins.add(url.origin);
    } catch {
      throw new AdminConfigurationError("ADMIN_ALLOWED_ORIGINS contains an invalid origin.");
    }
  }

  return origins;
}

function parseWriteEnabled(environment: NodeJS.ProcessEnv) {
  const rawValue = environment.ADMIN_CMS_WRITE_ENABLED;

  if (rawValue === undefined || rawValue === "true") {
    return true;
  }

  if (rawValue === "false") {
    return false;
  }

  throw new AdminConfigurationError("ADMIN_CMS_WRITE_ENABLED must be true or false.");
}

function parseTrustProxyHeaders(environment: NodeJS.ProcessEnv) {
  const rawValue = environment.ADMIN_TRUST_PROXY_HEADERS;

  if (rawValue === undefined || rawValue === "false") {
    return false;
  }

  if (rawValue === "true") {
    return true;
  }

  throw new AdminConfigurationError("ADMIN_TRUST_PROXY_HEADERS must be true or false.");
}

function hasProductionSecretStrength(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return false;
  }

  const decoded = Buffer.from(value, "base64url");
  return (
    decoded.length >= 32 &&
    decoded.toString("base64url") === value &&
    new Set(decoded).size >= 16
  );
}

export function loadAdminConfig(environment: NodeJS.ProcessEnv = process.env): AdminConfig {
  const jwtSecret = requiredValue(environment, "ADMIN_JWT_SECRET");

  if (Buffer.byteLength(jwtSecret, "utf8") < MINIMUM_SECRET_BYTES) {
    throw new AdminConfigurationError(
      `ADMIN_JWT_SECRET must contain at least ${MINIMUM_SECRET_BYTES} bytes.`,
    );
  }

  if (
    environment.NODE_ENV === "production" &&
    (!hasProductionSecretStrength(jwtSecret) ||
      /(?:change[-_ ]?me|example|replace|development|secret)/i.test(jwtSecret))
  ) {
    throw new AdminConfigurationError(
      "ADMIN_JWT_SECRET must be a CSPRNG-generated base64url value of at least 32 bytes in production.",
    );
  }

  return {
    allowedOrigins: parseAllowedOrigins(environment),
    audience: environment.ADMIN_JWT_AUDIENCE?.trim() || "hayronhgh-admin-console",
    issuer: environment.ADMIN_JWT_ISSUER?.trim() || "hayronhgh-admin-cms",
    jwtSecret,
    secureCookies: environment.NODE_ENV === "production",
    tokenTtlSeconds: parseTokenTtl(environment),
    trustProxyHeaders: parseTrustProxyHeaders(environment),
    users: parseUsers(requiredValue(environment, "ADMIN_USERS_JSON")),
    writeEnabled: parseWriteEnabled(environment),
  };
}

export function getConfiguredUser(config: AdminConfig, username: string) {
  return config.users.get(username.trim().toLocaleLowerCase("en-US"));
}

export function hasRole(role: AdminRole, allowedRoles: readonly AdminRole[]) {
  return allowedRoles.includes(role);
}
