// The master encryption key must be a 32-byte (64 char hex) string.

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;

function bufToHex(buffer: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  const arr = new Uint8Array(buffer);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(Math.ceil(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function getKey(): Promise<CryptoKey> {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  const keyBytes = hexToBuf(encryptionKey);
  if (keyBytes.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be a 32-byte hex string (64 characters)");
  }
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: ALGORITHM },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a hex string in the format: iv:encryptedData
 */
export async function encrypt(text: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH)) as Uint8Array<ArrayBuffer>;
  const encoded = new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;
  
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  );
  
  return `${bufToHex(iv)}:${bufToHex(encryptedBuf)}`;
}

/**
 * Decrypts a ciphertext string encrypted by `encrypt()`.
 * Expects the format: iv:encryptedData
 */
export async function decrypt(ciphertext: string): Promise<string> {
  const key = await getKey();
  const parts = ciphertext.split(':');
  
  // Backwards compatibility with the old Node.js crypto format if needed
  if (parts.length !== 2 && parts.length !== 3) {
    throw new Error("Invalid ciphertext format");
  }

  const iv = hexToBuf(parts[0]);
  let encryptedBytes: Uint8Array<ArrayBuffer>;
  
  if (parts.length === 3) {
    // Old format: iv:authTag:encryptedData -> Web Crypto combines encryptedData + authTag
    const authTag = hexToBuf(parts[1]);
    const encData = hexToBuf(parts[2]);
    const combined = new Uint8Array(encData.length + authTag.length);
    combined.set(encData, 0);
    combined.set(authTag, encData.length);
    encryptedBytes = combined;
  } else {
    // New format
    encryptedBytes = hexToBuf(parts[1]);
  }

  const decryptedBuf = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    encryptedBytes
  );
  
  return new TextDecoder().decode(decryptedBuf);
}
