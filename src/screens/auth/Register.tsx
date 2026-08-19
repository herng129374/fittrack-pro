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
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import DropDownPicker from "react-native-dropdown-picker";
import { TextInputMask } from "react-native-masked-text";

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

const STEPS = ["Account", "Profile", "Details"];

export default function Register({
  navigation,
}: NativeStackScreenProps<AuthStackParamList, "Register">) {
  const auth = getAuth();
  const db = getFirestore();

  const [step, setStep] = useState(0);
  const [displayname, setDisplayname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [genderValue, setGenderValue] = useState("");
  const [birth_date, setBirth_date] = useState("");
  const [genderOpen, setGenderOpen] = useState(false);
  const [genderItems, setGenderItems] = useState([
    { label: "Select Gender", value: "" },
    { label: "Male", value: "male" },
    { label: "Female", value: "female" },
  ]);

  const photoURL =
    "https://firebasestorage.googleapis.com/v0/b/miniprojectcy.firebasestorage.app/o/users%2FZ1UM4inolDf9nTGFdhEJwI5kjmO2%2Fprofile.jpg?alt=media&token=91c290a6-43f1-4af0-a2b2-b6ea4f3ea179";

  const stepValidate = () => {
    if (step === 0) {
      if (!email) return alert("Email is required");
      if (!password) return alert("Password is required");
      if (password !== confirmPassword) return alert("Passwords do not match");
      setStep(1);
    } else if (step === 1) {
      if (!displayname) return alert("Display name is required");
      setStep(2);
    } else {
      register();
    }
  };

  async function register() {
    if (!genderValue) return alert("Gender is required");
    if (!birth_date) return alert("Birth date is required");
    setLoading(true);
    await createUserWithEmailAndPassword(auth, email, password)
      .then(() => {
        if (auth.currentUser) {
          const currentUser: any = auth.currentUser;
          updateProfile(currentUser, { displayName: displayname, photoURL })
            .then(async () => {
              await setDoc(doc(db, "users", currentUser.uid), {
                email: currentUser.email,
                displayName: displayname,
                photoURL,
                gender: genderValue,
                birthDate: birth_date,
                tokenId: "-",
                role: "user", // ← default role, only admin can change this
              });
            })
            .catch((e) => {
              setLoading(false);
              alert(e.message);
            });
        }
      })
      .catch((e) => {
        setLoading(false);
        alert(e.message);
      });
  }

  const stepIcons = [
    "mail-outline",
    "person-outline",
    "fitness-outline",
  ] as const;

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
          {step > 0 && (
            <TouchableOpacity
              style={s.backBtn}
              onPress={() => setStep(step - 1)}
            >
              <Ionicons name="chevron-back" size={20} color={C.white} />
            </TouchableOpacity>
          )}
          <View style={s.headerCenter}>
            <View style={s.badge}>
              <Ionicons name="flash" size={12} color={C.bg} />
              <Text style={s.badgeText}>FITTRACK PRO</Text>
            </View>
          </View>
        </View>

        {/* ── Progress stepper ── */}
        <View style={s.stepperWrap}>
          {STEPS.map((label, i) => (
            <React.Fragment key={i}>
              <View style={s.stepItem}>
                <View style={[s.stepCircle, i <= step && s.stepCircleActive]}>
                  {i < step ? (
                    <Ionicons name="checkmark" size={14} color={C.bg} />
                  ) : (
                    <Ionicons
                      name={stepIcons[i]}
                      size={14}
                      color={i === step ? C.bg : C.muted}
                    />
                  )}
                </View>
                <Text style={[s.stepLabel, i === step && s.stepLabelActive]}>
                  {label}
                </Text>
              </View>
              {i < STEPS.length - 1 && (
                <View style={[s.stepLine, i < step && s.stepLineActive]} />
              )}
            </React.Fragment>
          ))}
        </View>

        {/* ── Title ── */}
        <View style={s.titleWrap}>
          <Text style={s.title}>
            {step === 0
              ? "CREATE\nACCOUNT"
              : step === 1
                ? "YOUR\nIDENTITY"
                : "FINAL\nSTEPS"}
          </Text>
          <Text style={s.subtitle}>
            {step === 0
              ? "Step 1 of 3 — Set up your credentials"
              : step === 1
                ? "Step 2 of 3 — Tell us who you are"
                : "Step 3 of 3 — Complete your profile"}
          </Text>
        </View>

        {/* ── Step 0: Credentials ── */}
        {step === 0 && (
          <View style={s.formCard}>
            <Text style={s.label}>EMAIL ADDRESS</Text>
            <View style={s.inputCard}>
              <Ionicons
                name="mail-outline"
                size={18}
                color={C.muted}
                style={s.icon}
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
                style={s.icon}
              />
              <TextInput
                placeholder="Min. 8 characters"
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

            <Text style={s.label}>CONFIRM PASSWORD</Text>
            <View style={s.inputCard}>
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={C.muted}
                style={s.icon}
              />
              <TextInput
                placeholder="Repeat your password"
                placeholderTextColor={C.muted}
                value={confirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showConfirm}
                onChangeText={setConfirmPassword}
                style={s.input}
              />
              <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)}>
                <Ionicons
                  name={showConfirm ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color={C.muted}
                />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Step 1: Display name ── */}
        {step === 1 && (
          <View style={s.formCard}>
            <View style={s.avatarPlaceholder}>
              <Ionicons name="person" size={38} color={C.muted} />
            </View>
            <Text style={s.label}>DISPLAY NAME</Text>
            <View style={s.inputCard}>
              <Ionicons
                name="person-outline"
                size={18}
                color={C.muted}
                style={s.icon}
              />
              <TextInput
                placeholder="Your athlete name"
                placeholderTextColor={C.muted}
                value={displayname}
                autoCapitalize="words"
                autoCorrect={false}
                onChangeText={setDisplayname}
                style={s.input}
              />
            </View>
            <View style={s.infoCard}>
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={C.lime}
              />
              <Text style={s.infoText}>
                This name will appear on your public profile and leaderboards.
              </Text>
            </View>
          </View>
        )}

        {/* ── Step 2: Gender + birthdate ── */}
        {step === 2 && (
          <View style={s.formCard}>
            <Text style={s.label}>GENDER</Text>
            <DropDownPicker
              open={genderOpen}
              value={genderValue}
              items={genderItems}
              setOpen={setGenderOpen}
              setValue={setGenderValue}
              setItems={setGenderItems}
              style={{
                backgroundColor: C.bg,
                borderColor: C.border,
                borderRadius: 14,
                minHeight: 52,
              }}
              dropDownContainerStyle={{
                backgroundColor: C.card,
                borderColor: C.border,
                borderRadius: 14,
              }}
              textStyle={{ color: C.white, fontWeight: "600" }}
              placeholderStyle={{ color: C.muted }}
              arrowIconStyle={{ tintColor: C.muted }}
              tickIconStyle={{ tintColor: C.lime }}
            />
            <Text style={[s.label, { marginTop: 20 }]}>BIRTH DATE</Text>
            <View style={s.inputCard}>
              <Ionicons
                name="calendar-outline"
                size={18}
                color={C.muted}
                style={s.icon}
              />
              <TextInputMask
                type={"datetime"}
                options={{ format: "YYYY/MM/DD" }}
                value={birth_date}
                onChangeText={setBirth_date}
                placeholder="YYYY/MM/DD"
                placeholderTextColor={C.muted}
                style={[
                  s.input,
                  { color: C.white, fontSize: 15, fontWeight: "500" },
                ]}
              />
            </View>
          </View>
        )}

        {/* ── CTA ── */}
        <TouchableOpacity
          style={[s.cta, loading && { opacity: 0.55 }]}
          onPress={stepValidate}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={C.bg} size="small" />
          ) : (
            <>
              <Text style={s.ctaText}>
                {step < 2 ? "NEXT STEP" : "CREATE ACCOUNT"}
              </Text>
              <Ionicons
                name={step < 2 ? "arrow-forward" : "checkmark"}
                size={20}
                color={C.bg}
              />
            </>
          )}
        </TouchableOpacity>

        <View style={s.loginRow}>
          <Text style={s.loginPrompt}>Already a member? </Text>
          <TouchableOpacity onPress={() => navigation.navigate("Login")}>
            <Text style={s.loginLink}>Sign in →</Text>
          </TouchableOpacity>
        </View>

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
    marginRight: 12,
  },
  headerCenter: { flex: 1, alignItems: "flex-start" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.lime,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
  },
  badgeText: { color: C.bg, fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  stepperWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 28,
    paddingTop: 8,
  },
  stepItem: { alignItems: "center", gap: 6 },
  stepCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
  },
  stepCircleActive: { backgroundColor: C.lime, borderColor: C.lime },
  stepLabel: {
    color: C.muted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  stepLabelActive: { color: C.lime },
  stepLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: C.border,
    marginBottom: 18,
  },
  stepLineActive: { backgroundColor: C.lime },
  titleWrap: { marginBottom: 24 },
  title: {
    color: C.white,
    fontSize: 46,
    fontWeight: "900",
    lineHeight: 48,
    letterSpacing: -1.5,
    marginBottom: 10,
  },
  subtitle: { color: C.muted, fontSize: 13, fontWeight: "500" },
  formCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: C.border,
    padding: 20,
    marginBottom: 24,
  },
  label: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 8,
    marginTop: 16,
  },
  inputCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.bg,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  icon: { marginRight: 12 },
  input: {
    flex: 1,
    color: C.white,
    fontSize: 15,
    fontWeight: "500",
    padding: 0,
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.cardAlt,
    borderWidth: 2,
    borderColor: C.border,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 20,
    marginTop: 4,
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
  ctaText: { color: C.bg, fontSize: 15, fontWeight: "900", letterSpacing: 2 },
  loginRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 22,
  },
  loginPrompt: { color: C.muted, fontSize: 14 },
  loginLink: { color: C.lime, fontSize: 14, fontWeight: "800" },
});
