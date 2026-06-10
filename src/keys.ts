import { createPrivateKey } from "node:crypto";

/**
 * GitHub downloads App private keys as PKCS#1, but WebCrypto (used by the
 * JWT signer) requires PKCS#8. Convert automatically so deployers can paste
 * the key exactly as GitHub hands it over — no openssl step, phone-friendly.
 */
export function normalizePrivateKey(pem: string): string {
  const trimmed = pem.trim();
  if (!trimmed.includes("BEGIN RSA PRIVATE KEY")) return trimmed; // already PKCS#8
  try {
    return createPrivateKey(trimmed)
      .export({ type: "pkcs8", format: "pem" })
      .toString();
  } catch {
    throw new Error(
      "GH_APP_PRIVATE_KEY looks like PKCS#1 but could not be converted. " +
        "Re-paste the full PEM including BEGIN/END lines, or convert manually: " +
        "openssl pkcs8 -topk8 -inform PEM -in key.pem -nocrypt"
    );
  }
}
