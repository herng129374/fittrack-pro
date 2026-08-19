import { getDocs, query, collection, where, orderBy } from "firebase/firestore";
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Dimensions,
  StatusBar,
  Text,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Pressable,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { MainStackParamList, MainTabsParamList } from "../types/navigation";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Booking, isUpcoming } from "./ChatAndCourse/chatcoursetype";
import { DailyRewardsCard } from "./Rewards/DailyRewardsCard";

// ── Backend URL ───────────────────────────────────────────
// If testing on a physical device, replace localhost with your PC's local IP
// e.g. "http://192.168.1.100:5000"
const BACKEND_URL = "http://192.168.68.140:5000";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabsParamList, "Home">,
  NativeStackScreenProps<MainStackParamList>
>;

const { width } = Dimensions.get("window");

// ── Palette ───────────────────────────────────────────────
const C = {
  bg: "#0d0d0f",
  surface: "#16171b",
  card: "#1c1d23",
  card2: "#212330",
  lime: "#c8f135",
  limeDeep: "#9dbf1e",
  white: "#f2f2f4",
  muted: "#6b6d7a",
  mutedLight: "#9496a1",
  danger: "#ff4f4f",
  blue: "#4e8ef7",
  pink: "#ff4d6d",
  green: "#22c55e",
  border: "#26272f",
  orange: "#f97316",
} as const;

// ── Types ─────────────────────────────────────────────────
interface DailyTask {
  id: string;
  name: string;
  completed: boolean;
  source?: "manual" | "course" | "ai";
  courseId?: string;
}

interface AIChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface FollowerUser {
  id: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
}

// CourseBooking replaced with the shared Booking type (imported below) —
// having two separate definitions with different `status` value sets was
// exactly what caused the "upcoming" query bug fixed in this file.

// ── Helpers ───────────────────────────────────────────────
function convId(a: string, b: string) {
  return [a, b].sort().join("_");
}

// ── Stat Pill ─────────────────────────────────────────────
function StatPill({
  icon,
  label,
  value,
  unit,
  color = C.lime,
}: {
  icon: string;
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
}) {
  return (
    <View style={[pill.wrap, { borderColor: C.border }]}>
      <View style={[pill.iconBox, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={pill.value}>
        {value}
        {unit && <Text style={pill.unit}> {unit}</Text>}
      </Text>
      <Text style={pill.label}>{label}</Text>
    </View>
  );
}
const pill = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    alignItems: "flex-start",
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  value: {
    color: C.white,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  unit: { color: C.mutedLight, fontSize: 13, fontWeight: "400" },
  label: {
    color: C.muted,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginTop: 3,
  },
});

// ── Task Row ──────────────────────────────────────────────
function TaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: DailyTask;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const sourceIcon =
    task.source === "course"
      ? "school-outline"
      : task.source === "ai"
        ? "sparkles-outline"
        : "person-outline";
  const sourceColor =
    task.source === "course" ? C.blue : task.source === "ai" ? C.lime : C.muted;

  return (
    <View style={[tr.row, task.completed && tr.rowDone]}>
      <TouchableOpacity
        style={[tr.check, task.completed && tr.checkDone]}
        onPress={onToggle}
      >
        {task.completed && <Ionicons name="checkmark" size={13} color={C.bg} />}
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={[tr.name, task.completed && tr.nameDone]}>
          {task.name}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            marginTop: 2,
          }}
        >
          <Ionicons name={sourceIcon as any} size={10} color={sourceColor} />
          <Text style={[tr.source, { color: sourceColor }]}>
            {task.source === "course"
              ? "Course task"
              : task.source === "ai"
                ? "AI suggested"
                : "Custom"}
          </Text>
        </View>
      </View>
      {!task.completed && (
        <View style={tr.badge}>
          <Text style={tr.badgeTxt}>+1 pt</Text>
        </View>
      )}
      <TouchableOpacity style={tr.delBtn} onPress={onDelete}>
        <Ionicons name="trash-outline" size={14} color={C.muted} />
      </TouchableOpacity>
    </View>
  );
}
const tr = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
    gap: 10,
  },
  rowDone: { opacity: 0.5 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: C.muted,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  checkDone: { backgroundColor: C.lime, borderColor: C.lime },
  name: { color: C.white, fontSize: 14, fontWeight: "600" },
  nameDone: { textDecorationLine: "line-through", color: C.muted },
  source: { fontSize: 10, fontWeight: "600", letterSpacing: 0.5 },
  badge: {
    backgroundColor: C.lime + "22",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeTxt: { color: C.lime, fontSize: 11, fontWeight: "700" },
  delBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: C.card2,
    justifyContent: "center",
    alignItems: "center",
  },
});

// ── Add Task Modal ────────────────────────────────────────
function AddTaskModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const handle = () => {
    if (!name.trim()) return;
    onAdd(name.trim());
    setName("");
    onClose();
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={atm.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={atm.sheet}>
          <View style={atm.handle} />
          <Text style={atm.title}>Add Custom Task</Text>
          <TextInput
            style={atm.input}
            placeholder="e.g. Morning run 5km..."
            placeholderTextColor={C.muted}
            value={name}
            onChangeText={setName}
            autoFocus
            onSubmitEditing={handle}
          />
          <TouchableOpacity
            style={[atm.addBtn, !name.trim() && { opacity: 0.4 }]}
            onPress={handle}
            disabled={!name.trim()}
          >
            <Text style={atm.addBtnTxt}>Add Task</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const atm = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  title: { fontSize: 16, fontWeight: "800", color: C.white, marginBottom: 14 },
  input: {
    backgroundColor: C.bg,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: C.white,
    fontSize: 14,
    marginBottom: 14,
  },
  addBtn: {
    backgroundColor: C.lime,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
  },
  addBtnTxt: { color: C.bg, fontSize: 14, fontWeight: "900" },
});

// ── Shared Chat Modal (used by FitAI FAB, Coach John, Coach Lisa) ─────────────
function ChatModal({
  visible,
  onClose,
  onAddTask,
  endpoint, // "/chat" | "/chat/john" | "/chat/lisa"
  coachName, // "FitAI Coach" | "Coach John" | "Coach Lisa"
  coachStatus, // subtitle text
  avatarColor, // avatar background color
  welcomeMessage,
  suggestions,
}: {
  visible: boolean;
  onClose: () => void;
  onAddTask: (taskName: string) => void;
  endpoint: string;
  coachName: string;
  coachStatus: string;
  avatarColor: string;
  welcomeMessage: string;
  suggestions: string[];
}) {
  const [messages, setMessages] = useState<AIChatMessage[]>([
    { role: "assistant", content: welcomeMessage },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Reset messages when modal opens
  useEffect(() => {
    if (visible) {
      setMessages([{ role: "assistant", content: welcomeMessage }]);
      setInput("");
    }
  }, [visible]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg: AIChatMessage = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      const rawText = await response.text();
      console.log("Status:", response.status);
      console.log("Raw response:", rawText);

      const data = JSON.parse(rawText);

      if (!response.ok) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }

      const raw: string = data.reply ?? "Sorry, I had trouble responding.";
      const taskMatch = raw.match(/\[ADD_TASK:\s*(.+?)\]/i);
      const cleanText = raw.replace(/\[ADD_TASK:\s*.+?\]/gi, "").trim();

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: cleanText },
      ]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

      if (taskMatch) {
        const taskName = taskMatch[1].trim();
        Alert.alert(
          "Add Task?",
          `${coachName} wants to add to your tasks:\n"${taskName}"`,
          [
            { text: "Skip", style: "cancel" },
            { text: "Add ✓", onPress: () => onAddTask(taskName) },
          ],
        );
      }
    } catch (e: any) {
      console.error("Backend Error:", e);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ Error: ${e.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const initials = coachName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={ai.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <StatusBar barStyle="light-content" />

        {/* Header */}
        <View style={ai.hdr}>
          <View style={ai.hdrLeft}>
            <View style={[ai.hdrAvatar, { backgroundColor: avatarColor }]}>
              <Text style={ai.hdrAvatarTxt}>{initials}</Text>
              <View style={ai.hdrOnline} />
            </View>
            <View>
              <Text style={ai.hdrName}>{coachName}</Text>
              <Text style={ai.hdrStatus}>{coachStatus}</Text>
            </View>
          </View>
          <TouchableOpacity style={ai.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={18} color={C.white} />
          </TouchableOpacity>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={ai.msgList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((m, i) => {
            const isAI = m.role === "assistant";
            return (
              <View key={i} style={isAI ? ai.rowAI : ai.rowUser}>
                {isAI && (
                  <View
                    style={[ai.aiDot, { backgroundColor: avatarColor + "33" }]}
                  >
                    <Text style={{ fontSize: 10 }}>🤖</Text>
                  </View>
                )}
                <View style={[ai.bubble, isAI ? ai.bubbleAI : ai.bubbleUser]}>
                  <Text style={[ai.bubbleTxt, !isAI && { color: C.bg }]}>
                    {m.content}
                  </Text>
                </View>
              </View>
            );
          })}
          {loading && (
            <View style={ai.rowAI}>
              <View style={[ai.aiDot, { backgroundColor: avatarColor + "33" }]}>
                <Text style={{ fontSize: 10 }}>🤖</Text>
              </View>
              <View style={[ai.bubble, ai.bubbleAI, ai.typing]}>
                <ActivityIndicator size="small" color={C.muted} />
                <Text style={ai.typingTxt}>Thinking…</Text>
              </View>
            </View>
          )}
          <View style={{ height: 12 }} />
        </ScrollView>

        {/* Quick suggestions */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={ai.sugRow}
        >
          {suggestions.map((s) => (
            <TouchableOpacity
              key={s}
              style={ai.sug}
              onPress={() => setInput(s)}
            >
              <Text style={ai.sugTxt}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Input */}
        <View style={ai.inputRow}>
          <TextInput
            style={ai.input}
            placeholder={`Ask ${coachName}...`}
            placeholderTextColor={C.muted}
            value={input}
            onChangeText={setInput}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
            multiline
          />
          <TouchableOpacity
            style={[
              ai.sendBtn,
              { backgroundColor: avatarColor },
              (!input.trim() || loading) && { opacity: 0.4 },
            ]}
            onPress={sendMessage}
            disabled={!input.trim() || loading}
          >
            <Ionicons name="send" size={15} color={C.bg} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ai = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  hdr: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  hdrLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  hdrAvatar: {
    width: 42,
    height: 42,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  hdrAvatarTxt: { color: "#fff", fontSize: 13, fontWeight: "900" },
  hdrOnline: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: C.green,
    borderWidth: 2,
    borderColor: C.bg,
  },
  hdrName: { fontSize: 15, fontWeight: "800", color: C.white },
  hdrStatus: { fontSize: 11, color: C.muted, marginTop: 1 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
  },
  msgList: { padding: 14, gap: 10, flexGrow: 1 },
  rowAI: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  rowUser: { flexDirection: "row", justifyContent: "flex-end" },
  aiDot: {
    width: 28,
    height: 28,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleAI: { backgroundColor: C.card, borderBottomLeftRadius: 4 },
  bubbleUser: { backgroundColor: C.lime, borderBottomRightRadius: 4 },
  bubbleTxt: { fontSize: 14, color: C.white, lineHeight: 21 },
  typing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  typingTxt: { color: C.muted, fontSize: 13 },
  sugRow: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  sug: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  sugTxt: { color: C.white, fontSize: 12, fontWeight: "600" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  input: {
    flex: 1,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: C.white,
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
});

// ── Coach Card ────────────────────────────────────────────
function CoachCard({ trainer, onChat }: { trainer: any; onChat: () => void }) {
  const initials = trainer.name
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase();
  const colors = ["#ff6b6b", "#ffa94d", "#69db7c", C.blue, C.lime];
  const color =
    colors[trainer.id.charCodeAt(trainer.id.length - 1) % colors.length];
  return (
    <View style={cc.card}>
      <View
        style={[
          cc.avatar,
          { backgroundColor: color + "30", borderColor: color + "55" },
        ]}
      >
        <Text style={[cc.initials, { color }]}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={cc.name}>{trainer.name}</Text>
        <Text style={cc.bio} numberOfLines={1}>
          {trainer.bio}
        </Text>
      </View>
      <TouchableOpacity
        style={cc.chatBtn}
        onPress={onChat}
        activeOpacity={0.85}
      >
        <Ionicons name="chatbubble-ellipses" size={15} color={C.bg} />
        <Text style={cc.chatTxt}>Chat</Text>
      </TouchableOpacity>
    </View>
  );
}
const cc = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  initials: { fontSize: 16, fontWeight: "800", letterSpacing: -0.5 },
  name: { color: C.white, fontSize: 14, fontWeight: "700", marginBottom: 2 },
  bio: { color: C.muted, fontSize: 12 },
  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.lime,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 5,
  },
  chatTxt: { color: C.bg, fontSize: 13, fontWeight: "800" },
});

function UpcomingBookingCard({
  booking,
  onPress,
}: {
  booking: Booking;
  onPress: () => void;
}) {
  const isOnline = !booking.date;
  const isToday = booking.date === new Date().toISOString().split("T")[0];
  const isTomorrow =
    booking.date ===
    new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const dateLabel = isOnline
    ? "Online"
    : isToday
      ? "Today"
      : isTomorrow
        ? "Tomorrow"
        : booking.date;

  return (
    <TouchableOpacity
      style={[tr.row, { borderColor: isToday ? C.lime + "44" : C.border }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 14,
          backgroundColor: C.card2,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 26 }}>{booking.courseEmoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={tr.name} numberOfLines={1}>
          {booking.courseTitle}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            marginTop: 2,
          }}
        >
          <Ionicons
            name={isOnline ? "videocam-outline" : "calendar-outline"}
            size={11}
            color={C.muted}
          />
          <Text style={[tr.source, { color: C.mutedLight }]}>{dateLabel}</Text>
          {!isOnline && (
            <>
              <Ionicons name="time-outline" size={11} color={C.muted} />
              <Text style={[tr.source, { color: C.mutedLight }]}>
                {booking.timeSlot}
              </Text>
            </>
          )}
        </View>
      </View>
      <View style={[tr.badge, isToday && { backgroundColor: C.lime + "22" }]}>
        <Text style={[tr.badgeTxt, isToday && { color: C.lime }]}>
          {isOnline ? "ANYTIME" : isToday ? "TODAY" : "SOON"}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={C.mutedLight}
        style={{ marginLeft: 4 }}
      />
    </TouchableOpacity>
  );
}
// ── Follower Chip ─────────────────────────────────────────
function FollowerChip({
  user,
  onPress,
}: {
  user: FollowerUser;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={fc.wrap} onPress={onPress} activeOpacity={0.8}>
      <View style={fc.ring}>
        {user.photoURL ? (
          <Image source={{ uri: user.photoURL }} style={fc.av} />
        ) : (
          <View style={fc.avFallback}>
            <Text style={fc.initial}>
              {(user.displayName || user.email || "?")[0].toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <Text style={fc.name} numberOfLines={1}>
        {user.displayName || user.email?.split("@")[0] || "User"}
      </Text>
    </TouchableOpacity>
  );
}
const fc = StyleSheet.create({
  wrap: { alignItems: "center", width: 62, gap: 5 },
  ring: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2.5,
    borderColor: C.lime,
    justifyContent: "center",
    alignItems: "center",
  },
  av: { width: 50, height: 50, borderRadius: 25 },
  avFallback: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: C.card2,
    justifyContent: "center",
    alignItems: "center",
  },
  initial: { color: C.lime, fontSize: 18, fontWeight: "900" },
  name: {
    fontSize: 10,
    fontWeight: "600",
    color: C.white,
    textAlign: "center",
  },
});

// ─────────────────────────────────────────────────────────
// Main Home Screen
// ─────────────────────────────────────────────────────────
export default function Home({ navigation }: Props) {
  const auth = getAuth();
  const db = getFirestore();
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [userData, setUserData] = useState<any>(null);
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [followingUsers, setFollowingUsers] = useState<FollowerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);

  // ── Three separate chat modal states ──────────────────
  const [showFitAIChat, setShowFitAIChat] = useState(false); // FAB button
  const [showJohnChat, setShowJohnChat] = useState(false); // Coach John
  const [showLisaChat, setShowLisaChat] = useState(false); // Coach Lisa

  const hasMounted = useRef(false);

  const completedTasks = tasks.filter((t) => t.completed).length;
  const totalTasks = tasks.length;
  const progressPct = totalTasks > 0 ? completedTasks / totalTasks : 0;

  const trainers = [
    {
      id: "tr1",
      name: "Coach John",
      bio: "Expert in cardio & strength training",
    },
    { id: "tr2", name: "Coach Lisa", bio: "Yoga and flexibility specialist" },
  ];

  useEffect(() => {
    (async () => {
      await fetchUserData(true);
      setCheckingProfile(false);
      hasMounted.current = true;
    })();
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener("focus", () => {
      if (hasMounted.current) fetchUserData(false, true);
    });
    return unsub;
  }, [navigation]);

  useEffect(() => {
    if (!auth.currentUser) return;
    const loadBookings = async () => {
      console.log("Loading bookings for:", auth.currentUser?.uid);
      try {
        // BUG FIX: this used to query status == "upcoming", a value that
        // no longer exists in the data model — Booking.status is only
        // ever "confirmed" or "cancelled" now (see chatCourseTypes.ts).
        // That mismatch meant this query always returned zero results,
        // which is why "Upcoming Sessions" never showed anything here.
        const q = query(
          collection(db, "bookings"),
          where("userId", "==", auth.currentUser!.uid),
          where("status", "==", "confirmed"),
        );
        const snap = await getDocs(q);
        const bookings = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Booking)
          // isUpcoming() treats online bookings (no date) as always
          // current, and filters out physical sessions whose date has
          // passed — this keeps Home's widget consistent with the same
          // logic used in Booking History.
          .filter((b) => isUpcoming(b))
          .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
          .slice(0, 3);
        setUpcomingBookings(bookings);
        const notifEnabled = await AsyncStorage.getItem("notif_enabled");
        if (notifEnabled !== "false") {
          const { status } = await Notifications.requestPermissionsAsync();
          if (status === "granted") {
            await Notifications.cancelAllScheduledNotificationsAsync();
            for (const booking of bookings) {
              // Online bookings have no date/timeSlot to schedule a
              // reminder against — skip them here.
              if (!booking.date || !booking.timeSlot) continue;
              const isToday =
                booking.date === new Date().toISOString().split("T")[0];
              if (isToday) {
                const [time, meridiem] = booking.timeSlot.split(" ");
                const [hourStr, minStr] = time.split(":");
                let hour = parseInt(hourStr);
                const min = parseInt(minStr);
                if (meridiem === "PM" && hour !== 12) hour += 12;
                if (meridiem === "AM" && hour === 12) hour = 0;
                const triggerDate = new Date();
                triggerDate.setHours(hour - 1, min, 0, 0);
                if (triggerDate > new Date()) {
                  await Notifications.scheduleNotificationAsync({
                    content: {
                      title: `⏰ Upcoming Session Reminder`,
                      body: `${booking.courseEmoji} ${booking.courseTitle} Your Class will start at ${booking.timeSlot}`,
                      sound: true,
                    },
                    trigger: {
                      type: Notifications.SchedulableTriggerInputTypes.DATE,
                      date: triggerDate,
                    },
                  });
                }
              }
            }
          }
        }
        console.log("Bookings found:", bookings.length);
      } catch (e) {
        console.error("Booking error:", e);
      }
    };
    loadBookings();
  }, [userData]);

  async function fetchUserData(checkProfile = false, silent = false) {
    try {
      if (!auth.currentUser) {
        if (!silent) setLoading(false);
        return;
      }
      const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
      if (!snap.exists()) {
        if (!silent) setLoading(false);
        return;
      }

      const data = snap.data();
      setUserData(data);

      if (checkProfile && data.profileCompleted === false && checkingProfile) {
        navigation.replace("ProfileCompletion");
        return;
      }

      const existingTasks: DailyTask[] = data.dailyTasks || [];
      const enrolledCourseIds: string[] = data.enrolledCourses || [];

      const courseTaskMap: Record<string, string[]> = {
        c1: [
          "HIIT warm-up & mobility",
          "Sprint intervals (Tabata)",
          "Core burnout circuit",
        ],
        c2: ["Morning yoga flow", "Pranayama breathing", "Evening meditation"],
        c3: [
          "Compound lifts session",
          "Accessory work",
          "Mobility & stretching",
        ],
        c4: [
          "Power zone cycling ride",
          "Cadence drill sets",
          "Endurance cool-down",
        ],
      };

      const courseTasks: DailyTask[] = [];
      for (const cid of enrolledCourseIds) {
        for (const name of courseTaskMap[cid] ?? []) {
          const id = `${cid}_${name.replace(/\s/g, "_")}`;
          if (!existingTasks.find((t) => t.id === id)) {
            courseTasks.push({
              id,
              name,
              completed: false,
              source: "course",
              courseId: cid,
            });
          }
        }
      }

      setTasks([
        ...existingTasks.filter(
          (t) =>
            t.source !== "course" ||
            enrolledCourseIds.includes(t.courseId ?? ""),
        ),
        ...courseTasks,
      ]);

      const followingIds: string[] = data.following || [];
      if (followingIds.length > 0) {
        const snaps = await Promise.all(
          followingIds.slice(0, 8).map((id) => getDoc(doc(db, "users", id))),
        );
        setFollowingUsers(
          snaps
            .filter((s) => s.exists())
            .map((s) => ({ id: s.id, ...s.data() }) as FollowerUser),
        );
      }

      if (!silent) setLoading(false);
    } catch (e: any) {
      if (!silent) setLoading(false);
      Alert.alert("Error", e.message);
    }
  }

  const toggleTask = useCallback(
    (id: string) =>
      setTasks((p) =>
        p.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
      ),
    [],
  );
  const deleteTask = useCallback(
    (id: string) => setTasks((p) => p.filter((t) => t.id !== id)),
    [],
  );
  const addCustomTask = useCallback(
    (name: string) =>
      setTasks((p) => [
        ...p,
        {
          id: `manual_${Date.now()}`,
          name,
          completed: false,
          source: "manual",
        },
      ]),
    [],
  );
  const addAITask = useCallback(
    (name: string) =>
      setTasks((p) => [
        ...p,
        { id: `ai_${Date.now()}`, name, completed: false, source: "ai" },
      ]),
    [],
  );

  const openDM = useCallback(
    async (targetUser: {
      id: string;
      displayName?: string;
      email?: string;
    }) => {
      if (!auth.currentUser) return;
      const me = auth.currentUser.uid;
      const id = convId(me, targetUser.id);
      const ref = doc(db, "conversations", id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          participants: [me, targetUser.id],
          lastMessage: "",
          lastAt: serverTimestamp(),
          unread: {},
        });
      }
      (navigation as any).navigate("ChatAndCourses");
    },
    [],
  );

  // Open the correct coach modal based on trainer id
  const handleCoachChat = (trainerId: string) => {
    if (trainerId === "tr1") setShowJohnChat(true);
    else if (trainerId === "tr2") setShowLisaChat(true);
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

  const firstName = userData?.displayName?.split(" ")[0] || "Athlete";
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.greeting}>{greeting},</Text>
            <Text style={s.name}>{firstName} 💪</Text>
          </View>
          <TouchableOpacity
            style={s.tokenBadge}
            onPress={() =>
              navigation.getParent()?.navigate("ProfileCompletion")
            }
          >
            <Text style={s.tokenEmoji}>🪙</Text>
            <Text style={s.tokenCount}>{userData?.tokens || 0}</Text>
          </TouchableOpacity>
        </View>

        {/* Hero Progress */}
        <View style={s.heroCard}>
          <View style={s.heroAccentBar} />
          <View style={s.heroTop}>
            <View>
              <Text style={s.heroLabel}>TODAY'S PROGRESS</Text>
              <Text style={s.heroNumber}>
                {Math.round(progressPct * 100)}
                <Text style={s.heroPct}>%</Text>
              </Text>
              <Text style={s.heroSub}>
                {completedTasks} / {totalTasks} tasks done
              </Text>
            </View>
            <View style={s.ringOuter}>
              <View
                style={[
                  s.ringFill,
                  {
                    height: `${Math.max(5, progressPct * 100)}%` as any,
                    backgroundColor: C.lime,
                  },
                ]}
              />
              <Text style={s.ringPct}>{Math.round(progressPct * 100)}%</Text>
            </View>
          </View>
          <View style={s.progressBg}>
            <View
              style={[
                s.progressFill,
                { width: `${progressPct * 100}%` as any },
              ]}
            />
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <StatPill
            icon="body-outline"
            label="HEIGHT"
            value={userData?.height || "—"}
            unit={userData?.height ? "cm" : ""}
          />
          <View style={{ width: 10 }} />
          <StatPill
            icon="barbell-outline"
            label="WEIGHT"
            value={userData?.weight || "—"}
            unit={userData?.weight ? "kg" : ""}
            color={C.blue}
          />
          <View style={{ width: 10 }} />
          <StatPill
            icon="pulse-outline"
            label="BMI"
            value={userData?.bmi || "—"}
            color="#ff9f43"
          />
        </View>

        {/* Edit Profile */}
        <TouchableOpacity
          style={s.editProfileBtn}
          onPress={() => navigation.getParent()?.navigate("ProfileCompletion")}
          activeOpacity={0.85}
        >
          <View style={s.editProfileLeft}>
            <View style={s.editProfileIcon}>
              <Ionicons name="person-circle-outline" size={22} color={C.lime} />
            </View>
            <View>
              <Text style={s.editProfileTitle}>Edit Profile Info</Text>
              <Text style={s.editProfileSub}>
                Update height, weight & goals
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </TouchableOpacity>

        {/* Daily Rewards */}
        <DailyRewardsCard
          onOpenCalendar={() => (navigation as any).navigate("RewardCalendar")}
        />

        {upcomingBookings.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Upcoming Sessions</Text>
              <View
                style={[s.sectionBadge, { backgroundColor: C.blue + "22" }]}
              >
                <Text style={[s.sectionBadgeText, { color: C.blue }]}>
                  {upcomingBookings.length} booked
                </Text>
              </View>
            </View>
            {upcomingBookings.map((b) => (
              <UpcomingBookingCard
                key={b.id}
                booking={b}
                onPress={() =>
                  (navigation as any).navigate("CourseHub", {
                    courseId: b.courseId,
                  })
                }
              />
            ))}
          </View>
        )}

        {/* Today's Tasks */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Today's Tasks</Text>
            <View style={s.sectionBadge}>
              <Text style={s.sectionBadgeText}>
                {completedTasks}/{totalTasks}
              </Text>
            </View>
            <TouchableOpacity
              style={s.addTaskBtn}
              onPress={() => setShowAddTask(true)}
            >
              <Ionicons name="add" size={16} color={C.bg} />
              <Text style={s.addTaskBtnTxt}>Add</Text>
            </TouchableOpacity>
          </View>

          {(userData?.enrolledCourses?.length ?? 0) > 0 && (
            <View style={s.courseTaskBanner}>
              <Ionicons name="school-outline" size={14} color={C.blue} />
              <Text style={s.courseTaskBannerTxt}>
                {userData.enrolledCourses.length} enrolled course
                {userData.enrolledCourses.length > 1 ? "s" : ""} · tasks
                auto-added below
              </Text>
            </View>
          )}

          {tasks.length > 0 ? (
            tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={() => toggleTask(task.id)}
                onDelete={() => deleteTask(task.id)}
              />
            ))
          ) : (
            <View style={s.emptyState}>
              <Ionicons name="clipboard-outline" size={36} color={C.muted} />
              <Text style={s.emptyText}>No tasks yet</Text>
              <TouchableOpacity
                style={s.emptyAddBtn}
                onPress={() => setShowAddTask(true)}
              >
                <Text style={s.emptyAddBtnTxt}>+ Add your first task</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Following */}
        {followingUsers.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Following</Text>
              <TouchableOpacity
                style={[s.sectionBadge, { backgroundColor: C.pink + "22" }]}
                onPress={() => (navigation as any).navigate("ChatAndCourses")}
              >
                <Text style={[s.sectionBadgeText, { color: C.pink }]}>
                  See all chats →
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 14, paddingBottom: 4 }}
            >
              {followingUsers.map((u) => (
                <FollowerChip key={u.id} user={u} onPress={() => openDM(u)} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* AI Coaches */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>AI Coaches</Text>
            <View style={[s.sectionBadge, { backgroundColor: C.blue + "22" }]}>
              <Text style={[s.sectionBadgeText, { color: C.blue }]}>
                {trainers.length} online
              </Text>
            </View>
          </View>
          {trainers.map((trainer) => (
            <CoachCard
              key={trainer.id}
              trainer={trainer}
              onChat={() => handleCoachChat(trainer.id)}
            />
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* AI FAB — General FitAI */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => setShowFitAIChat(true)}
        activeOpacity={0.85}
      >
        <Text style={s.fabLabel}>AI</Text>
        <View style={s.fabDot} />
      </TouchableOpacity>

      {/* Modals */}
      <AddTaskModal
        visible={showAddTask}
        onClose={() => setShowAddTask(false)}
        onAdd={addCustomTask}
      />

      {/* FitAI — General (FAB) */}
      <ChatModal
        visible={showFitAIChat}
        onClose={() => setShowFitAIChat(false)}
        onAddTask={addAITask}
        endpoint="/chat"
        coachName="FitAI Coach"
        coachStatus="Powered by Gemini · Always online"
        avatarColor={C.blue}
        welcomeMessage="Hey! I'm your FitAI coach 💪 Ask me anything about workouts, courses, nutrition, or recovery. I can also add tasks to your daily list!"
        suggestions={[
          "Best course for weight loss?",
          "Add: 30 min HIIT",
          "Recovery tips",
          "Beginner workout plan",
        ]}
      />

      {/* Coach John — Cardio & Strength */}
      <ChatModal
        visible={showJohnChat}
        onClose={() => setShowJohnChat(false)}
        onAddTask={addAITask}
        endpoint="/chat/john"
        coachName="Coach John"
        coachStatus="Cardio & Strength Expert · Online"
        avatarColor="#ff6b6b"
        welcomeMessage="Hey! I'm Coach John 💪 I specialize in cardio and strength training. Ask me about workouts, training plans, or exercise form!"
        suggestions={[
          "Best HIIT routine?",
          "Add: 5km run",
          "Beginner strength plan",
          "How to improve endurance?",
        ]}
      />

      {/* Coach Lisa — Yoga & Flexibility */}
      <ChatModal
        visible={showLisaChat}
        onClose={() => setShowLisaChat(false)}
        onAddTask={addAITask}
        endpoint="/chat/lisa"
        coachName="Coach Lisa"
        coachStatus="Yoga & Flexibility Specialist · Online"
        avatarColor="#69db7c"
        welcomeMessage="Namaste! I'm Coach Lisa 🧘 I specialize in yoga and flexibility. Ask me about poses, breathing, mindfulness, or stretching routines!"
        suggestions={[
          "Best yoga for beginners?",
          "Add: morning yoga flow",
          "Hip flexibility tips",
          "Breathing techniques",
        ]}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  greeting: {
    color: C.muted,
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  name: {
    color: C.white,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginTop: 2,
  },
  tokenBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  tokenEmoji: { fontSize: 16 },
  tokenCount: { color: C.lime, fontSize: 16, fontWeight: "800" },
  heroCard: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  heroAccentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: C.lime,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 18,
    marginTop: 4,
  },
  heroLabel: {
    color: C.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  heroNumber: {
    color: C.white,
    fontSize: 52,
    fontWeight: "900",
    letterSpacing: -2,
    lineHeight: 56,
  },
  heroPct: { color: C.lime, fontSize: 28, fontWeight: "900" },
  heroSub: { color: C.muted, fontSize: 13, marginTop: 4 },
  ringOuter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.card2,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: C.border,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  ringFill: { position: "absolute", bottom: 0, left: 0, right: 0 },
  ringPct: {
    color: C.white,
    fontSize: 13,
    fontWeight: "800",
    zIndex: 1,
    marginBottom: 8,
  },
  progressBg: {
    height: 6,
    backgroundColor: C.card2,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: C.lime, borderRadius: 3 },
  statsRow: { flexDirection: "row", marginBottom: 14 },
  editProfileBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  editProfileLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  editProfileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.lime + "18",
    justifyContent: "center",
    alignItems: "center",
  },
  editProfileTitle: {
    color: C.white,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 2,
  },
  editProfileSub: { color: C.muted, fontSize: 12 },
  checkinCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.lime + "15",
    borderRadius: 18,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: C.lime + "40",
    gap: 12,
  },
  checkinLeft: { flex: 1 },
  checkinTitle: {
    color: C.lime,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 3,
  },
  checkinSub: { color: C.mutedLight, fontSize: 12 },
  checkinBtns: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkinYes: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.lime,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    gap: 5,
  },
  checkinYesText: { color: C.bg, fontSize: 13, fontWeight: "800" },
  checkinNo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
  },
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 10,
  },
  sectionTitle: {
    color: C.white,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
    flex: 1,
  },
  sectionBadge: {
    backgroundColor: C.lime + "22",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  sectionBadgeText: { color: C.lime, fontSize: 11, fontWeight: "700" },
  addTaskBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.lime,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 3,
  },
  addTaskBtnTxt: { color: C.bg, fontSize: 12, fontWeight: "900" },
  courseTaskBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.blue + "15",
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.blue + "33",
  },
  courseTaskBannerTxt: {
    color: C.blue,
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  emptyState: { alignItems: "center", paddingVertical: 28, gap: 10 },
  emptyText: { color: C.muted, fontSize: 14, textAlign: "center" },
  emptyAddBtn: {
    backgroundColor: C.lime + "22",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.lime + "44",
  },
  emptyAddBtnTxt: { color: C.lime, fontSize: 13, fontWeight: "700" },
  fab: {
    position: "absolute",
    bottom: 30,
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: C.blue,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  fabLabel: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  fabDot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.lime,
    borderWidth: 1.5,
    borderColor: C.blue,
  },
});
