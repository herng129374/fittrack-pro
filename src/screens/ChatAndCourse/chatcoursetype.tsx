// chatCourseTypes.ts
// Shared types, constants, and helper utilities for the chat & courses feature.

import { Timestamp } from "firebase/firestore";
import {
  getStorage,
  ref as sRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

// ── Palette ───────────────────────────────────────────────
export const C = {
  bg: "#0d0d0f",
  card: "#1c1d23",
  card2: "#212330",
  lime: "#c8f135",
  white: "#f2f2f4",
  muted: "#6b6d7a",
  border: "#26272f",
  danger: "#ff4f4f",
  blue: "#4e8ef7",
  pink: "#ff4d6d",
  green: "#22c55e",
  orange: "#f97316",
} as const;

// ── GIF packs ─────────────────────────────────────────────
export const GIF_PACKS: { label: string; gifs: string[] }[] = [
  {
    label: "Fitness",
    gifs: [
      "https://media.tenor.com/ySQpR5enrwAAAAAC/workout-gym.gif",
      "https://media.tenor.com/0c7N7GUVd5YAAAAC/push-up-workout.gif",
      "https://media.tenor.com/jIETAvjCXcEAAAAC/running-fast.gif",
      "https://media.tenor.com/H_3YIHxPWkYAAAAC/lifting-weights.gif",
    ],
  },
  {
    label: "Reactions",
    gifs: [
      "https://media.tenor.com/5F2BovKSBicAAAAC/thumbs-up.gif",
      "https://media.tenor.com/7GdBzlpUEhQAAAAC/fire-hot.gif",
      "https://media.tenor.com/JIRexQRFIEYAAAAC/party-celebrate.gif",
      "https://media.tenor.com/7UugFNGcEF8AAAAC/clapping-bravo.gif",
    ],
  },
  {
    label: "Funny",
    gifs: [
      "https://media.tenor.com/eBxGbxz3MDEAAAAC/funny-haha.gif",
      "https://media.tenor.com/Q__FxbYjBigAAAAC/no-way.gif",
      "https://media.tenor.com/rjPfq0VFD2MAAAAC/okay-cool.gif",
      "https://media.tenor.com/v-3bpKq5M_sAAAAC/spongebob-meme.gif",
    ],
  },
];

// ── Types ─────────────────────────────────────────────────
export interface FirestoreUser {
  id: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
  following?: string[];
  followers?: string[];
}

export type MessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "gif"
  | "voice";

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  type: MessageType;
  text?: string;
  mediaUrl?: string;
  fileName?: string;
  fileSize?: string;
  duration?: number;
  createdAt: Timestamp | null;
}

export interface Conversation {
  id: string;
  participants: string[];
  lastMessage: string;
  lastAt: Timestamp | null;
  otherUser: FirestoreUser;
  unread: number;
}

// ── Slot capacity ────────────────────────────────────────
// `holds` is a short-lived reservation map used ONLY for the brief window
// between "user tapped a time slot" and "user confirmed/backed out/timed
// out" on the confirmation screen (see BookingModal.tsx). This is NOT the
// old payment-hold system (that was removed — payment already happened
// at Plan-purchase time). This hold exists purely so that while User A is
// looking at the confirmation screen for the last remaining spot, User B
// browsing the same slot list sees it as unavailable rather than being
// able to tap into a confirmation screen that will immediately fail.
export const HOLD_DURATION_MS = 60 * 1000; // 1 minute

export interface SlotDoc {
  taken: number;
  holds?: Record<string, number>; // holdId (= bookingId) -> expiry epoch ms
}

export function slotKey(date: string, timeSlot: string): string {
  return `${date}__${timeSlot}`;
}

// Count of holds that haven't expired yet. Expired holds are treated as
// if they don't exist — they get cleaned up (overwritten) the next time
// anyone reads+writes this slot doc, so there's no need for a separate
// cleanup job for a 1-minute TTL.
export function activeHoldCount(
  holds: Record<string, number> | undefined,
  now: number,
): number {
  if (!holds) return 0;
  return Object.values(holds).filter((expiry) => expiry > now).length;
}

// ── Booking ─────────────────────────────────────────────
// location/coachName are snapshotted at booking time (not just courseId)
// so the History screen can display full session details without an
// extra lookup against the Course doc, and so history stays accurate
// even if the course's location/coach changes later.
export type BookingStatus = "confirmed" | "cancelled";

export interface Booking {
  id: string;
  userId: string;
  courseId: string;
  courseTitle: string;
  courseEmoji: string;
  category: string;
  membershipId: string;
  date?: string | null;
  timeSlot?: string | null;
  location?: string | null;
  coachName?: string;
  status: BookingStatus;
  createdAt: Timestamp | null;
}

export function bookingId(
  userId: string,
  courseId: string,
  date?: string | null,
  timeSlot?: string | null,
): string {
  if (date && timeSlot) {
    return `${userId}_${courseId}_${date}_${timeSlot}`;
  }
  return `${userId}_${courseId}_online`;
}

// Physical bookings are "upcoming" if their date is today or later;
// anything before today is treated as "past" for History screen grouping.
// (Simple date-string comparison works because dates are stored as
// ISO "YYYY-MM-DD" strings, which sort correctly as plain strings.)
export function isUpcoming(booking: Booking): boolean {
  if (!booking.date) return true; // online bookings have no date — always "current"
  const today = new Date().toISOString().split("T")[0];
  return booking.date >= today;
}

export interface CourseBooking {
  id: string;
  courseId: string;
  courseTitle: string;
  courseEmoji: string;
  userId: string;
  date: string;
  timeSlot: string;
  status: "upcoming" | "completed" | "cancelled";
  createdAt: Timestamp | null;
}

// ── UserMembership ──────────────────────────────────────
export type MembershipStatus = "active" | "expired" | "used_up";

export interface UserMembership {
  id: string;
  userId: string;
  planId: string;
  planName: string;
  category: string;
  totalCredits: number;
  remainingCredits: number;
  validFrom: Timestamp | null;
  validUntil: Timestamp | null;
  status: MembershipStatus;
  orderId?: string;
}

export function isMembershipUsable(m: UserMembership): boolean {
  if (m.status !== "active") return false;
  if (m.remainingCredits <= 0) return false;
  if (m.validUntil && m.validUntil.toMillis() < Date.now()) return false;
  return true;
}

export function daysRemaining(m: UserMembership): number {
  if (!m.validUntil) return 0;
  const ms = m.validUntil.toMillis() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function findUsableMembership(
  memberships: UserMembership[],
  category: string,
): UserMembership | null {
  const candidates = memberships.filter(
    (m) => m.category === category && isMembershipUsable(m),
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const av = a.validUntil?.toMillis() ?? Infinity;
    const bv = b.validUntil?.toMillis() ?? Infinity;
    return av - bv;
  });
  return candidates[0];
}

// ── Course Categories ─────────────────────────────────────
export interface CourseCategory {
  emoji: string;
  label: string;
}

export const CATEGORIES: CourseCategory[] = [
  { emoji: "💪", label: "Strength" },
  { emoji: "🔥", label: "HIIT" },
  { emoji: "🏃", label: "Cardio" },
  { emoji: "🧘", label: "Yoga" },
  { emoji: "🤸", label: "Pilates" },
  { emoji: "🚴", label: "Cycling" },
  { emoji: "🥊", label: "Boxing" },
  { emoji: "🥋", label: "Martial Arts" },
  { emoji: "💃", label: "Dance" },
  { emoji: "🎯", label: "Functional Training" },
  { emoji: "🧠", label: "Core" },
  { emoji: "🧍", label: "Stretch & Recovery" },
  { emoji: "🏊", label: "Swimming" },
  { emoji: "👥", label: "Group Class" },
  { emoji: "👤", label: "Personal Training" },
  { emoji: "👶", label: "Youth" },
  { emoji: "🧓", label: "Senior" },
];

export function categoryEmoji(label?: string): string {
  return CATEGORIES.find((c) => c.label === label)?.emoji ?? "🏋️";
}

export interface Course {
  id: string;
  emoji: string;
  category?: string;
  title: string;
  type: "physical" | "online";
  popular?: boolean;
  coachName: string;
  coachId?: string;
  slots: string;
  totalSeats: number;
  duration: string;
  schedule: string;
  scheduleDays: string[];
  timeSlots: string[];
  level: string;
  desc: string;
  items: string[];
  status?: "active" | "archived";

  coverImage?: string;
  bookingDeadlineMinutes?: number;
  isRecurring?: boolean;
  location?: string;
  meetingLink?: string;
}

// ── Firestore normalizer ───────────────────────────────────
export function normalizeCourse(id: string, data: any): Course {
  const totalSeats: number = data.totalSeats ?? 15;
  return {
    id,
    emoji: data.emoji ?? "🏋️",
    category: data.category ?? undefined,
    title: data.title ?? "",
    type: data.type ?? "physical",
    popular: data.popular ?? false,
    coachName: data.coachName ?? "",
    coachId: data.coachId,
    slots: totalSeats >= 999 ? "Unlimited" : `${totalSeats} seats`,
    totalSeats,
    duration: data.duration ?? "60 min",
    schedule: data.schedule ?? "",
    scheduleDays: Array.isArray(data.scheduleDays) ? data.scheduleDays : [],
    timeSlots: Array.isArray(data.timeSlots) ? data.timeSlots : [],
    level: data.level ?? "All levels",
    desc: data.desc ?? "",
    items: Array.isArray(data.items) ? data.items : [],
    status: data.status ?? "active",
    coverImage: data.coverImage ?? undefined,
    bookingDeadlineMinutes: data.bookingDeadlineMinutes ?? 30,
    isRecurring: data.isRecurring ?? true,
    location: data.location ?? undefined,
    meetingLink: data.meetingLink ?? undefined,
  };
}

// Used by the Plans purchase flow (PlanPurchaseModal) to turn a plan's
// display price string into a numeric PayPal amount. No longer used for
// Course — courses are booked with membership credits, not priced
// individually.
export function parsePriceToAmount(price: string): number {
  const match = price.match(/[\d,]+(\.\d+)?/);
  if (!match) return 0;
  return parseFloat(match[0].replace(/,/g, "")) || 0;
}

// ── Helpers ───────────────────────────────────────────────
export function convId(a: string, b: string): string {
  return [a, b].sort().join("_");
}

export function timeLabel(ts: Timestamp | null): string {
  if (!ts) return "";
  const d = ts.toDate();
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString();
}

export function fmtDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function bytesToSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export async function uploadToStorage(
  uri: string,
  path: string,
): Promise<string> {
  const storage = getStorage();
  const res = await fetch(uri);
  const blob = await res.blob();
  const ref = sRef(storage, path);
  await uploadBytes(ref, blob);
  return getDownloadURL(ref);
}

export function generateCalendarDays(
  scheduleDays: string[],
): { date: string; label: string; day: string; available: boolean }[] {
  const days = [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date();
  for (let i = 1; i <= 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dayName = dayNames[d.getDay()];
    const dateStr = d.toISOString().split("T")[0];
    const label = `${d.getDate()} ${d.toLocaleString("default", { month: "short" })}`;
    days.push({
      date: dateStr,
      label,
      day: dayName,
      available: scheduleDays.includes(dayName),
    });
  }
  return days;
}

export async function registerForPushNotificationsAsync(): Promise<
  string | undefined
> {
  let token: string | undefined;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#c8f135",
    });
  }
  if (Device.isDevice) {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      alert("Failed to get push token!");
      return;
    }
    try {
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch (e) {
      token = `${e}`;
    }
  } else {
    alert("Must use physical device!");
  }
  return token;
}

export async function sendEnrollNotification(
  pushToken: string,
  course: Course,
) {
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: pushToken,
      sound: "default",
      title: `🎉 Booked: ${course.emoji} ${course.title}`,
      body: `Coach: ${course.coachName} · ${course.schedule}`,
      data: { courseId: course.id },
    }),
  });
}

// ── Course Hub ──────────────────────────────────────────────
// The content area a course's coach publishes to and its members read —
// live at courses/{courseId}/announcements, /videos, /resources. "Member"
// isn't a separate collection: someone counts as a member the moment they
// have ANY booking (past, upcoming, or online) for this course — see
// isCourseMember below — which is also how BookingHistoryScreen already
// tracks a user's relationship to a course, so there's nothing new to
// keep in sync.
//
// Videos/resources store a URL rather than accepting a raw file upload
// from the coach's phone — video especially is expensive to serve out of
// Firebase Storage at any scale, so the intended flow is the coach
// uploads to YouTube (unlisted)/Vimeo/Drive elsewhere and pastes the
// link here. Nothing stops using a Firebase Storage URL as that link too.

export interface CourseAnnouncement {
  id: string;
  title: string;
  body: string;
  authorName: string;
  createdAt: Timestamp | null;
}

export function normalizeAnnouncement(
  id: string,
  data: any,
): CourseAnnouncement {
  return {
    id,
    title: data.title ?? "",
    body: data.body ?? "",
    authorName: data.authorName ?? "Coach",
    createdAt: data.createdAt ?? null,
  };
}

export interface CourseVideo {
  id: string;
  title: string;
  videoUrl: string;
  downloadable: boolean;
  createdAt: Timestamp | null;
}

export function normalizeCourseVideo(id: string, data: any): CourseVideo {
  return {
    id,
    title: data.title ?? "",
    videoUrl: data.videoUrl ?? "",
    downloadable: data.downloadable ?? false,
    createdAt: data.createdAt ?? null,
  };
}

export type ResourceFileType = "pdf" | "doc" | "image" | "sheet" | "other";

export interface CourseResource {
  id: string;
  title: string;
  fileUrl: string;
  fileType: ResourceFileType;
  createdAt: Timestamp | null;
}

export function normalizeCourseResource(id: string, data: any): CourseResource {
  return {
    id,
    title: data.title ?? "",
    fileUrl: data.fileUrl ?? "",
    fileType: (data.fileType as ResourceFileType) ?? "other",
    createdAt: data.createdAt ?? null,
  };
}

// A user is a "member" of a course's Hub if they have any booking for it
// at all — booking history (any status/date) is proof of purchase intent,
// so there's no separate "enroll" step. The assigned coach always counts
// too, regardless of bookings.
export function isCourseMember(bookings: Booking[], courseId: string): boolean {
  return bookings.some((b) => b.courseId === courseId);
}
