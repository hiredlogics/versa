/**
 * One-off ENCRYPTION_KEY rotation.
 *
 *   OLD_ENCRYPTION_KEY="<current>" ENCRYPTION_KEY="<new>" \
 *     npx tsx scripts/rotate-encryption-key.ts [--commit]
 *
 * Swapping the env var alone is not enough: every ApiKeyConfig.encryptedKey row
 * is sealed with the old key and becomes unreadable. This decrypts each row with
 * the old key and re-encrypts with the new one inside a single transaction, so a
 * failure part-way leaves the table untouched.
 *
 * Runs as a dry run unless --commit is passed.
 */
import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";

// Mirrors src/lib/services/security/encryption.ts exactly: aes-256-gcm, sha256
// key derivation, 12-byte IV, "iv:tag:data" hex payload.
const ALGO = "aes-256-gcm";

function deriveKey(secret: string): Buffer {
  const key = secret.trim();
  if (!key || key.length < 32) {
    throw new Error("Encryption keys must be at least 32 characters");
  }
  return crypto.createHash("sha256").update(key).digest();
}

function decryptWith(secret: string, payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Unrecognised payload format — expected iv:tag:data");
  }
  const decipher = crypto.createDecipheriv(ALGO, deriveKey(secret), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

function encryptWith(secret: string, text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

async function main() {
  const oldSecret = process.env.OLD_ENCRYPTION_KEY;
  const newSecret = process.env.ENCRYPTION_KEY;
  const commit = process.argv.includes("--commit");

  if (!oldSecret || !newSecret) {
    console.error("Set OLD_ENCRYPTION_KEY and ENCRYPTION_KEY before running.");
    process.exit(1);
  }
  if (oldSecret.trim() === newSecret.trim()) {
    console.error("OLD_ENCRYPTION_KEY and ENCRYPTION_KEY are identical — nothing to rotate.");
    process.exit(1);
  }

  const rows = await prisma.apiKeyConfig.findMany({
    select: { id: true, provider: true, encryptedKey: true },
  });

  if (rows.length === 0) {
    console.log("No ApiKeyConfig rows — rotating the env var alone is safe.");
    await prisma.$disconnect();
    return;
  }

  // Decrypt everything up front: if one row fails, nothing is written.
  const rotated: Array<{ id: string; provider: string; encryptedKey: string }> = [];
  for (const row of rows) {
    try {
      const plain = decryptWith(oldSecret, row.encryptedKey);
      rotated.push({ id: row.id, provider: row.provider, encryptedKey: encryptWith(newSecret, plain) });
    } catch (error) {
      console.error(
        `FAILED to decrypt ${row.provider} (${row.id}) with OLD_ENCRYPTION_KEY:`,
        error instanceof Error ? error.message : error
      );
      console.error("Nothing was written. Check that OLD_ENCRYPTION_KEY is the current value.");
      await prisma.$disconnect();
      process.exit(1);
    }
  }

  console.log(`Re-encrypted ${rotated.length} row(s): ${rotated.map((r) => r.provider).join(", ")}`);

  if (!commit) {
    console.log("Dry run — re-run with --commit to write.");
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(
    rotated.map((row) =>
      prisma.apiKeyConfig.update({
        where: { id: row.id },
        data: { encryptedKey: row.encryptedKey },
      })
    )
  );

  console.log(`Rotated ${rotated.length} row(s). Deploy the new ENCRYPTION_KEY everywhere now.`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("Rotation failed:", error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
