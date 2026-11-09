// AES-GCM credential encryption (server-only usage). Key: base64/any string from CREDENTIALS_ENCRYPTION_KEY, hashed to 256 bits.
const enc = new TextEncoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function key(secret: string) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encrypt(plain: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(secret), enc.encode(plain)));
  return `${b64(iv)}.${b64(ct)}`;
}

export async function decrypt(token: string, secret: string): Promise<string> {
  const [iv = "", ct = ""] = token.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(secret), unb64(ct));
  return new TextDecoder().decode(pt);
}

export const mask = (v: string | null | undefined) => (v ? `••••${v.slice(-4)}` : "");
export const maskEmails = (s: string) => s.replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+)/g, "$1***@$2");

/** Masks e-mails and the given personal names (public live view). */
export function scrubText(s: string | null | undefined, names: string[]): string | null {
  if (!s) return s ?? null;
  let out = s.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "•••@•••");
  for (const n of names) out = out.split(n).join(n[0] + "•••");
  return out;
}
