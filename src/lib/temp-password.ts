import { randomBytes } from "crypto";

export function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  const password = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");

  return /[A-Z]/.test(password) ? password : `A${password.slice(1)}`;
}
