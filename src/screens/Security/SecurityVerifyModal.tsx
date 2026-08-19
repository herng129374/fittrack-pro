// SecurityVerifyModal.tsx
// Reusable verification gate for sensitive actions (currently: cancelling
// a booking; can be reused for any future sensitive action). Reads the
// user's chosen SecurityMethod and shows the matching UI:
//   - "none"     -> auto-verifies immediately, no UI shown at all
//   - "password" -> account password field, verified via Firebase reauth
//   - "pin"      -> 4-digit PIN field, verified against the stored hash
//
// Usage: <SecurityVerifyModal visible={...} onVerified={...} onCancel={...} />

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getAuth } from "firebase/auth";
import { C } from "../ChatAndCourse/chatcoursetype";
import {
  SecurityMethod,
  getSecuritySettings,
  verifyPin,
  verifyAccountPassword,
} from "./securityTypes";

export function SecurityVerifyModal({
  visible,
  title = "Verify to continue",
  subtitle = "This action needs verification before it can proceed.",
  onVerified,
  onCancel,
}: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onVerified: () => void;
  onCancel: () => void;
}) {
  const auth = getAuth();
  const [loadingMethod, setLoadingMethod] = useState(true);
  const [method, setMethod] = useState<SecurityMethod>("none");
  const [pinHash, setPinHash] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setInput("");
    setError(null);
    setLoadingMethod(true);

    const uid = auth.currentUser?.uid;
    if (!uid) {
      setMethod("none");
      setLoadingMethod(false);
      return;
    }
    getSecuritySettings(uid)
      .then((s) => {
        setMethod(s.method);
        setPinHash(s.pinHash);
        if (s.method === "none") {
          // Nothing to verify — proceed straight through.
          onVerified();
        }
      })
      .catch(() => setMethod("none"))
      .finally(() => setLoadingMethod(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleVerify = async () => {
    setError(null);
    if (method === "pin") {
      if (input.length !== 4) {
        setError("Enter your 4-digit PIN.");
        return;
      }
      setVerifying(true);
      const ok = pinHash ? await verifyPin(input, pinHash) : false;
      setVerifying(false);
      if (ok) {
        onVerified();
      } else {
        setError("Incorrect PIN.");
      }
      return;
    }

    if (method === "password") {
      if (!input) {
        setError("Enter your account password.");
        return;
      }
      setVerifying(true);
      const result = await verifyAccountPassword(input);
      setVerifying(false);
      if (result.ok) {
        onVerified();
      } else {
        setError(result.error ?? "Verification failed.");
      }
      return;
    }

    // method === "none" shouldn't reach here (auto-verified on load), but
    // guard anyway.
    onVerified();
  };

  if (method === "none" && !loadingMethod) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onCancel}
    >
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.iconWrap}>
            <Ionicons
              name={method === "pin" ? "keypad-outline" : "lock-closed-outline"}
              size={22}
              color={C.lime}
            />
          </View>
          <Text style={s.title}>{title}</Text>
          <Text style={s.subtitle}>{subtitle}</Text>

          {loadingMethod ? (
            <ActivityIndicator color={C.lime} style={{ marginVertical: 20 }} />
          ) : (
            <>
              <TextInput
                value={input}
                onChangeText={(t) => {
                  setInput(method === "pin" ? t.replace(/[^0-9]/g, "").slice(0, 4) : t);
                  setError(null);
                }}
                placeholder={method === "pin" ? "• • • •" : "Account password"}
                placeholderTextColor={C.muted}
                secureTextEntry
                keyboardType={method === "pin" ? "number-pad" : "default"}
                maxLength={method === "pin" ? 4 : undefined}
                style={[
                  s.input,
                  method === "pin" && s.inputPin,
                  error && { borderColor: C.danger },
                ]}
                autoFocus
              />
              {error && <Text style={s.errorTxt}>{error}</Text>}

              <TouchableOpacity
                style={[s.verifyBtn, verifying && { opacity: 0.6 }]}
                onPress={handleVerify}
                disabled={verifying}
                activeOpacity={0.85}
              >
                {verifying ? (
                  <ActivityIndicator color={C.bg} size="small" />
                ) : (
                  <Text style={s.verifyBtnTxt}>Verify</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={onCancel} style={s.cancelBtn}>
                <Text style={s.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 24,
    alignItems: "center",
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.lime + "20",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: "800", color: C.white, textAlign: "center" },
  subtitle: {
    fontSize: 12,
    color: C.muted,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 18,
  },
  input: {
    width: "100%",
    backgroundColor: C.card2,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.white,
    fontSize: 15,
    marginBottom: 6,
  },
  inputPin: {
    textAlign: "center",
    fontSize: 24,
    letterSpacing: 12,
    fontWeight: "900",
  },
  errorTxt: { color: C.danger, fontSize: 12, marginBottom: 10, alignSelf: "flex-start" },
  verifyBtn: {
    width: "100%",
    backgroundColor: C.lime,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 10,
  },
  verifyBtnTxt: { color: C.bg, fontSize: 14, fontWeight: "900" },
  cancelBtn: { marginTop: 10, padding: 6 },
  cancelTxt: { color: C.muted, fontSize: 12, fontWeight: "600" },
});
