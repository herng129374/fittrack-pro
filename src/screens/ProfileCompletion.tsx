import React, { useState, useEffect } from "react";
import {
  View,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
  StyleSheet,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, updateDoc, getDoc } from "firebase/firestore";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MainStackParamList } from "../types/navigation";
import { Ionicons } from "@expo/vector-icons";

// ── Palette (matches Home.tsx) ────────────────────────────
const C = {
  bg: "#0d0d0f",
  surface: "#16171b",
  card: "#1c1d23",
  cardAlt: "#212330",
  lime: "#c8f135",
  limeDeep: "#9dbf1e",
  white: "#f2f2f4",
  muted: "#6b6d7a",
  mutedLight: "#9496a1",
  border: "#26272f",
  blue: "#4e8ef7",
  danger: "#ff4f4f",
};

// ── BMI category helper ───────────────────────────────────
function getBMIInfo(bmi: number): { label: string; color: string } {
  if (bmi < 18.5) return { label: "Underweight", color: C.blue };
  if (bmi < 25) return { label: "Normal", color: C.lime };
  if (bmi < 30) return { label: "Overweight", color: "#ff9f43" };
  return { label: "Obese", color: C.danger };
}

export default function ProfileCompletion({
  navigation,
}: NativeStackScreenProps<MainStackParamList, "ProfileCompletion">) {
  const auth = getAuth();
  const db = getFirestore();

  const [height, setHeight] = useState<string>("");
  const [weight, setWeight] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [heightFocused, setHeightFocused] = useState(false);
  const [weightFocused, setWeightFocused] = useState(false);

  // Live BMI preview
  const h = parseFloat(height);
  const w = parseFloat(weight);
  const liveBMI = h > 0 && w > 0 ? w / (h / 100) ** 2 : null;
  const bmiInfo = liveBMI ? getBMIInfo(liveBMI) : null;

  // ✅ Load existing data into fields, no redirect
  useEffect(() => {
    const loadExistingData = async () => {
      if (!auth.currentUser) return;
      const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        if (data?.height) setHeight(String(data.height));
        if (data?.weight) setWeight(String(data.weight));
      }
    };
    loadExistingData();
  }, []);

  async function completeProfile() {
    if (!height || !weight) {
      Alert.alert("Incomplete Info", "Please fill in your height and weight");
      return;
    }
    setLoading(true);
    const bmi = parseFloat(weight) / (parseFloat(height) / 100) ** 2;

    try {
      if (!auth.currentUser) throw new Error("User not logged in");

      const userRef = doc(db, "users", auth.currentUser.uid);
      const userDoc = await getDoc(userRef);
      const existing = userDoc.exists() ? userDoc.data() : {};

      await updateDoc(userRef, {
        height: parseFloat(height),
        weight: parseFloat(weight),
        bmi: bmi.toFixed(1),
        profileCompleted: true,
        ...(existing?.tokens === undefined && { tokens: 0 }),
        ...(existing?.dailyTasks === undefined && {
          dailyTasks: [
            { id: "t1", name: "Run 15 mins", completed: false },
            { id: "t2", name: "Push-ups 20 reps", completed: false },
            { id: "t3", name: "Stretching 10 mins", completed: false },
          ],
        }),
      });

      setLoading(false);
      navigation.goBack();
    } catch (error: any) {
      setLoading(false);
      Alert.alert("Error", error.message || "Something went wrong");
    }
  }

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={{ flex: 1, backgroundColor: C.bg }}
    >
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={22} color={C.white} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Edit Profile</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* ── Hero Banner ── */}
        <View style={s.heroBanner}>
          <View style={s.heroBannerAccent} />
          <View style={s.heroIconWrap}>
            <Ionicons name="body" size={36} color={C.lime} />
          </View>
          <Text style={s.heroTitle}>Your Body Stats</Text>
          <Text style={s.heroSub}>
            We use this to calculate your BMI and personalise your workout plan.
          </Text>
        </View>

        {/* ── Input Cards ── */}
        <View style={s.inputGroup}>
          {/* Height */}
          <View style={s.inputLabel}>
            <Ionicons name="resize-outline" size={15} color={C.muted} />
            <Text style={s.inputLabelText}>HEIGHT</Text>
          </View>
          <View style={[s.inputCard, heightFocused && s.inputCardFocused]}>
            <TextInput
              placeholder="e.g. 170"
              placeholderTextColor={C.muted}
              keyboardType="numeric"
              value={height}
              onChangeText={setHeight}
              onFocus={() => setHeightFocused(true)}
              onBlur={() => setHeightFocused(false)}
              style={s.input}
            />
            <View style={s.inputUnit}>
              <Text style={s.inputUnitText}>cm</Text>
            </View>
          </View>

          {/* Weight */}
          <View style={[s.inputLabel, { marginTop: 20 }]}>
            <Ionicons name="barbell-outline" size={15} color={C.muted} />
            <Text style={s.inputLabelText}>WEIGHT</Text>
          </View>
          <View style={[s.inputCard, weightFocused && s.inputCardFocused]}>
            <TextInput
              placeholder="e.g. 65"
              placeholderTextColor={C.muted}
              keyboardType="numeric"
              value={weight}
              onChangeText={setWeight}
              onFocus={() => setWeightFocused(true)}
              onBlur={() => setWeightFocused(false)}
              style={s.input}
            />
            <View style={s.inputUnit}>
              <Text style={s.inputUnitText}>kg</Text>
            </View>
          </View>
        </View>

        {/* ── Live BMI Preview ── */}
        {liveBMI && bmiInfo ? (
          <View style={[s.bmiCard, { borderColor: bmiInfo.color + "44" }]}>
            <View style={s.bmiLeft}>
              <Text style={s.bmiLabel}>YOUR BMI</Text>
              <Text style={[s.bmiValue, { color: bmiInfo.color }]}>
                {liveBMI.toFixed(1)}
              </Text>
            </View>
            <View
              style={[s.bmiPill, { backgroundColor: bmiInfo.color + "22" }]}
            >
              <View style={[s.bmiDot, { backgroundColor: bmiInfo.color }]} />
              <Text style={[s.bmiCategory, { color: bmiInfo.color }]}>
                {bmiInfo.label}
              </Text>
            </View>
          </View>
        ) : (
          <View style={[s.bmiCard, { borderColor: C.border }]}>
            <Ionicons
              name="pulse-outline"
              size={18}
              color={C.muted}
              style={{ marginRight: 10 }}
            />
            <Text style={s.bmiPlaceholder}>
              Fill in both fields to see your BMI
            </Text>
          </View>
        )}

        {/* ── BMI Scale ── */}
        <View style={s.scaleRow}>
          {[
            { label: "Under", range: "< 18.5", color: C.blue },
            { label: "Normal", range: "18.5–24.9", color: C.lime },
            { label: "Over", range: "25–29.9", color: "#ff9f43" },
            { label: "Obese", range: "≥ 30", color: C.danger },
          ].map((item) => (
            <View key={item.label} style={s.scaleItem}>
              <View style={[s.scaleDot, { backgroundColor: item.color }]} />
              <Text style={s.scaleLabel}>{item.label}</Text>
              <Text style={s.scaleRange}>{item.range}</Text>
            </View>
          ))}
        </View>

        {/* ── Save Button ── */}
        <TouchableOpacity
          style={[s.saveBtn, loading && s.saveBtnDisabled]}
          onPress={completeProfile}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={C.bg} size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color={C.bg} />
              <Text style={s.saveBtnText}>Save Profile</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────
const s = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 40,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
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
  headerTitle: {
    color: C.white,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },

  // Hero Banner
  heroBanner: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 24,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    alignItems: "center",
  },
  heroBannerAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: C.lime,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  heroIconWrap: {
    width: 70,
    height: 70,
    borderRadius: 22,
    backgroundColor: C.lime + "18",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
    marginTop: 4,
    borderWidth: 1,
    borderColor: C.lime + "30",
  },
  heroTitle: {
    color: C.white,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  heroSub: {
    color: C.muted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },

  // Input
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  inputLabelText: {
    color: C.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  inputCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  inputCardFocused: {
    borderColor: C.lime,
  },
  input: {
    flex: 1,
    color: C.white,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    paddingVertical: 14,
  },
  inputUnit: {
    backgroundColor: "#212330",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  inputUnitText: {
    color: "#9496a1",
    fontSize: 13,
    fontWeight: "700",
  },

  // BMI Card
  bmiCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 18,
    marginBottom: 14,
  },
  bmiLeft: {
    flex: 1,
  },
  bmiLabel: {
    color: C.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  bmiValue: {
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: -1,
  },
  bmiPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  bmiDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bmiCategory: {
    fontSize: 14,
    fontWeight: "800",
  },
  bmiPlaceholder: {
    color: C.muted,
    fontSize: 13,
    fontWeight: "500",
  },

  // BMI Scale
  scaleRow: {
    flexDirection: "row",
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 28,
    justifyContent: "space-between",
  },
  scaleItem: {
    alignItems: "center",
    flex: 1,
  },
  scaleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 5,
  },
  scaleLabel: {
    color: C.white,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 2,
  },
  scaleRange: {
    color: C.muted,
    fontSize: 10,
  },

  // Save Button
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.lime,
    borderRadius: 18,
    paddingVertical: 18,
    gap: 10,
    shadowColor: C.lime,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: C.bg,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
});
