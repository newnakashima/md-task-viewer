import { describe, expect, it } from "vitest";
import {
  decryptSnapshot,
  encryptSnapshot,
  generateKey,
  type EncryptedEnvelope
} from "../src/readonly/crypto.js";

describe("readonly/crypto", () => {
  it("generates 32-byte base64url keys (43 chars without padding)", () => {
    const key = generateKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("round-trips plaintext through encrypt/decrypt with the same key", async () => {
    const key = generateKey();
    const plaintext = JSON.stringify({ tasks: [{ title: "テスト", id: 1 }], nested: { ok: true } });
    const envelope = await encryptSnapshot(plaintext, key);
    const decrypted = await decryptSnapshot(envelope, key);
    expect(decrypted).toBe(plaintext);
  });

  it("fails to decrypt with a different key", async () => {
    const key = generateKey();
    const otherKey = generateKey();
    const envelope = await encryptSnapshot("hello", key);
    await expect(decryptSnapshot(envelope, otherKey)).rejects.toBeDefined();
  });

  it("uses a fresh IV for each encryption", async () => {
    const key = generateKey();
    const a = await encryptSnapshot("payload", key);
    const b = await encryptSnapshot("payload", key);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("rejects keys that do not decode to 32 bytes", async () => {
    await expect(encryptSnapshot("x", "AAAA")).rejects.toThrow(/32 bytes/);
  });

  it("rejects envelopes with the wrong algorithm", async () => {
    const key = generateKey();
    const bad: EncryptedEnvelope = {
      encrypted: true,
      algorithm: "AES-GCM-128" as unknown as "AES-GCM-256",
      iv: "AAAAAAAAAAAAAAAAAA",
      ciphertext: "AAAA"
    };
    await expect(decryptSnapshot(bad, key)).rejects.toThrow(/Unsupported algorithm/);
  });
});
