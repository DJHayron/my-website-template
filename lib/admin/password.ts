import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 5;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

export const SCRYPT_HASH_PATTERN =
  /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;

function deriveKey(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: SCRYPT_COST,
        maxmem: SCRYPT_MAX_MEMORY,
        p: SCRYPT_PARALLELIZATION,
        r: SCRYPT_BLOCK_SIZE,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(password: string, salt = randomBytes(16)) {
  if (password.length < 12 || password.length > 256) {
    throw new Error("Password must contain between 12 and 256 characters.");
  }

  if (salt.length < 16) {
    throw new Error("Password salt must contain at least 16 bytes.");
  }

  const derivedKey = await deriveKey(password, salt);

  return [
    "scrypt",
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export function isValidScryptHash(encodedHash: string) {
  const match = SCRYPT_HASH_PATTERN.exec(encodedHash);

  if (!match) {
    return false;
  }

  const [, cost, blockSize, parallelization, encodedSalt, encodedKey] = match;

  if (
    Number(cost) !== SCRYPT_COST ||
    Number(blockSize) !== SCRYPT_BLOCK_SIZE ||
    Number(parallelization) !== SCRYPT_PARALLELIZATION
  ) {
    return false;
  }

  const salt = Buffer.from(encodedSalt, "base64url");
  const key = Buffer.from(encodedKey, "base64url");
  return (
    salt.length >= 16 &&
    key.length === SCRYPT_KEY_LENGTH &&
    salt.toString("base64url") === encodedSalt &&
    key.toString("base64url") === encodedKey
  );
}

export async function verifyPassword(password: string, encodedHash: string) {
  const match = SCRYPT_HASH_PATTERN.exec(encodedHash);

  if (!match || !isValidScryptHash(encodedHash) || password.length > 256) {
    return false;
  }

  const [, , , , encodedSalt, encodedKey] = match;

  try {
    const salt = Buffer.from(encodedSalt, "base64url");
    const expectedKey = Buffer.from(encodedKey, "base64url");

    const actualKey = await deriveKey(password, salt);
    return timingSafeEqual(expectedKey, actualKey);
  } catch {
    return false;
  }
}
