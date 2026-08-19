// securityTypes.ts
// Shared types + helpers for the "sensitive action verification" feature.
// Used to gate actions like cancelling a booking behind either the user's
// account password (Firebase reauthentication) or a lightweight 4-digit
// PIN they set up separately — their choice, configured in Profile.
//
// Security note: the PIN is never stored in plaintext. We hash it with
// SHA-256 (via expo-crypto) before writing to Firestore, and only ever
// compare hashes. This isn't bank-grade security (no salt/bcrypt — a
// determined attacker with database access and known-PIN-space could
// brute force 10,000 combinations quickly), but it's proportionate to
// what this PIN actually protects (cancelling a class booking, not
// financial transactions), and is a meaningful improvement over storing
// the PIN as plain text.

import * as Crypto from "expo-crypto";
import {
  getAuth,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

export type SecurityMethod = "none" | "password" | "pin";

export interface SecuritySettings {
  method: SecurityMethod;
  pinHash?: string;
}

export const DEFAULT_SECURITY: SecuritySettings = { method: "none" };

// ── Firestore read/write ────────────────────────────────
export async function getSecuritySettings(
  uid: string,
): Promise<SecuritySettings> {
  const db = getFirestore();
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return DEFAULT_SECURITY;
  const data = snap.data();
  return {
    method: data.security?.method ?? "none",
    pinHash: data.security?.pinHash,
  };
}

export async function saveSecuritySettings(
  uid: string,
  settings: SecuritySettings,
): Promise<void> {
  const db = getFirestore();
  await setDoc(
    doc(db, "users", uid),
    { security: settings },
    { merge: true },
  );
}

// ── PIN hashing ──────────────────────────────────────────
export async function hashPin(pin: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pin,
  );
}

export async function verifyPin(
  enteredPin: string,
  storedHash: string,
): Promise<boolean> {
  const enteredHash = await hashPin(enteredPin);
  return enteredHash === storedHash;
}

// ── Account password reauth ─────────────────────────────
// Firebase requires reauthentication (not a plain "check this string
// equals the password" call — Firebase never exposes the stored
// password for comparison) before trusting a password as proof of
// identity for a sensitive in-app action.
export async function verifyAccountPassword(
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user || !user.email) {
    return { ok: false, error: "Not signed in." };
  }
  try {
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);
    return { ok: true };
  } catch (e: any) {
    if (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential") {
      return { ok: false, error: "Incorrect password." };
    }
    if (e.code === "auth/too-many-requests") {
      return { ok: false, error: "Too many attempts. Try again later." };
    }
    return { ok: false, error: e.message ?? "Could not verify password." };
  }
}
