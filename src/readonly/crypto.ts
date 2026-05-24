export interface EncryptedEnvelope {
  encrypted: true;
  algorithm: "AES-GCM-256";
  iv: string;
  ciphertext: string;
}

const KEY_BYTES = 32;
const IV_BYTES = 12;

function getSubtle(): SubtleCrypto {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto SubtleCrypto is not available in this runtime.");
  }
  return subtle;
}

function getRandomValues(out: Uint8Array): Uint8Array {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (!cryptoObj?.getRandomValues) {
    throw new Error("crypto.getRandomValues is not available in this runtime.");
  }
  cryptoObj.getRandomValues(out);
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    parts.push(String.fromCharCode.apply(null, slice as unknown as number[]));
  }
  return btoa(parts.join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(input: string): Uint8Array {
  const sanitized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = sanitized + "===".slice((sanitized.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function generateKey(): string {
  const buf = new Uint8Array(KEY_BYTES);
  getRandomValues(buf);
  return bytesToBase64Url(buf);
}

async function importKey(keyBase64url: string): Promise<CryptoKey> {
  const raw = base64UrlToBytes(keyBase64url);
  if (raw.length !== KEY_BYTES) {
    throw new Error(`Key must decode to ${KEY_BYTES} bytes (got ${raw.length}).`);
  }
  return getSubtle().importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSnapshot(plaintext: string, keyBase64url: string): Promise<EncryptedEnvelope> {
  const key = await importKey(keyBase64url);
  const iv = new Uint8Array(IV_BYTES);
  getRandomValues(iv);
  const data = new TextEncoder().encode(plaintext);
  const cipherBuffer = await getSubtle().encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    data as BufferSource
  );
  return {
    encrypted: true,
    algorithm: "AES-GCM-256",
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(cipherBuffer))
  };
}

export async function decryptSnapshot(envelope: EncryptedEnvelope, keyBase64url: string): Promise<string> {
  if (envelope.algorithm !== "AES-GCM-256") {
    throw new Error(`Unsupported algorithm: ${envelope.algorithm}`);
  }
  const key = await importKey(keyBase64url);
  const iv = base64UrlToBytes(envelope.iv);
  if (iv.length !== IV_BYTES) {
    throw new Error(`IV must decode to ${IV_BYTES} bytes (got ${iv.length}).`);
  }
  const ciphertext = base64UrlToBytes(envelope.ciphertext);
  const plainBuffer = await getSubtle().decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ciphertext as BufferSource
  );
  return new TextDecoder().decode(plainBuffer);
}
