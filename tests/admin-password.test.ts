import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/admin/password";

describe("admin password hashing", () => {
  let passwordHash = "";

  beforeAll(async () => {
    passwordHash = await hashPassword(
      "correct horse battery staple",
      Buffer.from("0123456789abcdef"),
    );
  });

  it("verifies the correct password", async () => {
    await expect(
      verifyPassword("correct horse battery staple", passwordHash),
    ).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    await expect(verifyPassword("incorrect password", passwordHash)).resolves.toBe(false);
  });

  it("rejects malformed hashes and unsafe work factors", async () => {
    await expect(verifyPassword("password", "not-a-hash")).resolves.toBe(false);
    await expect(
      verifyPassword("correct horse battery staple", passwordHash.replace("$16384$", "$32768$")),
    ).resolves.toBe(false);
  });

  it("requires a meaningful password when producing hashes", async () => {
    await expect(hashPassword("too-short")).rejects.toThrow(/between 12 and 256/);
    await expect(
      hashPassword("long-enough-password", Buffer.alloc(8)),
    ).rejects.toThrow(/at least 16 bytes/);
  });
});
