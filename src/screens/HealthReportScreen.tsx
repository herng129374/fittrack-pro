// HealthReportScreen.tsx
// Health report page with manual data entry, smartwatch app links,
// and AI-powered health analysis via the Gemini backend.

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  StatusBar,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
  Animated,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getAuth } from "firebase/auth";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

// ── Palette (matches app theme) ──────────────────────────
const C = {
  bg: "#0d0d0f",
  card: "#1c1d23",
  card2: "#212330",
  lime: "#c8f135",
  white: "#f2f2f4",
  muted: "#6b6d7a",
  border: "#26272f",
  danger: "#ff4f4f",
  blue: "#4e8ef7",
  green: "#22c55e",
  orange: "#f97316",
  pink: "#ff4d6d",
  purple: "#a855f7",
  gold: "#fbbf24",
} as const;

const BACKEND_URL = "http://192.168.68.140:5000";

// ── Types ─────────────────────────────────────────────────
interface HealthData {
  // Today's summary
  calories: string;
  steps: string;
  workoutMinutes: string;
  sleepHours: string;
  // Body composition
  weight: string;
  height: string;
  bodyFat: string;
  // Vital signs
  heartRate: string;
  systolic: string; // blood pressure
  diastolic: string;
  spo2: string;
  // Nutrition
  protein: string;
  carbs: string;
  fat: string;
  water: string;
  // Goals
  goalWeight: string;
  goalCalories: string;
  goalSteps: string;
  // Meta
  age: string;
  gender: string;
  activityLevel: string;
}

const EMPTY: HealthData = {
  calories: "",
  steps: "",
  workoutMinutes: "",
  sleepHours: "",
  weight: "",
  height: "",
  bodyFat: "",
  heartRate: "",
  systolic: "",
  diastolic: "",
  spo2: "",
  protein: "",
  carbs: "",
  fat: "",
  water: "",
  goalWeight: "",
  goalCalories: "",
  goalSteps: "",
  age: "",
  gender: "Male",
  activityLevel: "Moderate",
};

// ── Helper: BMI ───────────────────────────────────────────
function calcBMI(
  weight: string,
  height: string,
): { value: number; label: string; color: string } | null {
  const w = parseFloat(weight);
  const h = parseFloat(height) / 100;
  if (!w || !h) return null;
  const bmi = w / (h * h);
  let label: string = "Normal";
  let color: string = C.green;
  if (bmi < 18.5) {
    label = "Underweight";
    color = C.blue;
  } else if (bmi >= 25 && bmi < 30) {
    label = "Overweight";
    color = C.orange;
  } else if (bmi >= 30) {
    label = "Obese";
    color = C.danger;
  }
  return { value: Math.round(bmi * 10) / 10, label, color };
}

// ── Health Score ──────────────────────────────────────────
function calcHealthScore(d: HealthData): number {
  let score = 50;
  const steps = parseInt(d.steps);
  if (steps >= 10000) score += 10;
  else if (steps >= 5000) score += 5;
  const sleep = parseFloat(d.sleepHours);
  if (sleep >= 7 && sleep <= 9) score += 10;
  else if (sleep >= 6) score += 5;
  const hr = parseInt(d.heartRate);
  if (hr >= 60 && hr <= 100) score += 10;
  const spo2 = parseInt(d.spo2);
  if (spo2 >= 95) score += 10;
  const workout = parseInt(d.workoutMinutes);
  if (workout >= 30) score += 10;
  if (d.water && parseFloat(d.water) >= 2) score += 5;
  if (d.protein && parseFloat(d.protein) >= 50) score += 5;
  return Math.min(score, 100);
}

// ── Section Header ────────────────────────────────────────
function SectionHeader({
  icon,
  label,
  color = C.lime,
}: {
  icon: string;
  label: string;
  color?: string;
}) {
  return (
    <View style={sh.row}>
      <View style={[sh.iconWrap, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon as any} size={15} color={color} />
      </View>
      <Text style={sh.label}>{label}</Text>
    </View>
  );
}
const sh = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    marginTop: 6,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: C.muted,
    letterSpacing: 1.5,
  },
});

// ── Metric Input ──────────────────────────────────────────
function MetricInput({
  label,
  value,
  onChange,
  unit,
  placeholder,
  keyboardType = "numeric",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  placeholder?: string;
  keyboardType?: any;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={mi.wrap}>
      <Text style={mi.label}>{label}</Text>
      <View style={[mi.inputRow, focused && { borderColor: C.lime }]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          style={mi.input}
          placeholder={placeholder ?? "—"}
          placeholderTextColor={C.muted}
          keyboardType={keyboardType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {unit && <Text style={mi.unit}>{unit}</Text>}
      </View>
    </View>
  );
}
const mi = StyleSheet.create({
  wrap: { flex: 1, minWidth: "45%" },
  label: { fontSize: 11, color: C.muted, fontWeight: "600", marginBottom: 5 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    height: 40,
  },
  input: { flex: 1, color: C.white, fontSize: 14, fontWeight: "700" },
  unit: { color: C.muted, fontSize: 11, marginLeft: 4 },
});

// ── Stat Display Card (read-only) ─────────────────────────
function StatCard({
  label,
  value,
  unit,
  color = C.white,
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
}) {
  return (
    <View style={sc.card}>
      <Text style={sc.label}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
        <Text style={[sc.value, { color }]}>{value || "—"}</Text>
        {unit && <Text style={sc.unit}>{unit}</Text>}
      </View>
    </View>
  );
}
const sc = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: C.card2,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    minWidth: "45%",
  },
  label: {
    fontSize: 10,
    color: C.muted,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  value: { fontSize: 20, fontWeight: "900", color: C.white },
  unit: { fontSize: 11, color: C.muted },
});

// ── Smartwatch Link Button ────────────────────────────────
function WatchLinkBtn({
  icon,
  label,
  sub,
  color,
  onPress,
}: {
  icon: string;
  label: string;
  sub: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[wl.btn, { borderColor: color + "44" }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[wl.iconWrap, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon as any} size={22} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={wl.label}>{label}</Text>
        <Text style={wl.sub}>{sub}</Text>
      </View>
      <Ionicons name="open-outline" size={16} color={C.muted} />
    </TouchableOpacity>
  );
}
const wl = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.card2,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  label: { fontSize: 14, fontWeight: "700", color: C.white },
  sub: { fontSize: 11, color: C.muted, marginTop: 1 },
});

// ── PDF Report Generation ──────────────────────────────────
// Builds the HTML that expo-print renders into a PDF. This is a real
// print layout (not a screenshot of the dark app UI) — light background,
// serif-free but print-appropriate type scale, a cover band, a stat-card
// grid instead of raw tables, colour-coded status per metric, and the AI
// narrative rendered as structured sections (matching the 5 headings the
// prompt asks Gemini for) rather than one dumped paragraph blob.
function buildReportHTML(
  data: HealthData,
  bmi: { value: number; label: string; color: string } | null,
  score: number,
  aiReport: string,
): string {
  const dateStr = new Date().toLocaleDateString("en-MY", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const scoreColor =
    score >= 80
      ? "#22c55e"
      : score >= 60
        ? "#84cc16"
        : score >= 40
          ? "#f97316"
          : "#ef4444";
  const scoreLabel =
    score >= 80
      ? "Excellent"
      : score >= 60
        ? "Good"
        : score >= 40
          ? "Fair"
          : "Needs Attention";

  // A single metric "stat card" — blank if the field is empty, so the
  // grid only ever shows data the user actually entered.
  const stat = (
    label: string,
    value: string,
    unit = "",
    status?: { ok: boolean },
  ) => {
    if (!value) return "";
    const dot = status
      ? `<span class="dot" style="background:${status.ok ? "#22c55e" : "#ef4444"}"></span>`
      : "";
    return `
      <div class="stat">
        <div class="stat-label">${dot}${label}</div>
        <div class="stat-value">${value}<span class="stat-unit">${unit}</span></div>
      </div>`;
  };

  const bodyStats = [
    stat("Weight", data.weight, "kg"),
    stat("Height", data.height, "cm"),
    bmi
      ? stat("BMI", `${bmi.value}`, bmi.label, { ok: bmi.label === "Normal" })
      : "",
    stat("Body Fat", data.bodyFat, "%"),
  ]
    .filter(Boolean)
    .join("");

  const vitalStats = [
    stat(
      "Heart Rate",
      data.heartRate,
      "bpm",
      data.heartRate
        ? { ok: +data.heartRate >= 60 && +data.heartRate <= 100 }
        : undefined,
    ),
    data.systolic && data.diastolic
      ? stat("Blood Pressure", `${data.systolic}/${data.diastolic}`, "mmHg", {
          ok: +data.systolic <= 130,
        })
      : "",
    stat(
      "SpO₂",
      data.spo2,
      "%",
      data.spo2 ? { ok: +data.spo2 >= 95 } : undefined,
    ),
  ]
    .filter(Boolean)
    .join("");

  const activityStats = [
    stat("Calories", data.calories, "kcal"),
    stat("Steps", data.steps, ""),
    stat("Workout", data.workoutMinutes, "min"),
    stat("Sleep", data.sleepHours, "hrs"),
    stat("Water", data.water, "L"),
  ]
    .filter(Boolean)
    .join("");

  const nutritionStats = [
    stat("Protein", data.protein, "g"),
    stat("Carbs", data.carbs, "g"),
    stat("Fat", data.fat, "g"),
  ]
    .filter(Boolean)
    .join("");

  const goalStats = [
    stat("Target Weight", data.goalWeight, "kg"),
    stat("Calorie Goal", data.goalCalories, "kcal"),
    stat("Steps Goal", data.goalSteps, ""),
  ]
    .filter(Boolean)
    .join("");

  const section = (title: string, statsHtml: string) =>
    statsHtml
      ? `<div class="section"><div class="section-title">${title}</div><div class="stat-grid">${statsHtml}</div></div>`
      : "";

  // Split the AI narrative into its numbered headings (matching the
  // prompt's 5-part structure) so each becomes its own styled block
  // instead of one long unstructured paragraph.
  const aiBlocks = aiReport
    .split(/\n(?=\d\.\s*[📊✅⚠️🎯💡])/)
    .map((block) => block.trim())
    .filter(Boolean);

  const aiHtml = aiBlocks
    .map((block) => {
      const firstLineEnd = block.indexOf("\n");
      const heading = (
        firstLineEnd === -1 ? block : block.slice(0, firstLineEnd)
      )
        .replace(/^\d\.\s*/, "")
        .trim();
      const rest = (
        firstLineEnd === -1 ? "" : block.slice(firstLineEnd + 1)
      ).trim();
      const bodyHtml = rest
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => `<p>${l.replace(/^[-•]\s*/, "")}</p>`)
        .join("");
      return `
        <div class="ai-block">
          <div class="ai-heading">${heading}</div>
          ${bodyHtml || `<p>${rest}</p>`}
        </div>`;
    })
    .join("");

  const aiSection = aiReport
    ? `
      <div class="section">
        <div class="section-title">AI Health Analysis</div>
        <div class="disclaimer">⚠️ AI-generated — not a substitute for professional medical advice.</div>
        ${aiHtml || `<div class="ai-block"><p>${aiReport}</p></div>`}
      </div>`
    : "";

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
            color: #17181c;
            margin: 0;
            background: #ffffff;
          }
          .cover {
            background: linear-gradient(135deg, #17181c 0%, #2a2c35 100%);
            color: #ffffff;
            padding: 36px 40px 28px;
          }
          .brand { font-size: 11px; letter-spacing: 3px; color: #c8f135; font-weight: 700; margin-bottom: 10px; }
          .cover h1 { font-size: 26px; margin: 0 0 4px; font-weight: 800; letter-spacing: -0.5px; }
          .cover .sub { font-size: 12px; color: #9a9ba5; }
          .score-row { display: flex; align-items: center; gap: 18px; margin-top: 22px; }
          .score-badge {
            width: 74px; height: 74px; border-radius: 50%;
            border: 4px solid ${scoreColor};
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            background: rgba(255,255,255,0.04);
            flex-shrink: 0;
          }
          .score-badge .num { font-size: 22px; font-weight: 900; color: ${scoreColor}; line-height: 1; }
          .score-badge .max { font-size: 9px; color: #9a9ba5; }
          .score-text .label { font-size: 11px; color: #9a9ba5; text-transform: uppercase; letter-spacing: 1px; }
          .score-text .status { font-size: 17px; font-weight: 800; color: ${scoreColor}; margin-top: 2px; }

          .content { padding: 26px 40px 40px; }
          .section { margin-bottom: 22px; page-break-inside: avoid; }
          .section-title {
            font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px;
            color: #6b6d7a; font-weight: 700; margin-bottom: 10px;
            border-bottom: 1.5px solid #ececec; padding-bottom: 6px;
          }
          .stat-grid { display: flex; flex-wrap: wrap; gap: 10px; }
          .stat {
            flex: 1 1 21%; min-width: 110px;
            background: #f6f6f7; border-radius: 10px; padding: 10px 12px;
            border: 1px solid #ececec;
          }
          .stat-label { font-size: 9.5px; color: #6b6d7a; font-weight: 600; letter-spacing: 0.3px; margin-bottom: 3px; display: flex; align-items: center; gap: 5px; }
          .dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
          .stat-value { font-size: 16px; font-weight: 800; color: #17181c; }
          .stat-unit { font-size: 10px; font-weight: 600; color: #9a9ba5; margin-left: 3px; }

          .disclaimer {
            font-size: 10.5px; color: #9a5b00; background: #fff4e0;
            padding: 9px 12px; border-radius: 8px; margin-bottom: 12px;
          }
          .ai-block { margin-bottom: 14px; }
          .ai-heading { font-size: 12.5px; font-weight: 800; color: #17181c; margin-bottom: 5px; }
          .ai-block p { font-size: 12px; line-height: 1.75; color: #3a3b42; margin: 0 0 5px; }

          .footer {
            padding: 16px 40px; border-top: 1px solid #ececec;
            font-size: 9.5px; color: #9a9ba5; display: flex; justify-content: space-between;
          }
        </style>
      </head>
      <body>
        <div class="cover">
          <div class="brand">⚡ FITTRACK</div>
          <h1>Health Report</h1>
          <div class="sub">Generated ${dateStr}</div>
          <div class="score-row">
            <div class="score-badge">
              <div class="num">${score}</div>
              <div class="max">/ 100</div>
            </div>
            <div class="score-text">
              <div class="label">Health Score</div>
              <div class="status">${scoreLabel}</div>
            </div>
          </div>
        </div>

        <div class="content">
          ${section("Body Composition", bodyStats)}
          ${section("Vital Signs", vitalStats)}
          ${section("Today's Activity", activityStats)}
          ${section("Nutrition", nutritionStats)}
          ${section("Goals", goalStats)}
          ${aiSection}
        </div>

        <div class="footer">
          <span>FitTrack Health Report</span>
          <span>${dateStr}</span>
        </div>
      </body>
    </html>
  `;
}

// ── Progress Bar ──────────────────────────────────────────
function ProgressBar({
  value,
  max,
  color = C.lime,
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <View
      style={{
        height: 6,
        backgroundColor: C.border,
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          height: 6,
          width: `${pct}%`,
          backgroundColor: color,
          borderRadius: 3,
        }}
      />
    </View>
  );
}

// ── AI Report Modal ───────────────────────────────────────
function AIReportModal({
  visible,
  report,
  onClose,
  onSharePDF,
  sharing,
}: {
  visible: boolean;
  report: string;
  onClose: () => void;
  onSharePDF: () => void;
  sharing: boolean;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={arm.root}>
        <View style={arm.hdr}>
          <View style={arm.titleRow}>
            <View style={arm.aiIcon}>
              <Ionicons name="sparkles" size={18} color={C.lime} />
            </View>
            <Text style={arm.title}>AI Health Analysis</Text>
          </View>
          <TouchableOpacity style={arm.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={C.white} />
          </TouchableOpacity>
        </View>
        <ScrollView
          contentContainerStyle={arm.body}
          showsVerticalScrollIndicator={false}
        >
          <Text style={arm.disclaimer}>
            ⚠️ This analysis is AI-generated and not a substitute for
            professional medical advice.
          </Text>
          <Text style={arm.report}>{report}</Text>
        </ScrollView>
        <View style={arm.footer}>
          <TouchableOpacity
            style={[arm.shareBtn, sharing && { opacity: 0.6 }]}
            onPress={onSharePDF}
            disabled={sharing}
            activeOpacity={0.85}
          >
            {sharing ? (
              <ActivityIndicator size="small" color={C.bg} />
            ) : (
              <>
                <Ionicons name="share-outline" size={16} color={C.bg} />
                <Text style={arm.shareBtnTxt}>Share as PDF</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={arm.closeFullBtn} onPress={onClose}>
            <Text style={arm.closeFullBtnTxt}>Close Report</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
const arm = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  hdr: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  aiIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.lime + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontSize: 16, fontWeight: "800", color: C.white },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
  },
  body: { padding: 18, paddingBottom: 40 },
  disclaimer: {
    backgroundColor: C.orange + "18",
    borderWidth: 1,
    borderColor: C.orange + "40",
    borderRadius: 10,
    padding: 12,
    fontSize: 12,
    color: C.orange,
    marginBottom: 16,
    lineHeight: 18,
  },
  report: { fontSize: 14, color: C.white, lineHeight: 24, opacity: 0.9 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: C.border,
    gap: 10,
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.lime,
    borderRadius: 14,
    padding: 14,
  },
  shareBtnTxt: { color: C.bg, fontSize: 14, fontWeight: "800" },
  closeFullBtn: {
    backgroundColor: C.card2,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  closeFullBtnTxt: { color: C.white, fontSize: 14, fontWeight: "700" },
});

// ── Main Screen ───────────────────────────────────────────
export default function HealthReportScreen() {
  const auth = getAuth();
  const db = getFirestore();
  const [data, setData] = useState<HealthData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiReport, setAiReport] = useState("");
  const [reportVisible, setReportVisible] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [sharingPdf, setSharingPdf] = useState(false);

  const bmi = calcBMI(data.weight, data.height);
  const score = calcHealthScore(data);

  // Score ring animation
  const ringAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(ringAnim, {
      toValue: score / 100,
      duration: 1000,
      useNativeDriver: false,
    }).start();
  }, [score]);

  const scoreColor =
    score >= 80
      ? C.green
      : score >= 60
        ? C.lime
        : score >= 40
          ? C.orange
          : C.danger;

  // Load saved health data from Firestore
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    getDoc(doc(db, "users", user.uid, "health", "latest"))
      .then((snap) => {
        if (snap.exists()) {
          setData({ ...EMPTY, ...(snap.data() as Partial<HealthData>) });
          setLastSaved(snap.data().savedAt ?? null);
        }
      })
      .catch(console.error);
  }, []);

  const setField = (key: keyof HealthData, val: string) =>
    setData((p) => ({ ...p, [key]: val }));

  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) {
      Alert.alert("Not signed in");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...data,
        savedAt: new Date().toISOString().slice(0, 10),
      };
      await setDoc(doc(db, "users", user.uid, "health", "latest"), payload);
      setLastSaved(payload.savedAt);
      Alert.alert("✅ Saved", "Your health data has been saved.");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
    setSaving(false);
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const prompt = `
You are a professional health and fitness advisor. Based on the following user health data, provide a comprehensive but concise health report with insights and actionable recommendations. Be encouraging but honest.

USER PROFILE:
- Age: ${data.age || "Not provided"}, Gender: ${data.gender}, Activity Level: ${data.activityLevel}

TODAY'S ACTIVITY:
- Calories consumed: ${data.calories || "N/A"} kcal
- Steps taken: ${data.steps || "N/A"}
- Workout duration: ${data.workoutMinutes || "N/A"} minutes
- Sleep: ${data.sleepHours || "N/A"} hours
- Water intake: ${data.water || "N/A"} L

BODY COMPOSITION:
- Weight: ${data.weight || "N/A"} kg, Height: ${data.height || "N/A"} cm
- BMI: ${bmi ? `${bmi.value} (${bmi.label})` : "N/A"}
- Body Fat: ${data.bodyFat || "N/A"}%

VITAL SIGNS:
- Heart Rate: ${data.heartRate || "N/A"} bpm
- Blood Pressure: ${data.systolic || "N/A"}/${data.diastolic || "N/A"} mmHg
- SpO2: ${data.spo2 || "N/A"}%

NUTRITION:
- Protein: ${data.protein || "N/A"}g, Carbs: ${data.carbs || "N/A"}g, Fat: ${data.fat || "N/A"}g

GOALS:
- Target Weight: ${data.goalWeight || "N/A"} kg
- Daily Calorie Goal: ${data.goalCalories || "N/A"} kcal
- Daily Steps Goal: ${data.goalSteps || "N/A"}

Health Score: ${score}/100

Please provide:
1. 📊 OVERALL HEALTH ASSESSMENT (2-3 sentences)
2. ✅ WHAT YOU'RE DOING WELL (3 points)
3. ⚠️ AREAS TO IMPROVE (3 points with specific advice)
4. 🎯 THIS WEEK'S PRIORITY (1 clear action to focus on)
5. 💡 PERSONALISED TIP (based on their specific data)
      `.trim();

      const res = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
      });

      if (!res.ok) throw new Error(`Backend error: ${res.status}`);
      const json = await res.json();
      const text: string =
        json.reply || json.response || json.message || JSON.stringify(json);
      setAiReport(text);
      setReportVisible(true);
    } catch (e: any) {
      Alert.alert(
        "Analysis failed",
        e.message ?? "Could not connect to AI service.",
      );
    }
    setAnalyzing(false);
  };

  // Generates a PDF (data + AI report if available) and opens the native
  // share sheet so the user can send it via email, messaging apps, save
  // to files, AirDrop, etc.
  const handleSharePDF = async () => {
    setSharingPdf(true);
    try {
      const html = buildReportHTML(data, bmi, score, aiReport);
      const { uri } = await Print.printToFileAsync({ html });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(
          "Sharing unavailable",
          "Sharing is not available on this device.",
        );
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Share Health Report",
        UTI: "com.adobe.pdf",
      });
    } catch (e: any) {
      Alert.alert("Export failed", e.message ?? "Could not generate PDF.");
    } finally {
      setSharingPdf(false);
    }
  };

  // Smartwatch links
  const openXiaomiHealth = () => {
    const url =
      Platform.OS === "ios"
        ? "mishome://"
        : "intent://health.mi.com#Intent;scheme=https;end";
    Linking.canOpenURL(url).then((can) => {
      if (can) Linking.openURL(url);
      else Linking.openURL("https://health.mi.com");
    });
  };

  const openAppleHealth = () => {
    if (Platform.OS === "ios") Linking.openURL("x-apple-health://");
    else Alert.alert("Apple Health", "Apple Health is only available on iOS.");
  };

  const openGoogleFit = () => {
    Linking.canOpenURL("googlefit://").then((can) => {
      if (can) Linking.openURL("googlefit://");
      else Linking.openURL("https://fit.google.com");
    });
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Health Report</Text>
          <Text style={s.headerSub}>
            {lastSaved
              ? `Last updated ${lastSaved}`
              : "Enter your health data below"}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            style={[s.pdfBtn, sharingPdf && { opacity: 0.6 }]}
            onPress={handleSharePDF}
            disabled={sharingPdf}
          >
            {sharingPdf ? (
              <ActivityIndicator size="small" color={C.white} />
            ) : (
              <Ionicons name="share-outline" size={16} color={C.white} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={C.bg} />
            ) : (
              <>
                <Ionicons name="save-outline" size={14} color={C.bg} />
                <Text style={s.saveBtnTxt}>Save</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* ── Health Score ── */}
        <View style={s.scoreCard}>
          <View style={s.scoreLeft}>
            <View style={[s.scoreRing, { borderColor: scoreColor }]}>
              <Text style={[s.scoreNum, { color: scoreColor }]}>{score}</Text>
              <Text style={s.scoreLabel}>/ 100</Text>
            </View>
          </View>
          <View style={s.scoreRight}>
            <Text style={s.scoreTitle}>Health Score</Text>
            <Text style={[s.scoreStatus, { color: scoreColor }]}>
              {score >= 80
                ? "Excellent 🌟"
                : score >= 60
                  ? "Good 👍"
                  : score >= 40
                    ? "Fair ⚡"
                    : "Needs Attention ⚠️"}
            </Text>
            <Text style={s.scoreSub}>Based on your entered data today</Text>
            {/* Score bar */}
            <View style={{ marginTop: 10 }}>
              <ProgressBar value={score} max={100} color={scoreColor} />
            </View>
          </View>
        </View>

        {/* ── AI Analysis Button ── */}
        <TouchableOpacity
          style={[s.analyzeBtn, analyzing && { opacity: 0.6 }]}
          onPress={handleAnalyze}
          disabled={analyzing}
          activeOpacity={0.85}
        >
          {analyzing ? (
            <>
              <ActivityIndicator color={C.bg} size="small" />
              <Text style={s.analyzeBtnTxt}>Analysing your data...</Text>
            </>
          ) : (
            <>
              <Ionicons name="sparkles" size={18} color={C.bg} />
              <Text style={s.analyzeBtnTxt}>Run AI Health Analysis</Text>
            </>
          )}
        </TouchableOpacity>

        {aiReport ? (
          <TouchableOpacity
            style={s.viewReportBtn}
            onPress={() => setReportVisible(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="document-text-outline" size={16} color={C.lime} />
            <Text style={s.viewReportBtnTxt}>View last AI report</Text>
          </TouchableOpacity>
        ) : null}

        <View style={s.section}>
          {/* ── Connect Smartwatch ── */}
          <SectionHeader
            icon="watch-outline"
            label="CONNECT SMARTWATCH / HEALTH APP"
            color={C.blue}
          />
          <View style={s.watchNote}>
            <Ionicons
              name="information-circle-outline"
              size={14}
              color={C.muted}
            />
            <Text style={s.watchNoteTxt}>
              Tap to open your health app and sync data manually. Due to privacy
              policies, direct data access requires app-level integration.
            </Text>
          </View>
          <WatchLinkBtn
            icon="phone-portrait-outline"
            label="Xiaomi Health"
            sub="Mi Fitness · Xiaomi Watch"
            color={C.orange}
            onPress={openXiaomiHealth}
          />
          <WatchLinkBtn
            icon="heart-outline"
            label="Apple Health"
            sub="iOS 17+ · Apple Watch"
            color={C.pink}
            onPress={openAppleHealth}
          />
          <WatchLinkBtn
            icon="fitness-outline"
            label="Google Fit"
            sub="Android · Wear OS"
            color={C.green}
            onPress={openGoogleFit}
          />
        </View>

        {/* ── Profile ── */}
        <View style={s.section}>
          <SectionHeader
            icon="person-outline"
            label="PROFILE"
            color={C.purple}
          />
          <View style={s.row}>
            <MetricInput
              label="Age"
              value={data.age}
              onChange={(v) => setField("age", v)}
              unit="yrs"
              placeholder="25"
            />
            <View style={{ flex: 1 }}>
              <Text style={mi.label}>Gender</Text>
              <View style={s.segmentRow}>
                {["Male", "Female", "Other"].map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[s.segment, data.gender === g && s.segmentActive]}
                    onPress={() => setField("gender", g)}
                  >
                    <Text
                      style={[
                        s.segmentTxt,
                        data.gender === g && s.segmentTxtActive,
                      ]}
                    >
                      {g}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
          <View style={{ marginTop: 10 }}>
            <Text style={mi.label}>Activity Level</Text>
            <View style={s.segmentRow}>
              {["Sedentary", "Light", "Moderate", "Active", "Very Active"].map(
                (l) => (
                  <TouchableOpacity
                    key={l}
                    style={[
                      s.segment,
                      data.activityLevel === l && s.segmentActive,
                    ]}
                    onPress={() => setField("activityLevel", l)}
                  >
                    <Text
                      style={[
                        s.segmentTxt,
                        data.activityLevel === l && s.segmentTxtActive,
                      ]}
                    >
                      {l}
                    </Text>
                  </TouchableOpacity>
                ),
              )}
            </View>
          </View>
        </View>

        {/* ── Today's Summary ── */}
        <View style={s.section}>
          <SectionHeader
            icon="today-outline"
            label="TODAY'S SUMMARY"
            color={C.lime}
          />
          <View style={s.row}>
            <MetricInput
              label="Calories"
              value={data.calories}
              onChange={(v) => setField("calories", v)}
              unit="kcal"
              placeholder="2000"
            />
            <MetricInput
              label="Steps"
              value={data.steps}
              onChange={(v) => setField("steps", v)}
              placeholder="8000"
            />
          </View>
          <View style={s.row}>
            <MetricInput
              label="Workout"
              value={data.workoutMinutes}
              onChange={(v) => setField("workoutMinutes", v)}
              unit="min"
              placeholder="30"
            />
            <MetricInput
              label="Sleep"
              value={data.sleepHours}
              onChange={(v) => setField("sleepHours", v)}
              unit="hrs"
              placeholder="7.5"
            />
          </View>
          {/* Progress vs goals */}
          {data.goalSteps && data.steps && (
            <View style={s.progressItem}>
              <View style={s.progressHeader}>
                <Text style={s.progressLbl}>Steps progress</Text>
                <Text style={s.progressVal}>
                  {data.steps} / {data.goalSteps}
                </Text>
              </View>
              <ProgressBar
                value={parseInt(data.steps)}
                max={parseInt(data.goalSteps)}
                color={C.lime}
              />
            </View>
          )}
          {data.goalCalories && data.calories && (
            <View style={s.progressItem}>
              <View style={s.progressHeader}>
                <Text style={s.progressLbl}>Calories progress</Text>
                <Text style={s.progressVal}>
                  {data.calories} / {data.goalCalories} kcal
                </Text>
              </View>
              <ProgressBar
                value={parseInt(data.calories)}
                max={parseInt(data.goalCalories)}
                color={C.orange}
              />
            </View>
          )}
        </View>

        {/* ── Body Composition ── */}
        <View style={s.section}>
          <SectionHeader
            icon="body-outline"
            label="BODY COMPOSITION"
            color={C.blue}
          />
          <View style={s.row}>
            <MetricInput
              label="Weight"
              value={data.weight}
              onChange={(v) => setField("weight", v)}
              unit="kg"
              placeholder="65"
            />
            <MetricInput
              label="Height"
              value={data.height}
              onChange={(v) => setField("height", v)}
              unit="cm"
              placeholder="170"
            />
          </View>
          <View style={s.row}>
            <MetricInput
              label="Body Fat"
              value={data.bodyFat}
              onChange={(v) => setField("bodyFat", v)}
              unit="%"
              placeholder="20"
            />
            {/* BMI auto-calculated */}
            <View style={{ flex: 1 }}>
              <Text style={mi.label}>BMI (auto)</Text>
              <View
                style={[
                  mi.inputRow,
                  { borderColor: bmi ? bmi.color + "88" : C.border },
                ]}
              >
                <Text style={[mi.input, { color: bmi?.color ?? C.muted }]}>
                  {bmi ? `${bmi.value}` : "—"}
                </Text>
                {bmi && (
                  <Text style={[mi.unit, { color: bmi.color }]}>
                    {bmi.label}
                  </Text>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* ── Vital Signs ── */}
        <View style={s.section}>
          <SectionHeader
            icon="heart-outline"
            label="VITAL SIGNS"
            color={C.danger}
          />
          <View style={s.row}>
            <MetricInput
              label="Heart Rate"
              value={data.heartRate}
              onChange={(v) => setField("heartRate", v)}
              unit="bpm"
              placeholder="72"
            />
            <MetricInput
              label="SpO₂"
              value={data.spo2}
              onChange={(v) => setField("spo2", v)}
              unit="%"
              placeholder="98"
            />
          </View>
          <View style={s.row}>
            <MetricInput
              label="Systolic (BP)"
              value={data.systolic}
              onChange={(v) => setField("systolic", v)}
              unit="mmHg"
              placeholder="120"
            />
            <MetricInput
              label="Diastolic (BP)"
              value={data.diastolic}
              onChange={(v) => setField("diastolic", v)}
              unit="mmHg"
              placeholder="80"
            />
          </View>
          {/* Vitals status cards */}
          <View style={s.row}>
            <StatCard
              label="BLOOD PRESSURE"
              value={
                data.systolic && data.diastolic
                  ? `${data.systolic}/${data.diastolic}`
                  : "—"
              }
              unit="mmHg"
              color={parseInt(data.systolic) > 130 ? C.danger : C.green}
            />
            <StatCard
              label="HEART RATE"
              value={data.heartRate}
              unit="bpm"
              color={
                parseInt(data.heartRate) > 100 || parseInt(data.heartRate) < 60
                  ? C.orange
                  : C.green
              }
            />
          </View>
        </View>

        {/* ── Nutrition ── */}
        <View style={s.section}>
          <SectionHeader
            icon="nutrition-outline"
            label="NUTRITION"
            color={C.green}
          />
          <View style={s.row}>
            <MetricInput
              label="Protein"
              value={data.protein}
              onChange={(v) => setField("protein", v)}
              unit="g"
              placeholder="60"
            />
            <MetricInput
              label="Carbohydrates"
              value={data.carbs}
              onChange={(v) => setField("carbs", v)}
              unit="g"
              placeholder="200"
            />
          </View>
          <View style={s.row}>
            <MetricInput
              label="Fat"
              value={data.fat}
              onChange={(v) => setField("fat", v)}
              unit="g"
              placeholder="65"
            />
            <MetricInput
              label="Water"
              value={data.water}
              onChange={(v) => setField("water", v)}
              unit="L"
              placeholder="2.5"
            />
          </View>
          {/* Macro ratio visual */}
          {(data.protein || data.carbs || data.fat) && (
            <View style={s.macroBar}>
              {[
                {
                  label: "Protein",
                  val: parseFloat(data.protein) * 4 || 0,
                  color: C.blue,
                },
                {
                  label: "Carbs",
                  val: parseFloat(data.carbs) * 4 || 0,
                  color: C.lime,
                },
                {
                  label: "Fat",
                  val: parseFloat(data.fat) * 9 || 0,
                  color: C.orange,
                },
              ].map((m) => {
                const total =
                  (parseFloat(data.protein) * 4 || 0) +
                  (parseFloat(data.carbs) * 4 || 0) +
                  (parseFloat(data.fat) * 9 || 0);
                const pct = total > 0 ? (m.val / total) * 100 : 0;
                return (
                  <View
                    key={m.label}
                    style={[
                      s.macroSegment,
                      { flex: pct, backgroundColor: m.color },
                    ]}
                  >
                    {pct > 12 && (
                      <Text style={s.macroSegmentTxt}>{Math.round(pct)}%</Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}
          <View style={s.macroLegend}>
            {[
              { l: "Protein", c: C.blue },
              { l: "Carbs", c: C.lime },
              { l: "Fat", c: C.orange },
            ].map((m) => (
              <View
                key={m.l}
                style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: m.c,
                  }}
                />
                <Text style={{ fontSize: 11, color: C.muted }}>{m.l}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Goals ── */}
        <View style={s.section}>
          <SectionHeader icon="flag-outline" label="GOALS" color={C.gold} />
          <View style={s.row}>
            <MetricInput
              label="Target Weight"
              value={data.goalWeight}
              onChange={(v) => setField("goalWeight", v)}
              unit="kg"
              placeholder="60"
            />
            <MetricInput
              label="Calorie Goal"
              value={data.goalCalories}
              onChange={(v) => setField("goalCalories", v)}
              unit="kcal"
              placeholder="2000"
            />
          </View>
          <View style={s.row}>
            <MetricInput
              label="Daily Steps Goal"
              value={data.goalSteps}
              onChange={(v) => setField("goalSteps", v)}
              placeholder="10000"
            />
            <View style={{ flex: 1 }} />
          </View>
          {/* Weight to goal */}
          {data.weight && data.goalWeight && (
            <View
              style={[
                s.goalCard,
                {
                  borderColor:
                    parseFloat(data.weight) > parseFloat(data.goalWeight)
                      ? C.orange + "55"
                      : C.green + "55",
                },
              ]}
            >
              <Ionicons
                name={
                  parseFloat(data.weight) > parseFloat(data.goalWeight)
                    ? "trending-down-outline"
                    : "checkmark-circle-outline"
                }
                size={20}
                color={
                  parseFloat(data.weight) > parseFloat(data.goalWeight)
                    ? C.orange
                    : C.green
                }
              />
              <View>
                <Text style={s.goalCardTitle}>
                  {parseFloat(data.weight) > parseFloat(data.goalWeight)
                    ? `${(parseFloat(data.weight) - parseFloat(data.goalWeight)).toFixed(1)} kg to lose`
                    : "Goal weight achieved! 🎉"}
                </Text>
                <Text style={s.goalCardSub}>
                  {data.weight} kg → {data.goalWeight} kg target
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Health Alerts ── */}
        <View style={s.section}>
          <SectionHeader
            icon="warning-outline"
            label="HEALTH ALERTS"
            color={C.danger}
          />
          <View style={s.alertsWrap}>
            {(() => {
              const alerts: { msg: string; color: string; icon: string }[] = [];
              if (parseInt(data.heartRate) > 100)
                alerts.push({
                  msg: "Heart rate is elevated (>100 bpm). Rest and monitor.",
                  color: C.danger,
                  icon: "heart",
                });
              if (parseInt(data.heartRate) < 60 && data.heartRate)
                alerts.push({
                  msg: "Low heart rate detected (<60 bpm).",
                  color: C.orange,
                  icon: "heart-outline",
                });
              if (parseInt(data.spo2) < 95 && data.spo2)
                alerts.push({
                  msg: "SpO₂ below 95%. Consider consulting a doctor.",
                  color: C.danger,
                  icon: "medkit-outline",
                });
              if (parseInt(data.systolic) > 130 && data.systolic)
                alerts.push({
                  msg: "High blood pressure detected. Monitor closely.",
                  color: C.danger,
                  icon: "pulse-outline",
                });
              if (parseFloat(data.sleepHours) < 6 && data.sleepHours)
                alerts.push({
                  msg: "Less than 6 hours of sleep. Aim for 7–9 hours.",
                  color: C.orange,
                  icon: "moon-outline",
                });
              if (parseInt(data.steps) < 3000 && data.steps)
                alerts.push({
                  msg: "Step count is low. Try to move more throughout the day.",
                  color: C.orange,
                  icon: "walk-outline",
                });
              if (parseFloat(data.water) < 1.5 && data.water)
                alerts.push({
                  msg: "Low water intake. Drink at least 2L daily.",
                  color: C.blue,
                  icon: "water-outline",
                });
              if (bmi && bmi.value >= 30)
                alerts.push({
                  msg: `BMI of ${bmi.value} is in the obese range. Consider consulting a nutritionist.`,
                  color: C.danger,
                  icon: "body-outline",
                });
              return alerts.length === 0 ? (
                <View style={s.noAlerts}>
                  <Ionicons name="checkmark-circle" size={24} color={C.green} />
                  <Text style={s.noAlertsTxt}>
                    No health alerts — looking good!
                  </Text>
                </View>
              ) : (
                alerts.map((a, i) => (
                  <View
                    key={i}
                    style={[s.alertItem, { borderLeftColor: a.color }]}
                  >
                    <Ionicons name={a.icon as any} size={16} color={a.color} />
                    <Text style={[s.alertTxt, { color: a.color }]}>
                      {a.msg}
                    </Text>
                  </View>
                ))
              );
            })()}
          </View>
        </View>
      </ScrollView>

      {/* AI Report Modal */}
      <AIReportModal
        visible={reportVisible}
        report={aiReport}
        onClose={() => setReportVisible(false)}
        onSharePDF={handleSharePDF}
        sharing={sharingPdf}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: C.white,
    letterSpacing: -0.5,
  },
  headerSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  pdfBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.lime,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  saveBtnTxt: { color: C.bg, fontSize: 13, fontWeight: "800" },
  scoreCard: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
    gap: 16,
  },
  scoreLeft: { alignItems: "center", justifyContent: "center" },
  scoreRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 4,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: C.card2,
  },
  scoreNum: { fontSize: 28, fontWeight: "900" },
  scoreLabel: { fontSize: 11, color: C.muted, marginTop: -2 },
  scoreRight: { flex: 1 },
  scoreTitle: { fontSize: 13, color: C.muted, fontWeight: "600" },
  scoreStatus: { fontSize: 18, fontWeight: "900", marginTop: 2 },
  scoreSub: { fontSize: 11, color: C.muted, marginTop: 3 },
  analyzeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.lime,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
  },
  analyzeBtnTxt: { fontSize: 15, fontWeight: "900", color: C.bg },
  viewReportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
  },
  viewReportBtnTxt: { fontSize: 12, fontWeight: "700", color: C.lime },
  section: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 6,
  },
  row: { flexDirection: "row", gap: 10, marginBottom: 10 },
  watchNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: C.card2,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  watchNoteTxt: { flex: 1, fontSize: 11, color: C.muted, lineHeight: 16 },
  segmentRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  segment: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.border,
  },
  segmentActive: { backgroundColor: C.lime, borderColor: C.lime },
  segmentTxt: { fontSize: 11, color: C.muted, fontWeight: "600" },
  segmentTxtActive: { color: C.bg },
  progressItem: { marginTop: 10 },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  progressLbl: { fontSize: 11, color: C.muted },
  progressVal: { fontSize: 11, color: C.white, fontWeight: "600" },
  macroBar: {
    flexDirection: "row",
    height: 24,
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 10,
    marginBottom: 6,
  },
  macroSegment: { justifyContent: "center", alignItems: "center" },
  macroSegmentTxt: { fontSize: 10, fontWeight: "800", color: C.bg },
  macroLegend: { flexDirection: "row", gap: 14, marginTop: 4 },
  goalCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.card2,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
  },
  goalCardTitle: { fontSize: 13, fontWeight: "700", color: C.white },
  goalCardSub: { fontSize: 11, color: C.muted, marginTop: 2 },
  alertsWrap: { gap: 8 },
  alertItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    backgroundColor: C.card2,
    borderRadius: 10,
    padding: 11,
    borderLeftWidth: 3,
  },
  alertTxt: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  noAlerts: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
  },
  noAlertsTxt: { color: C.green, fontSize: 13, fontWeight: "700" },
});
