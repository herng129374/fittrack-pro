import React, { useState, useRef } from "react";
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
  Dimensions,
  Linking,
} from "react-native";
import { AuthStackParamList } from "../../types/navigation";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");

// ── Admin Web URL — change this when deployed ─────────────
const ADMIN_WEB_URL = "http://localhost:3000";

const C = {
  bg: "#0d0d0f",
  card: "#1c1d23",
  cardAlt: "#212330",
  lime: "#c8f135",
  white: "#f2f2f4",
  muted: "#6b6d7a",
  border: "#26272f",
  danger: "#ff4f4f",
  dimLime: "rgba(200,241,53,0.08)",
};

export default function Login({
  navigation,
}: NativeStackScreenProps<AuthStackParamList, "Login">) {
  const auth = getAuth();
  const db = getFirestore();

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [showPass, setShowPass] = useState(false);

  // ── 7-tap easter egg → open admin web directly ────────
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogoPres = () => {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      tapCount.current = 0;
    }, 1500);
    if (tapCount.current >= 7) {
      tapCount.current = 0;
      if (tapTimer.current) clearTimeout(tapTimer.current);
      Linking.openURL(ADMIN_WEB_URL);
    }
  };

  // ── Login — auto detects role ─────────────────────────
  async function login() {
    if (!email || !password) return alert("Please fill in all fields.");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      const role = snap.exists() ? (snap.data().role ?? "user") : "user";

      if (role === "admin") {
        // Admin → open admin web, sign out from app
        await auth.signOut();
        setLoading(false);
        Linking.openURL(ADMIN_WEB_URL);
        return;
      }

      if (role === "coach") {
        // Coach → will navigate to CoachTabs (implement later)
        // For now falls through to normal app
        return;
      }

      // role === "user" → Firebase auth state change handles navigation
    } catch (error: any) {
      setLoading(false);
      alert(error.message);
    }
  }

  return (
    <KeyboardAvoidingView behavior="height" enabled style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={s.root}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero area ── */}
        <View style={s.hero}>
          <View style={s.ring} />
          <View style={s.ringInner} />

          {/* 7-tap logo — opens admin web */}
          <TouchableOpacity
            onPress={handleLogoPres}
            activeOpacity={0.85}
            style={s.badge}
          >
            <Ionicons name="flash" size={14} color={C.bg} />
            <Text style={s.badgeText}>FITTRACK PRO</Text>
          </TouchableOpacity>

          <Text style={s.heroTitle}>WELCOME{"\n"}BACK.</Text>
          <Text style={s.heroSub}>
            Push limits. Track progress. Crush goals.
          </Text>
        </View>

        {/* ── Form ── */}
        <View style={s.form}>
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

          <Text style={s.label}>PASSWORD</Text>
          <View style={s.inputCard}>
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color={C.muted}
              style={{ marginRight: 12 }}
            />
            <TextInput
              placeholder="Enter your password"
              placeholderTextColor={C.muted}
              value={password}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showPass}
              onChangeText={setPassword}
              style={s.input}
            />
            <TouchableOpacity onPress={() => setShowPass(!showPass)}>
              <Ionicons
                name={showPass ? "eye-off-outline" : "eye-outline"}
                size={18}
                color={C.muted}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={s.forgotRow}
            onPress={() => navigation.navigate("ForgetPassword")}
          >
            <Text style={s.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.cta, loading && { opacity: 0.55 }]}
            onPress={login}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={C.bg} size="small" />
            ) : (
              <>
                <Text style={s.ctaText}>LET'S GO</Text>
                <Ionicons name="arrow-forward" size={20} color={C.bg} />
              </>
            )}
          </TouchableOpacity>

          <View style={s.divider}>
            <View style={s.divLine} />
            <Text style={s.divText}>OR CONTINUE WITH</Text>
            <View style={s.divLine} />
          </View>

          <View style={s.registerRow}>
            <Text style={s.registerPrompt}>New to FitTrack? </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Register")}>
              <Text style={s.registerLink}>Create account →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1 },
  hero: {
    paddingTop: 70,
    paddingHorizontal: 28,
    paddingBottom: 36,
    position: "relative",
    overflow: "hidden",
  },
  ring: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 1,
    borderColor: "rgba(200,241,53,0.12)",
    top: -60,
    right: -80,
  },
  ringInner: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: "rgba(200,241,53,0.07)",
    top: -20,
    right: -20,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.lime,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
    marginBottom: 20,
  },
  badgeText: { color: C.bg, fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  heroTitle: {
    color: C.white,
    fontSize: 52,
    fontWeight: "900",
    lineHeight: 54,
    letterSpacing: -1.5,
    marginBottom: 12,
  },
  heroSub: {
    color: C.muted,
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  form: {
    flex: 1,
    backgroundColor: C.card,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: C.border,
  },
  label: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 8,
    marginTop: 18,
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
  forgotRow: { alignSelf: "flex-end", marginTop: 10 },
  forgotText: { color: C.lime, fontSize: 13, fontWeight: "700" },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.lime,
    borderRadius: 16,
    paddingVertical: 18,
    marginTop: 28,
    gap: 10,
    shadowColor: C.lime,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  ctaText: { color: C.bg, fontSize: 15, fontWeight: "900", letterSpacing: 2 },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 28,
    marginBottom: 20,
    gap: 12,
  },
  divLine: { flex: 1, height: 1, backgroundColor: C.border },
  divText: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  registerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 28,
  },
  registerPrompt: { color: C.muted, fontSize: 14 },
  registerLink: { color: C.lime, fontSize: 14, fontWeight: "800" },
});
