import React, { useState, useEffect } from "react";
import {
  ScrollView,
  TouchableOpacity,
  View,
  Image,
  Alert,
  StyleSheet,
  StatusBar,
  Text,
  TextInput,
  ActivityIndicator,
  Share,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getAuth, User, updateProfile } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import * as ImagePicker from "expo-image-picker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import DropDownPicker from "react-native-dropdown-picker";
import { useAppearance } from "../screens/AppearanceContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

// ── Palette (matches Home / ProfileCompletion) ────────────
const C = {
  bg: "#0d0d0f",
  surface: "#16171b",
  card: "#1c1d23",
  cardAlt: "#212330",
  lime: "#c8f135",
  white: "#f2f2f4",
  muted: "#6b6d7a",
  mutedLight: "#9496a1",
  border: "#26272f",
  blue: "#4e8ef7",
  danger: "#ff4f4f",
  orange: "#ff9f43",
};

// ── Membership types (mirrors ChatAndCourse/chatcoursetype's
// UserMembership shape — kept local here to avoid Profile.tsx pulling in
// the whole courses feature just to read a Firestore collection) ──
interface UserMembership {
  id: string;
  planName: string;
  category: string;
  remainingCredits: number;
  totalCredits: number;
  validUntil: any; // Firestore Timestamp
  status: "active" | "expired" | "used_up";
}

function daysRemaining(validUntil: any): number {
  if (!validUntil?.toMillis) return 0;
  const ms = validUntil.toMillis() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

// ── Section Header ────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return <Text style={sec.title}>{title}</Text>;
}
const sec = StyleSheet.create({
  title: {
    color: C.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 10,
    marginTop: 24,
  },
});

// ── Field Row (label + input) ─────────────────────────────
function FieldRow({
  icon,
  label,
  value,
  onChangeText,
  placeholder,
  editable = true,
  keyboardType = "default",
}: {
  icon: string;
  label: string;
  value: string;
  onChangeText?: (t: string) => void;
  placeholder?: string;
  editable?: boolean;
  keyboardType?: any;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        field.card,
        focused && field.cardFocused,
        !editable && field.cardDisabled,
      ]}
    >
      <View style={field.iconWrap}>
        <Ionicons
          name={icon as any}
          size={17}
          color={editable ? C.lime : C.muted}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={field.label}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.muted}
          editable={editable}
          keyboardType={keyboardType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[field.input, !editable && { color: C.muted }]}
        />
      </View>
      {!editable && (
        <Ionicons name="lock-closed-outline" size={14} color={C.muted} />
      )}
    </View>
  );
}
const field = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    gap: 12,
  },
  cardFocused: { borderColor: C.lime },
  cardDisabled: { opacity: 0.6 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: C.cardAlt,
    justifyContent: "center",
    alignItems: "center",
  },
  label: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 2,
  },
  input: {
    color: C.white,
    fontSize: 15,
    fontWeight: "600",
    padding: 0,
  },
});

// ── Settings Row ──────────────────────────────────────────
function SettingsRow({
  icon,
  label,
  sub,
  onPress,
  color = C.white,
  rightEl,
}: {
  icon: string;
  label: string;
  sub?: string;
  onPress: () => void;
  color?: string;
  rightEl?: React.ReactNode;
}) {
  return (
    <TouchableOpacity style={sr.row} onPress={onPress} activeOpacity={0.75}>
      <View style={[sr.iconWrap, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[sr.label, { color }]}>{label}</Text>
        {sub ? <Text style={sr.sub}>{sub}</Text> : null}
      </View>
      {rightEl ?? <Ionicons name="chevron-forward" size={16} color={C.muted} />}
    </TouchableOpacity>
  );
}
const sr = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 8,
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
  },
  sub: {
    color: C.muted,
    fontSize: 12,
    marginTop: 1,
  },
});

// ── Generate PDF HTML ─────────────────────────────────────
function buildReportHTML(profile: any, userData: any): string {
  const tasks = (userData?.dailyTasks || [])
    .map(
      (t: any) => `
      <tr>
        <td style="padding:8px 12px;">${t.name}</td>
        <td style="padding:8px 12px; text-align:center; color:${t.completed ? "#c8f135" : "#ff4f4f"}">
          ${t.completed ? "✅ Done" : "⏳ Pending"}
        </td>
      </tr>`,
    )
    .join("");

  const bmiColor = !userData?.bmi
    ? "#9496a1"
    : parseFloat(userData.bmi) < 18.5
      ? "#4e8ef7"
      : parseFloat(userData.bmi) < 25
        ? "#c8f135"
        : parseFloat(userData.bmi) < 30
          ? "#ff9f43"
          : "#ff4f4f";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: -apple-system, sans-serif; background:#0d0d0f; color:#f2f2f4; padding:40px; }
        .header { display:flex; align-items:center; gap:20px; margin-bottom:36px; }
        .avatar { width:72px; height:72px; border-radius:50%; background:#1c1d23;
                  border:3px solid #c8f135; display:flex; align-items:center; justify-content:center;
                  font-size:28px; font-weight:900; color:#c8f135; overflow:hidden; }
        .avatar img { width:100%; height:100%; object-fit:cover; }
        h1 { font-size:26px; font-weight:900; letter-spacing:-0.5px; }
        .sub { color:#6b6d7a; font-size:13px; margin-top:4px; }
        .accent-bar { height:3px; background:#c8f135; border-radius:2px; margin-bottom:28px; }
        .section-title { font-size:11px; font-weight:700; letter-spacing:1.5px;
                         color:#6b6d7a; margin-bottom:12px; margin-top:28px; }
        .stat-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:8px; }
        .stat-card { background:#1c1d23; border-radius:12px; padding:16px;
                     border:1px solid #26272f; }
        .stat-label { font-size:10px; font-weight:700; letter-spacing:1px; color:#6b6d7a; margin-bottom:6px; }
        .stat-value { font-size:24px; font-weight:900; letter-spacing:-0.5px; }
        .stat-unit { font-size:13px; color:#9496a1; font-weight:400; }
        table { width:100%; border-collapse:collapse; background:#1c1d23;
                border-radius:12px; overflow:hidden; border:1px solid #26272f; }
        th { background:#212330; padding:10px 12px; text-align:left;
             font-size:11px; font-weight:700; letter-spacing:1px; color:#6b6d7a; }
        td { border-top:1px solid #26272f; font-size:14px; color:#f2f2f4; }
        tr:hover td { background:#212330; }
        .token-badge { display:inline-flex; align-items:center; gap:8px;
                       background:#1c1d23; border:1px solid #26272f;
                       border-radius:20px; padding:8px 16px; margin-top:12px; }
        .footer { margin-top:40px; text-align:center; color:#6b6d7a; font-size:12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="avatar">
          ${
            profile.photoURL
              ? `<img src="${profile.photoURL}" />`
              : (profile.displayName?.[0] || "?").toUpperCase()
          }
        </div>
        <div>
          <h1>${profile.displayName || "Athlete"}</h1>
          <div class="sub">${profile.email || ""} • ${profile.gender || ""} • DOB: ${profile.birthDate || "—"}</div>
          <div class="token-badge">🪙 <span style="color:#c8f135; font-weight:800;">${userData?.tokens || 0} Tokens</span></div>
        </div>
      </div>
      <div class="accent-bar"></div>

      <div class="section-title">BODY METRICS</div>
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">HEIGHT</div>
          <div class="stat-value">${userData?.height || "—"}<span class="stat-unit"> cm</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">WEIGHT</div>
          <div class="stat-value">${userData?.weight || "—"}<span class="stat-unit"> kg</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">BMI</div>
          <div class="stat-value" style="color:${bmiColor}">${userData?.bmi || "—"}</div>
        </div>
      </div>

      <div class="section-title">DAILY TASKS</div>
      <table>
        <thead><tr><th>Task</th><th style="text-align:center;">Status</th></tr></thead>
        <tbody>${tasks || '<tr><td colspan="2" style="padding:12px; color:#6b6d7a; text-align:center;">No tasks</td></tr>'}</tbody>
      </table>

      <div class="footer">
        Generated on ${new Date().toLocaleDateString()} · FitApp Health Report
      </div>
    </body>
    </html>
  `;
}

// ── Main Component ────────────────────────────────────────
export default function Profile({ navigation }: { navigation: any }) {
  const auth = getAuth();
  const db = getFirestore();
  const storage = getStorage();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>({
    displayName: "",
    email: "",
    birthDate: "",
    gender: undefined,
    photoURL: "",
  });
  const [userData, setUserData] = useState<any>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const { theme: appTheme } = useAppearance();
  const [notifEnabled, setNotifEnabled] = useState(true);

  // ── My Plans (memberships) ─────────────────────────────
  const [memberships, setMemberships] = useState<UserMembership[]>([]);

  // Gender dropdown
  const [open, setOpen] = useState(false);
  const [gender, setGender] = useState<any>(undefined);
  const [genderItems] = useState([
    { label: "Male", value: "male" },
    { label: "Female", value: "female" },
    { label: "Other", value: "other" },
  ]);

  // ── Load user data ────────────────────────────────────
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        navigation.replace("Login");
        return;
      }
      setUser(u);

      const docRef = doc(db, "users", u.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setProfile(data);
        setGender(data.gender);
        // ✅ FIX: load photoURL from Firestore (persisted), not just auth
        setImage(data.photoURL || u.photoURL || null);
        setUserData(data);
        setFollowerCount((data.followers || []).length);
        setFollowingCount((data.following || []).length);
      } else {
        const initProfile = {
          displayName: u.displayName || "",
          email: u.email || "",
          birthDate: "",
          gender: undefined,
          photoURL: u.photoURL || "",
        };
        setProfile(initProfile);
        setGender(undefined);
        setImage(u.photoURL || null);
        await setDoc(docRef, initProfile);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    AsyncStorage.getItem("notif_enabled").then((val) => {
      if (val !== null) setNotifEnabled(val === "true");
    });
  }, []);

  // Live subscription to the user's active memberships — powers the
  // "MY PLANS" section below. Only "active" status is shown here;
  // expired/used_up plans quietly drop off rather than cluttering the
  // profile with cards the user can no longer use.
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "memberships"),
      where("userId", "==", user.uid),
      where("status", "==", "active"),
    );
    return onSnapshot(
      q,
      (snap) => {
        setMemberships(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as UserMembership),
        );
      },
      (err) => console.error("Memberships snapshot error:", err),
    );
  }, [user]);

  // ── Pick image ────────────────────────────────────────
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled) setImage(result.assets[0].uri);
  };

  // ── Save profile ──────────────────────────────────────
  const handleUpdate = async () => {
    if (!user) return;
    if (!profile.displayName || !profile.birthDate || !gender) {
      Alert.alert("Incomplete Info", "Please fill in all fields");
      return;
    }
    setSaving(true);
    try {
      let photoURL = profile.photoURL;

      // ✅ FIX: upload to Firebase Storage and save URL to Firestore
      // so the photo persists across sessions and refreshes
      if (image && image !== profile.photoURL) {
        const response = await fetch(image);
        const blob = await response.blob();
        const storageRef = ref(storage, `users/${user.uid}/profile.jpg`);
        await uploadBytes(storageRef, blob);
        photoURL = await getDownloadURL(storageRef); // permanent URL
      }

      const updatedProfile = { ...profile, gender, photoURL };

      await updateProfile(user, {
        displayName: updatedProfile.displayName,
        photoURL,
      });

      await setDoc(doc(db, "users", user.uid), updatedProfile, { merge: true });

      setProfile(updatedProfile);
      setImage(photoURL); // ✅ update local state to use the permanent URL
      Alert.alert("✅ Saved", "Your profile has been updated!");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const toggleNotifications = async (val: boolean) => {
    setNotifEnabled(val);
    await AsyncStorage.setItem("notif_enabled", String(val));

    if (val) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Please enable notifications in system settings.",
        );
        setNotifEnabled(false);
        await AsyncStorage.setItem("notif_enabled", "false");
      }
    } else {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
  };

  // ── Generate & Share PDF ──────────────────────────────
  const handleShareReport = async () => {
    setGeneratingPDF(true);
    try {
      const html = buildReportHTML(profile, userData);
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Share Health Report",
        });
      } else {
        Alert.alert(
          "Sharing not available",
          "Your device does not support sharing files.",
        );
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not generate PDF");
    } finally {
      setGeneratingPDF(false);
    }
  };

  // ── Invite friends ────────────────────────────────────
  const handleInvite = async () => {
    try {
      await Share.share({
        message: `Hey! I've been using FitApp to track my fitness. Join me! 💪\n\nMy stats:\n• Height: ${userData?.height || "—"} cm\n• Weight: ${userData?.weight || "—"} kg\n• BMI: ${userData?.bmi || "—"}\n• Tokens earned: ${userData?.tokens || 0} 🪙`,
        title: "Join me on FitApp!",
      });
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  // ── Logout ────────────────────────────────────────────
  const handleLogout = async () => {
    await auth.signOut();
    navigation.replace("Login");
  };

  if (loading) {
    return (
      <View
        style={[s.root, { justifyContent: "center", alignItems: "center" }]}
      >
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={C.lime} size="large" />
      </View>
    );
  }

  const initials = profile.displayName
    ? profile.displayName
        .split(" ")
        .map((w: string) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <View style={s.root}>
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
          <Text style={s.headerTitle}>Profile</Text>
          {/* Theme toggle */}
          <TouchableOpacity style={s.backBtn} onPress={() => {}}>
            <Ionicons name="settings-outline" size={20} color={C.white} />
          </TouchableOpacity>
        </View>

        {/* ── Avatar Hero ── */}
        <View style={s.avatarSection}>
          <TouchableOpacity onPress={pickImage} activeOpacity={0.85}>
            <View style={s.avatarRing}>
              {image ? (
                <Image source={{ uri: image }} style={s.avatarImg} />
              ) : (
                <View style={s.avatarPlaceholder}>
                  <Text style={s.avatarInitials}>{initials}</Text>
                </View>
              )}
              <View style={s.avatarEditBadge}>
                <Ionicons name="camera" size={14} color={C.bg} />
              </View>
            </View>
          </TouchableOpacity>

          <Text style={s.avatarName}>{profile.displayName || "Athlete"}</Text>
          <Text style={s.avatarEmail}>{profile.email}</Text>

          {/* Stats grid: Followers | Following | Tokens | BMI */}
          <View style={s.statsGrid}>
            <View style={s.statItem}>
              <Text style={[s.statVal, { color: C.lime }]}>
                {followerCount}
              </Text>
              <Text style={s.statLbl}>Followers</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statVal}>{followingCount}</Text>
              <Text style={s.statLbl}>Following</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={[s.statVal, { color: C.orange }]}>
                {userData?.bmi || "—"}
              </Text>
              <Text style={s.statLbl}>BMI</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={[s.statVal, { color: C.lime }]}>
                🪙 {userData?.tokens || 0}
              </Text>
              <Text style={s.statLbl}>Tokens</Text>
            </View>
          </View>
          {/* Tasks mini bar */}
          <View style={s.tasksMini}>
            <Ionicons
              name="checkmark-circle-outline"
              size={13}
              color={C.blue}
            />
            <Text style={s.tasksMiniTxt}>
              {userData?.dailyTasks?.filter((t: any) => t.completed).length ||
                0}
              /{userData?.dailyTasks?.length || 0} daily tasks completed
            </Text>
          </View>
        </View>

        {/* ── My Plans ── */}
        <SectionHeader title="MY PLANS" />
        {memberships.length === 0 ? (
          <View style={mp.emptyCard}>
            <Ionicons name="card-outline" size={22} color={C.muted} />
            <Text style={mp.emptyTxt}>You don't have any active plans</Text>
            <TouchableOpacity
              style={mp.buyBtn}
              onPress={() => navigation.navigate("PlanPicker")}
              activeOpacity={0.85}
            >
              <Text style={mp.buyBtnTxt}>Browse Plans</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {memberships.map((m) => (
              <View key={m.id} style={mp.card}>
                <View style={{ flex: 1 }}>
                  <Text style={mp.planName}>{m.planName}</Text>
                  <Text style={mp.category}>{m.category}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={mp.credits}>
                    {m.remainingCredits}/{m.totalCredits}
                  </Text>
                  <Text style={mp.daysLeft}>
                    {daysRemaining(m.validUntil)}d left
                  </Text>
                </View>
              </View>
            ))}
            <TouchableOpacity
              style={mp.viewAllBtn}
              onPress={() => navigation.navigate("PlanPicker")}
              activeOpacity={0.85}
            >
              <Ionicons name="add-circle-outline" size={16} color={C.lime} />
              <Text style={mp.viewAllTxt}>Buy / Top Up a Plan</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Personal Info ── */}
        <SectionHeader title="PERSONAL INFO" />
        <FieldRow
          icon="person-outline"
          label="DISPLAY NAME"
          value={profile.displayName}
          onChangeText={(t) => setProfile({ ...profile, displayName: t })}
          placeholder="Your name"
        />
        <FieldRow
          icon="mail-outline"
          label="EMAIL"
          value={profile.email}
          editable={false}
        />
        <FieldRow
          icon="calendar-outline"
          label="BIRTH DATE"
          value={profile.birthDate}
          onChangeText={(t) => setProfile({ ...profile, birthDate: t })}
          placeholder="YYYY-MM-DD"
        />

        {/* Gender Dropdown */}
        <Text style={[sec.title, { marginTop: 0 }]}>GENDER</Text>
        <DropDownPicker
          open={open}
          value={gender}
          items={genderItems}
          setOpen={setOpen}
          setValue={setGender}
          placeholder="Select gender"
          style={{
            backgroundColor: C.card,
            borderColor: open ? C.lime : C.border,
            borderRadius: 14,
            borderWidth: 1.5,
            marginBottom: 10,
          }}
          textStyle={{ color: C.white, fontSize: 15, fontWeight: "600" }}
          placeholderStyle={{ color: C.muted }}
          dropDownContainerStyle={{
            backgroundColor: C.card,
            borderColor: C.border,
            borderRadius: 14,
          }}
          listItemLabelStyle={{ color: C.white }}
          selectedItemLabelStyle={{ color: C.lime, fontWeight: "700" }}
          tickIconStyle={{ tintColor: C.lime } as any}
          arrowIconStyle={{ tintColor: C.mutedLight } as any}
          zIndex={1000}
        />

        {/* Save Button */}
        <TouchableOpacity
          style={[s.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleUpdate}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color={C.bg} size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color={C.bg} />
              <Text style={s.saveBtnText}>Save Profile</Text>
            </>
          )}
        </TouchableOpacity>

        {/* ── Settings ── */}
        <SectionHeader title="SETTINGS" />
        <SettingsRow
          icon="notifications-outline"
          label="Notifications"
          sub={
            notifEnabled ? "Push notifications on" : "Push notifications off"
          }
          onPress={() => toggleNotifications(!notifEnabled)}
          rightEl={
            <Switch
              value={notifEnabled}
              onValueChange={toggleNotifications}
              trackColor={{ false: C.border, true: C.lime + "88" }}
              thumbColor={notifEnabled ? C.lime : C.mutedLight}
              ios_backgroundColor={C.border}
            />
          }
        />
        <SettingsRow
          icon="shield-checkmark-outline"
          label="Security"
          sub="Choose how sensitive actions get verified"
          onPress={() => navigation.navigate("SecuritySettings")}
        />
        <SettingsRow
          icon="color-palette-outline"
          label="Appearance"
          sub={`${appTheme.presetName} theme · ${appTheme.fontSize.toUpperCase()} font`}
          color={appTheme.accentColor}
          onPress={() => navigation.navigate("AppearanceScreen")}
          rightEl={
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: appTheme.accentColor,
                  shadowColor: appTheme.accentColor,
                  shadowOpacity: 0.8,
                  shadowRadius: 4,
                }}
              />
              <Ionicons
                name="chevron-forward"
                size={16}
                color={appTheme.accentColor}
              />
            </View>
          }
        />

        {/* ── Actions ── */}
        <SectionHeader title="ACTIONS" />
        <SettingsRow
          icon="document-text-outline"
          label="Export Health Report"
          sub="Share as PDF — tasks, BMI, stats"
          color={C.lime}
          onPress={handleShareReport}
          rightEl={
            generatingPDF ? (
              <ActivityIndicator size="small" color={C.lime} />
            ) : (
              <Ionicons name="share-outline" size={16} color={C.lime} />
            )
          }
        />
        <SettingsRow
          icon="people-outline"
          label="Invite Friends"
          sub="Share your stats & invite to FitApp"
          color={C.blue}
          onPress={handleInvite}
        />

        {/* ── Danger Zone ── */}
        <SectionHeader title="ACCOUNT" />
        <SettingsRow
          icon="log-out-outline"
          label="Log Out"
          color={C.danger}
          onPress={handleLogout}
          rightEl={
            <Ionicons name="chevron-forward" size={16} color={C.danger} />
          }
        />

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

// ── My Plans styles ────────────────────────────────────────
const mp = StyleSheet.create({
  emptyCard: {
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    gap: 8,
    marginBottom: 8,
  },
  emptyTxt: { color: C.muted, fontSize: 13, fontWeight: "600" },
  buyBtn: {
    backgroundColor: C.lime,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 6,
  },
  buyBtnTxt: { color: C.bg, fontSize: 12, fontWeight: "800" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 8,
  },
  planName: { color: C.white, fontSize: 14, fontWeight: "800" },
  category: { color: C.lime, fontSize: 11, fontWeight: "700", marginTop: 2 },
  credits: { color: C.white, fontSize: 16, fontWeight: "900" },
  daysLeft: { color: C.muted, fontSize: 10, marginTop: 2 },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: C.cardAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 10,
    marginBottom: 8,
  },
  viewAllTxt: { color: C.lime, fontSize: 12, fontWeight: "700" },
});

// ── Styles ────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 40 },

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

  // Avatar
  avatarSection: {
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 24,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: C.lime,
    marginBottom: 14,
    position: "relative",
  },
  avatarImg: { width: 90, height: 90, borderRadius: 45 },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: C.cardAlt,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitials: {
    color: C.lime,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1,
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.lime,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: C.bg,
  },
  avatarName: {
    color: C.white,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  avatarEmail: {
    color: C.muted,
    fontSize: 13,
    marginBottom: 16,
  },

  // Stats grid (replaces old tokenRow)
  statsGrid: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.cardAlt,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: C.border,
    marginTop: 4,
    marginBottom: 0,
  },
  statItem: { flex: 1, alignItems: "center" },
  statVal: {
    color: C.white,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  statLbl: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
    letterSpacing: 0.5,
  },
  statDivider: { width: 1, height: 30, backgroundColor: C.border },
  tasksMini: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  tasksMiniTxt: { color: C.muted, fontSize: 12, fontWeight: "500" },

  // Save Button
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.lime,
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 14,
    gap: 8,
    shadowColor: C.lime,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  saveBtnText: {
    color: C.bg,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
});
