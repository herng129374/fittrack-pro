import React, { useState } from "react";
import {
  ScrollView,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Text,
  TextInput,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { AuthStackParamList } from "../../types/navigation";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

const C = {
  bg: "#0d0d0f",
  card: "#1c1d23",
  cardAlt: "#212330",
  lime: "#c8f135",
  white: "#f2f2f4",
  muted: "#6b6d7a",
  border: "#26272f",
  danger: "#ff4f4f",
};

export default function ForgetPassword({
  navigation,
}: NativeStackScreenProps<AuthStackParamList, "ForgetPassword">) {
  const auth = getAuth();
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [sent, setSent] = useState(false);

  async function forget() {
    setLoading(true);
    await sendPasswordResetEmail(auth, email)
      .then(() => {
        setLoading(false);
        setSent(true);
      })
      .catch((error) => {
        setLoading(false);
        alert(error.message);
      });
  }

  return (
    <KeyboardAvoidingView behavior="height" enabled style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={s.root}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => navigation.navigate("Login")}
          >
            <Ionicons name="chevron-back" size={20} color={C.white} />
          </TouchableOpacity>
          <View style={s.badge}>
            <Ionicons name="flash" size={12} color={C.bg} />
            <Text style={s.badgeText}>FITTRACK PRO</Text>
          </View>
        </View>

        {!sent ? (
          <>
            {/* ── Illustration area ── */}
            <View style={s.illustrationWrap}>
              {/* Layered decorative rings */}
              <View style={s.outerRing} />
              <View style={s.midRing} />
              <View style={s.innerRing} />

              {/* Icon block */}
              <View style={s.iconBlock}>
                <Ionicons name="lock-open-outline" size={42} color={C.lime} />
              </View>

              {/* Floating stats-style tags */}
              <View style={[s.floatTag, s.floatTagLeft]}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={12}
                  color={C.lime}
                />
                <Text style={s.floatTagText}>SECURE</Text>
              </View>
              <View style={[s.floatTag, s.floatTagRight]}>
                <Ionicons name="mail-outline" size={12} color={C.lime} />
                <Text style={s.floatTagText}>EMAIL</Text>
              </View>
            </View>

            {/* ── Title ── */}
            <View style={s.titleWrap}>
              <Text style={s.title}>RESET{"\n"}PASSWORD</Text>
              <Text style={s.subtitle}>
                Enter your email and we'll send a reset link to get you back in
                the game.
              </Text>
            </View>

            {/* ── Form card ── */}
            <View style={s.formCard}>
              <View style={s.stepBadge}>
                <Text style={s.stepBadgeText}>STEP 1 OF 2</Text>
              </View>
              <Text style={s.label}>EMAIL ADDRESS</Text>
              <View style={s.inputCard}>
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={C.muted}
                  style={{ marginRight: 12 }}
                />
                <TextInput
                  placeholder="you@example.com"
                  placeholderTextColor={C.muted}
                  value={email}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  style={s.input}
                />
              </View>

              {/* Info hint */}
              <View style={s.infoCard}>
                <Ionicons
                  name="information-circle-outline"
                  size={16}
                  color={C.lime}
                />
                <Text style={s.infoText}>
                  Check your spam folder if the email doesn't arrive within 2
                  minutes.
                </Text>
              </View>
            </View>

            {/* ── CTA ── */}
            <TouchableOpacity
              style={[s.cta, loading && { opacity: 0.55 }]}
              onPress={forget}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={C.bg} size="small" />
              ) : (
                <>
                  <Ionicons name="send-outline" size={20} color={C.bg} />
                  <Text style={s.ctaText}>SEND RESET LINK</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          /* ── Success state ── */
          <View style={s.successWrap}>
            <View style={s.successRing}>
              <View style={s.successInner}>
                <Ionicons name="checkmark" size={40} color={C.bg} />
              </View>
            </View>
            <Text style={s.successTitle}>EMAIL SENT!</Text>
            <Text style={s.successSub}>
              A reset link has been dispatched to{"\n"}
              <Text style={{ color: C.lime, fontWeight: "800" }}>{email}</Text>
            </Text>

            <View style={s.successCard}>
              {[
                { icon: "open-outline", text: "Open your email app" },
                { icon: "link-outline", text: "Click the reset link" },
                { icon: "lock-closed-outline", text: "Create a new password" },
                { icon: "flash-outline", text: "Back to training!" },
              ].map((item, i) => (
                <View key={i} style={s.successStep}>
                  <View style={s.successStepNum}>
                    <Text style={s.successStepNumText}>{i + 1}</Text>
                  </View>
                  <Ionicons name={item.icon as any} size={16} color={C.lime} />
                  <Text style={s.successStepText}>{item.text}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={s.cta}
              onPress={() => navigation.navigate("Login")}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-back" size={20} color={C.bg} />
              <Text style={s.ctaText}>BACK TO LOGIN</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.resendBtn}
              onPress={() => setSent(false)}
            >
              <Text style={s.resendText}>Didn't receive it? Resend →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Back to login ── */}
        {!sent && (
          <View style={s.loginRow}>
            <Text style={s.loginPrompt}>Remembered it? </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Login")}>
              <Text style={s.loginLink}>Back to login →</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 50 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },

  header: {
    paddingTop: 58,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.lime,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
  },
  badgeText: { color: C.bg, fontSize: 10, fontWeight: "900", letterSpacing: 2 },

  // Illustration
  illustrationWrap: {
    height: 200,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    position: "relative",
  },
  outerRing: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: "rgba(200,241,53,0.08)",
  },
  midRing: {
    position: "absolute",
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 1,
    borderColor: "rgba(200,241,53,0.12)",
  },
  innerRing: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.5,
    borderColor: "rgba(200,241,53,0.2)",
  },
  iconBlock: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: C.lime,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  floatTag: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  floatTagLeft: { left: 12, top: 50 },
  floatTagRight: { right: 12, bottom: 50 },
  floatTagText: {
    color: C.lime,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },

  titleWrap: { marginBottom: 24 },
  title: {
    color: C.white,
    fontSize: 46,
    fontWeight: "900",
    lineHeight: 48,
    letterSpacing: -1.5,
    marginBottom: 10,
  },
  subtitle: {
    color: C.muted,
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 22,
  },

  // Form
  formCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: C.border,
    padding: 20,
    marginBottom: 24,
  },
  stepBadge: {
    backgroundColor: C.cardAlt,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  stepBadgeText: {
    color: C.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2,
  },
  label: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 8,
  },
  inputCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.bg,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  input: {
    flex: 1,
    color: C.white,
    fontSize: 15,
    fontWeight: "500",
    padding: 0,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(200,241,53,0.06)",
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "rgba(200,241,53,0.15)",
  },
  infoText: { flex: 1, color: C.muted, fontSize: 12, lineHeight: 18 },

  // CTA
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.lime,
    borderRadius: 16,
    paddingVertical: 18,
    gap: 10,
    shadowColor: C.lime,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  ctaText: {
    color: C.bg,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 2,
  },

  loginRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 22,
  },
  loginPrompt: { color: C.muted, fontSize: 14 },
  loginLink: { color: C.lime, fontSize: 14, fontWeight: "800" },

  // Success state
  successWrap: { flex: 1, paddingTop: 16 },
  successRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: "rgba(200,241,53,0.3)",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 24,
  },
  successInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.lime,
    justifyContent: "center",
    alignItems: "center",
  },
  successTitle: {
    color: C.white,
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: -1,
    textAlign: "center",
    marginBottom: 12,
  },
  successSub: {
    color: C.muted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  successCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: C.border,
    padding: 20,
    gap: 14,
    marginBottom: 24,
  },
  successStep: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  successStepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
  },
  successStepNumText: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "800",
  },
  successStepText: { color: C.white, fontSize: 14, fontWeight: "600", flex: 1 },

  resendBtn: { alignItems: "center", marginTop: 18 },
  resendText: { color: C.muted, fontSize: 13, fontWeight: "600" },
});
