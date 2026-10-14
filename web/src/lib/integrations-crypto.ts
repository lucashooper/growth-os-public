import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";

function deriveKey() {
  const secret =
    process.env.INTEGRATIONS_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "growth-os-dev-integrations-key";
  return scryptSync(secret, "growth-os-integrations-v1", 32);
}

export function encryptIntegrationSecret(plain: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decryptIntegrationSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) return "";
  try {
    const key = deriveKey();
    const decipher = createDecipheriv(
      ALGO,
      key,
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]);
    return dec.toString("utf8");
  } catch {
    return "";
  }
}

export function maskSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 8) return "••••••••";
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}
