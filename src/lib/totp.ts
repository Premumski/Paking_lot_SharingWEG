import { authenticator } from "otplib";
import QRCode from "qrcode";

authenticator.options = { window: 1, step: 30, digits: 6 };

export function newTotpSecret() {
  return authenticator.generateSecret(20);
}

export function verifyTotp(secret: string, code: string) {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  try {
    return authenticator.verify({ token: clean, secret });
  } catch {
    return false;
  }
}

export async function totpQrDataUrl(secret: string, label: string) {
  const uri = authenticator.keyuri(label, "Stellplatz-Sharing", secret);
  return { uri, dataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
}
