// SecuritySettingsScreen.tsx
// Lets the user choose how sensitive actions (currently: cancelling a
// booking) get verified — no extra check, account password, or a PIN
// they set here. Reached from Profile > Settings > Security.

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  StatusBar,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { getAuth } from "firebase/auth";
import { C } from "../ChatAndCourse/chatcoursetype";
import {
  SecurityMethod,
  getSecuritySettings,
  saveSecuritySettings,
  hashPin,
} from "./securityTypes";

function MethodOption({
  icon,
  label,
  sub,
  selected,
  onPress,
}: {
  icon: string;
  label: string;
  sub: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[opt.card, selected && opt.cardSelected]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View
        style={[opt.iconWrap, selected && { backgroundColor: C.lime + "22" }]}
      >
        <Ionicons
          name={icon as any}
          size={20}
          color={selected ? C.lime : C.muted}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[opt.label, selected && { color: C.lime }]}>{label}</Text>
        <Text style={opt.sub}>{sub}</Text>
      </View>
      <View style={[opt.radio, selected && opt.radioSelected]}>
        {selected && <View style={opt.radioDot} />}
      </View>
    </TouchableOpacity>
  );
}
const opt = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    padding: 14,
    marginBottom: 10,
  },
  cardSelected: { borderColor: C.lime },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.card2,
    justifyContent: "center",
    alignItems: "center",
  },
  label: { fontSize: 14, fontWeight: "800", color: C.white },
  sub: { fontSize: 11, color: C.muted, marginTop: 2 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
  },
  radioSelected: { borderColor: C.lime },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.lime },
});

export default function SecuritySettingsScreen() {
  const auth = getAuth();
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [method, setMethod] = useState<SecurityMethod>("none");
  const [hasPinSet, setHasPinSet] = useState(false);

  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    getSecuritySettings(uid)
      .then((s) => {
        setMethod(s.method);
        setHasPinSet(!!s.pinHash);
      })
      .finally(() => setLoading(false));
  }, []);

  const persistMethod = async (newMethod: SecurityMethod) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSaving(true);
    try {
      if (newMethod === "pin" && !hasPinSet) {
        // Need to set a PIN first before this method can be active.
        setMethod("pin");
        setShowPinSetup(true);
        setSaving(false);
        return;
      }
      await saveSecuritySettings(uid, { method: newMethod });
      setMethod(newMethod);
      Alert.alert("Saved", "Your security preference has been updated.");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const handleSavePin = async () => {
    setPinError(null);
    if (pin.length !== 4) {
      setPinError("PIN must be exactly 4 digits.");
      return;
    }
    if (pin !== pinConfirm) {
      setPinError("PINs don't match.");
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSaving(true);
    try {
      const pinHash = await hashPin(pin);
      await saveSecuritySettings(uid, { method: "pin", pinHash });
      setHasPinSet(true);
      setShowPinSetup(false);
      setPin("");
      setPinConfirm("");
      Alert.alert("PIN set", "Your PIN has been saved and is now active.");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not save PIN.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View
        style={[s.root, { justifyContent: "center", alignItems: "center" }]}
      >
        <ActivityIndicator color={C.lime} size="large" />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Security</Text>
          <Text style={s.headerSub}>Verification for sensitive actions</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.body}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.note}>
          Choose how you'd like to verify actions like cancelling a booking.
          This adds a quick check before the action goes through.
        </Text>

        <MethodOption
          icon="close-circle-outline"
          label="No extra verification"
          sub="Just a confirmation prompt, nothing else"
          selected={method === "none"}
          onPress={() => persistMethod("none")}
        />
        <MethodOption
          icon="lock-closed-outline"
          label="Account password"
          sub="Re-enter your login password each time"
          selected={method === "password"}
          onPress={() => persistMethod("password")}
        />
        <MethodOption
          icon="keypad-outline"
          label={hasPinSet ? "4-digit PIN" : "4-digit PIN (not set up yet)"}
          sub={
            hasPinSet
              ? "Tap to change your PIN"
              : "Set a quick PIN to use instead of your password"
          }
          selected={method === "pin"}
          onPress={() => {
            if (hasPinSet && method === "pin") {
              setShowPinSetup(true); // allow changing existing PIN
            } else {
              persistMethod("pin");
            }
          }}
        />

        {hasPinSet && method === "pin" && !showPinSetup && (
          <TouchableOpacity
            style={s.changePinBtn}
            onPress={() => setShowPinSetup(true)}
          >
            <Ionicons name="create-outline" size={14} color={C.blue} />
            <Text style={s.changePinTxt}>Change PIN</Text>
          </TouchableOpacity>
        )}

        {showPinSetup && (
          <View style={s.pinSetupCard}>
            <Text style={s.pinSetupTitle}>
              {hasPinSet ? "Set a new PIN" : "Create your PIN"}
            </Text>
            <TextInput
              value={pin}
              onChangeText={(t) => {
                setPin(t.replace(/[^0-9]/g, "").slice(0, 4));
                setPinError(null);
              }}
              placeholder="New 4-digit PIN"
              placeholderTextColor={C.muted}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              style={s.pinInput}
            />
            <TextInput
              value={pinConfirm}
              onChangeText={(t) => {
                setPinConfirm(t.replace(/[^0-9]/g, "").slice(0, 4));
                setPinError(null);
              }}
              placeholder="Confirm PIN"
              placeholderTextColor={C.muted}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              style={s.pinInput}
            />
            {pinError && <Text style={s.pinError}>{pinError}</Text>}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <TouchableOpacity
                style={[s.pinBtn, s.pinBtnGhost]}
                onPress={() => {
                  setShowPinSetup(false);
                  setPin("");
                  setPinConfirm("");
                  setPinError(null);
                  if (!hasPinSet) setMethod("none");
                }}
              >
                <Text style={s.pinBtnGhostTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.pinBtn, saving && { opacity: 0.6 }]}
                onPress={handleSavePin}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={C.bg} />
                ) : (
                  <Text style={s.pinBtnTxt}>Save PIN</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "900", color: C.white },
  headerSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  body: { padding: 16 },
  note: { fontSize: 12, color: C.muted, lineHeight: 18, marginBottom: 16 },
  changePinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    marginTop: -4,
    marginBottom: 10,
    marginLeft: 4,
  },
  changePinTxt: { fontSize: 12, color: C.blue, fontWeight: "700" },
  pinSetupCard: {
    backgroundColor: C.card2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginTop: 6,
  },
  pinSetupTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: C.white,
    marginBottom: 12,
  },
  pinInput: {
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: C.white,
    fontSize: 16,
    letterSpacing: 8,
    textAlign: "center",
    marginBottom: 10,
  },
  pinError: { color: C.danger, fontSize: 12, marginBottom: 6 },
  pinBtn: {
    flex: 1,
    backgroundColor: C.lime,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  pinBtnTxt: { color: C.bg, fontSize: 13, fontWeight: "800" },
  pinBtnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.border,
  },
  pinBtnGhostTxt: { color: C.muted, fontSize: 13, fontWeight: "700" },
});
