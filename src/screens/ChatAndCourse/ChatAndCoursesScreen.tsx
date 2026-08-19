// ChatAndCoursesScreen.tsx
// Main screen + CourseModal.
//
// FIXED: previously tracked bookings as a Set<courseId>, so booking ANY
// session of a course (say, HIIT Monday 7pm) marked the ENTIRE course as
// "Booked" and blocked booking other sessions of it (e.g. HIIT Wednesday
// 7pm) — that's wrong. A user should be able to book multiple different
// sessions of the same physical course independently, each consuming its
// own credit. Now we keep the full Booking[] list and derive per-course,
// per-session state from it:
//   - Physical: no course-level lock. The course card shows how many
//     upcoming sessions the user has booked (0, 1, 2...). Duplicate
//     booking of the SAME date+timeSlot is blocked in BookingModal.
//   - Online: still a course-level lock (there's no date/timeSlot to
//     distinguish repeats), enforced both in the UI (skip the deduction
//     flow entirely if already booked) and atomically in the transaction
//     via a deterministic booking ID (see chatcoursetype.tsx).

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Image,
  Modal,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
  TextInput,
  Linking,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getAuth, onAuthStateChanged, User } from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

import { ChatWindow } from "./chatcomponent";
import { BookingModal } from "./BookingModal";
import {
  C,
  CATEGORIES,
  FirestoreUser,
  Course,
  Conversation,
  Booking,
  UserMembership,
  normalizeCourse,
  convId,
  timeLabel,
  bookingId,
  findUsableMembership,
  registerForPushNotificationsAsync,
  sendEnrollNotification,
} from "./chatcoursetype";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─────────────────────────────────────────────────────────
// Course Modal — shows cover image + all course details
// ─────────────────────────────────────────────────────────
function CourseModal({
  course,
  visible,
  onlineBooked,
  upcomingCount,
  ownedMembership,
  onClose,
  onBook,
  onOpenCoachChat,
  onOpenCourseHub,
}: {
  course: Course | null;
  visible: boolean;
  onlineBooked: boolean; // only meaningful for type === "online"
  upcomingCount: number; // only meaningful for type === "physical"
  ownedMembership: UserMembership | null;
  me: User | null;
  onClose: () => void;
  onBook: (c: Course) => void;
  onOpenCoachChat: () => void;
  onOpenCourseHub: () => void;
}) {
  if (!course) return null;
  const hasImage = !!course.coverImage;
  const isOnline = course.type === "online";
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      transparent
    >
      <View style={cm.overlay}>
        <View style={cm.sheet}>
          <View style={cm.handle} />
          <View style={cm.hdr}>
            <Text style={cm.hdrTitle} numberOfLines={1}>
              {course.title}
            </Text>
            <TouchableOpacity style={cm.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={18} color={C.white} />
            </TouchableOpacity>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 32 }}
          >
            <View style={cm.hero}>
              {hasImage ? (
                <Image
                  source={{ uri: course.coverImage }}
                  style={cm.heroImg}
                  resizeMode="cover"
                />
              ) : (
                <View style={cm.heroFallback}>
                  <Text style={{ fontSize: 64 }}>{course.emoji}</Text>
                </View>
              )}
              <View style={cm.heroBadgeRow}>
                <View
                  style={[
                    cm.badge,
                    course.type === "online"
                      ? cm.badgeOnline
                      : cm.badgePhysical,
                  ]}
                >
                  <Text
                    style={[
                      cm.badgeTxt,
                      { color: course.type === "online" ? "#fff" : C.bg },
                    ]}
                  >
                    {course.type.toUpperCase()}
                  </Text>
                </View>
                {course.popular && (
                  <View style={[cm.badge, cm.badgeHot]}>
                    <Text style={[cm.badgeTxt, { color: "#fff" }]}>
                      🔥 POPULAR
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={cm.body}>
              <Text style={cm.name}>{course.title}</Text>
              <Text style={cm.desc}>{course.desc}</Text>
              <View style={cm.chipRow}>
                {[
                  { l: "CATEGORY", v: course.category ?? "—" },
                  { l: "DURATION", v: course.duration },
                  { l: "SCHEDULE", v: course.schedule },
                  { l: "LEVEL", v: course.level },
                ].map((c) => (
                  <View key={c.l} style={cm.chip}>
                    <Text style={cm.chipLbl}>{c.l}</Text>
                    <Text style={cm.chipVal}>{c.v}</Text>
                  </View>
                ))}
              </View>

              {course.location && (
                <View style={cm.infoRow}>
                  <Ionicons name="location-outline" size={14} color={C.muted} />
                  <Text style={cm.infoTxt}>{course.location}</Text>
                </View>
              )}
              {isOnline && course.meetingLink && !onlineBooked && (
                <View style={cm.infoRow}>
                  <Ionicons name="videocam-outline" size={14} color={C.blue} />
                  <Text style={[cm.infoTxt, { color: C.blue }]}>
                    Meeting link unlocks after booking
                  </Text>
                </View>
              )}
              {isOnline && course.meetingLink && onlineBooked && (
                <TouchableOpacity
                  style={cm.joinBtn}
                  onPress={() =>
                    Linking.openURL(course.meetingLink!).catch(() =>
                      Alert.alert(
                        "Couldn't open link",
                        "The meeting link looks invalid.",
                      ),
                    )
                  }
                  activeOpacity={0.85}
                >
                  <Ionicons name="videocam" size={16} color={C.bg} />
                  <Text style={cm.joinBtnTxt}>Join Online Class</Text>
                </TouchableOpacity>
              )}
              {!isOnline && upcomingCount > 0 && (
                <View style={cm.infoRow}>
                  <Ionicons name="calendar-outline" size={14} color={C.green} />
                  <Text style={[cm.infoTxt, { color: C.green }]}>
                    You have {upcomingCount} upcoming session
                    {upcomingCount === 1 ? "" : "s"} booked
                  </Text>
                </View>
              )}

              <Text style={cm.secLbl}>WHAT'S INCLUDED</Text>
              {course.items.map((item, i) => (
                <View key={i} style={cm.itemRow}>
                  <View style={cm.dot} />
                  <Text style={cm.itemTxt}>{item}</Text>
                </View>
              ))}

              <Text style={[cm.secLbl, { marginTop: 16 }]}>COACH</Text>
              <View style={cm.coachRow}>
                <View style={cm.coachAv}>
                  <Text style={cm.coachInitial}>{course.coachName[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={cm.coachName}>{course.coachName}</Text>
                  <Text style={cm.coachRole}>Certified Fitness Coach</Text>
                </View>
                <TouchableOpacity
                  style={cm.coachChatBtn}
                  onPress={onOpenCoachChat}
                  activeOpacity={0.85}
                >
                  <Ionicons name="chatbubble-ellipses" size={14} color={C.bg} />
                  <Text style={cm.coachChatTxt}>Chat</Text>
                </TouchableOpacity>
              </View>
              {!course.coachId && (
                <View style={cm.coachNotice}>
                  <Ionicons
                    name="information-circle-outline"
                    size={13}
                    color={C.muted}
                  />
                  <Text style={cm.coachNoticeTxt}>
                    Coach account will be linked soon.
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={cm.hubBtn}
                onPress={onOpenCourseHub}
                activeOpacity={0.85}
              >
                <Ionicons name="megaphone-outline" size={16} color={C.lime} />
                <Text style={cm.hubBtnTxt}>
                  Announcements, videos & resources
                </Text>
                <Ionicons name="chevron-forward" size={16} color={C.muted} />
              </TouchableOpacity>

              <View style={cm.priceRow}>
                <View>
                  <Text style={cm.priceLbl}>MEMBERSHIP</Text>
                  <Text
                    style={[
                      cm.membershipStatus,
                      { color: ownedMembership ? C.green : C.pink },
                    ]}
                  >
                    {ownedMembership
                      ? `${ownedMembership.remainingCredits} credits left`
                      : `${course.category ?? ""} plan required`}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={cm.priceLbl}>AVAILABILITY</Text>
                  <Text
                    style={[
                      cm.slots,
                      {
                        color: course.slots === "Unlimited" ? C.green : C.pink,
                      },
                    ]}
                  >
                    {course.slots}
                  </Text>
                </View>
              </View>

              <View style={cm.actionRow}>
                {isOnline && onlineBooked ? (
                  <View style={[cm.enrolledPill, { flex: 1 }]}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={C.green}
                    />
                    <Text style={cm.enrolledPillTxt}>Booked</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[cm.enrollBtn, { flex: 1 }]}
                    onPress={() => onBook(course)}
                    activeOpacity={0.85}
                  >
                    <Text style={cm.enrollTxt}>
                      {ownedMembership
                        ? isOnline
                          ? "📅 Book"
                          : upcomingCount > 0
                            ? "📅 Book Another Session"
                            : "📅 Book"
                        : "🔒 Book (need plan)"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              {!(isOnline && onlineBooked) && (
                <Text style={cm.enrollFirstHint}>
                  {ownedMembership
                    ? isOnline
                      ? "1 credit will be used to unlock the meeting link"
                      : "Pick a session — 1 credit will be used"
                    : `You need an active ${course.category ?? ""} plan to book this course`}
                </Text>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────
export default function ChatAndCoursesScreen({
  onNavigateToPlans,
  onNavigateToHistory,
  onOpenCourseHub,
}: {
  onNavigateToPlans?: (category: string) => void;
  onNavigateToHistory?: () => void;
  onOpenCourseHub?: (courseId: string) => void;
} = {}) {
  const auth = getAuth();
  const db = getFirestore();
  const [me, setMe] = useState<User | null>(null);
  const [following, setFollowing] = useState<FirestoreUser[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [loadingFollowing, setLoadingFollowing] = useState(true);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [activeTab, setActiveTab] = useState<"chats" | "courses">("chats");
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [chatVisible, setChatVisible] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [courseVisible, setCourseVisible] = useState(false);
  const [coachChatVisible, setCoachChatVisible] = useState(false);
  const [coachConv, setCoachConv] = useState<Conversation | null>(null);
  const [pushToken, setPushToken] = useState<string>("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [memberships, setMemberships] = useState<UserMembership[]>([]);

  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [activeMembership, setActiveMembership] =
    useState<UserMembership | null>(null);
  const [onlineBooking, setOnlineBooking] = useState(false);

  const [courseSearch, setCourseSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const filteredCourses = useMemo(() => {
    const q = courseSearch.trim().toLowerCase();
    return courses.filter((c) => {
      const matchesCategory =
        selectedCategory === "All" || c.category === selectedCategory;
      const matchesSearch = !q || c.title.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [courses, courseSearch, selectedCategory]);

  useEffect(() => {
    const q = query(
      collection(db, "courses"),
      where("status", "==", "active"),
      orderBy("createdAt", "desc"),
    );
    return onSnapshot(
      q,
      (snap) => {
        setCourses(snap.docs.map((d) => normalizeCourse(d.id, d.data())));
        setCoursesLoading(false);
      },
      (err) => {
        console.error("Courses snapshot error:", err);
        setCoursesLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    registerForPushNotificationsAsync().then((t) => {
      if (t) setPushToken(t);
    });
  }, []);
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setMe(u));
  }, []);

  useEffect(() => {
    if (!me) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", me.uid));
        const ids: string[] = snap.exists() ? snap.data().following || [] : [];
        if (!ids.length) {
          setFollowing([]);
          setLoadingFollowing(false);
          return;
        }
        const snaps = await Promise.all(
          ids.map((id) => getDoc(doc(db, "users", id))),
        );
        setFollowing(
          snaps
            .filter((s) => s.exists())
            .map((s) => ({ id: s.id, ...s.data() }) as FirestoreUser),
        );
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingFollowing(false);
      }
    })();
  }, [me]);

  useEffect(() => {
    if (!me) return;
    const q = query(
      collection(db, "conversations"),
      where("participants", "array-contains", me.uid),
    );
    return onSnapshot(
      q,
      async (snap) => {
        try {
          const convs: Conversation[] = [];
          for (const d of snap.docs) {
            const data = d.data();
            const otherId = (data.participants as string[]).find(
              (id) => id !== me.uid,
            );
            if (!otherId) continue;
            const uSnap = await getDoc(doc(db, "users", otherId));
            convs.push({
              id: d.id,
              participants: data.participants,
              lastMessage: data.lastMessage || "",
              lastAt: data.lastAt || null,
              otherUser: uSnap.exists()
                ? { id: otherId, ...uSnap.data() }
                : { id: otherId, displayName: "User" },
              unread: data.unread?.[me.uid] || 0,
            });
          }
          convs.sort(
            (a, b) => (b.lastAt?.toMillis() ?? 0) - (a.lastAt?.toMillis() ?? 0),
          );
          setConversations(convs);
        } catch (e) {
          console.error(e);
        } finally {
          setLoadingConvs(false);
        }
      },
      (e) => {
        console.error(e);
        setLoadingConvs(false);
      },
    );
  }, [me]);

  // Full booking records (not just a courseId set) — needed to derive
  // per-session state (which exact date+timeSlot are booked) rather than
  // a single course-wide flag.
  useEffect(() => {
    if (!me) return;
    const q = query(
      collection(db, "bookings"),
      where("userId", "==", me.uid),
      where("status", "==", "confirmed"),
    );
    return onSnapshot(
      q,
      (snap) => {
        setMyBookings(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Booking),
        );
      },
      (err) => console.error("Bookings snapshot error:", err),
    );
  }, [me]);

  useEffect(() => {
    if (!me) return;
    const q = query(
      collection(db, "memberships"),
      where("userId", "==", me.uid),
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
  }, [me]);

  const membershipFor = useCallback(
    (category?: string) =>
      category ? findUsableMembership(memberships, category) : null,
    [memberships],
  );

  // Physical: how many distinct sessions of this course has the user
  // booked (used for the "N upcoming sessions" badge — never used to
  // block booking).
  const upcomingCountFor = useCallback(
    (courseId: string) =>
      myBookings.filter((b) => b.courseId === courseId && b.date).length,
    [myBookings],
  );

  // Online: course-level flag — there's no date/timeSlot to distinguish
  // repeat bookings, so once booked, it's booked.
  const isOnlineBookedFor = useCallback(
    (courseId: string) =>
      myBookings.some((b) => b.courseId === courseId && !b.date),
    [myBookings],
  );

  const bookingsForCourse = useCallback(
    (courseId: string) => myBookings.filter((b) => b.courseId === courseId),
    [myBookings],
  );

  const showNeedPlanPrompt = useCallback(
    (course: Course) => {
      const goToPlans = () => {
        if (onNavigateToPlans) {
          onNavigateToPlans(course.category!);
        } else {
          Alert.alert(
            "Plans",
            "Head to the Plans tab to purchase a membership.",
          );
        }
      };
      const message = `You need an active ${course.category} plan to book this course.`;

      if (Platform.OS === "web") {
        const confirmed = window.confirm(`${message}\n\nGo to Plans now?`);
        if (confirmed) goToPlans();
      } else {
        Alert.alert("Membership required", message, [
          { text: "Cancel", style: "cancel" },
          { text: "View Plans", onPress: goToPlans },
        ]);
      }
    },
    [onNavigateToPlans],
  );

  // Online booking has no slot to pick — it's an instant credit deduction,
  // guarded against duplicates via the deterministic booking doc ID.
  const handleOnlineBook = useCallback(
    async (course: Course, membership: UserMembership) => {
      if (!me) return;
      setOnlineBooking(true);
      try {
        await runTransaction(db, async (tx) => {
          const membershipRef = doc(db, "memberships", membership.id);
          const bookingRef = doc(db, "bookings", bookingId(me.uid, course.id));

          const [membershipSnap, bookingSnap] = await Promise.all([
            tx.get(membershipRef),
            tx.get(bookingRef),
          ]);

          if (
            bookingSnap.exists() &&
            bookingSnap.data().status === "confirmed"
          ) {
            throw new Error("ALREADY_BOOKED");
          }

          if (!membershipSnap.exists()) throw new Error("NO_MEMBERSHIP");
          const fresh = membershipSnap.data() as UserMembership;
          if (fresh.status !== "active" || fresh.remainingCredits <= 0) {
            throw new Error("NO_CREDITS");
          }
          const newRemaining = fresh.remainingCredits - 1;
          tx.update(membershipRef, {
            remainingCredits: newRemaining,
            status: newRemaining <= 0 ? "used_up" : "active",
          });

          tx.set(bookingRef, {
            userId: me.uid,
            courseId: course.id,
            courseTitle: course.title,
            courseEmoji: course.emoji,
            category: course.category ?? "",
            location: course.location ?? null,
            coachName: course.coachName,
            membershipId: membership.id,
            date: null,
            timeSlot: null,
            status: "confirmed",
            createdAt: serverTimestamp(),
          });
        });

        const notifEnabled = await AsyncStorage.getItem("notif_enabled");
        if (notifEnabled !== "false" && pushToken) {
          sendEnrollNotification(pushToken, course).catch(() => {});
        }

        Alert.alert(
          "🎉 Booked!",
          `You're in for ${course.title}. Open it from the course card to join anytime.`,
        );
      } catch (e: any) {
        if (e.message === "ALREADY_BOOKED") {
          Alert.alert("Already booked", "You've already booked this course.");
        } else if (
          e.message === "NO_CREDITS" ||
          e.message === "NO_MEMBERSHIP"
        ) {
          Alert.alert(
            "No credits left",
            "Your membership ran out of credits. Please purchase another plan.",
          );
        } else {
          Alert.alert(
            "Booking error",
            e.message ?? "Could not complete booking.",
          );
        }
      } finally {
        setOnlineBooking(false);
      }
    },
    [me, pushToken],
  );

  const handleStartBooking = useCallback(
    (course: Course) => {
      setCourseVisible(false);
      if (!me) {
        Alert.alert(
          "Please wait",
          "Still signing you in — try again in a moment.",
        );
        return;
      }
      if (!course.category) {
        Alert.alert(
          "Unavailable",
          "This course has no category set. Contact support.",
        );
        return;
      }

      // Online courses are a one-time unlock — if already booked, there's
      // nothing to do here; the course card / CourseModal already shows
      // "Join Online Class" instead of a Book button in that state, but
      // this guards against any stale-UI edge case too.
      if (course.type === "online" && isOnlineBookedFor(course.id)) {
        Alert.alert("Already booked", "Open this course to join the class.");
        return;
      }

      const membership = membershipFor(course.category);
      if (!membership) {
        showNeedPlanPrompt(course);
        return;
      }

      setSelectedCourse(course);
      setActiveMembership(membership);
      if (course.type === "physical") {
        setTimeout(() => setBookingModalVisible(true), 400);
      } else {
        handleOnlineBook(course, membership);
      }
    },
    [
      me,
      membershipFor,
      showNeedPlanPrompt,
      handleOnlineBook,
      isOnlineBookedFor,
    ],
  );

  const handleBooked = useCallback(() => {
    setBookingModalVisible(false);
    setActiveMembership(null);
    const course = selectedCourse;
    if (course) {
      AsyncStorage.getItem("notif_enabled").then((notifEnabled) => {
        if (notifEnabled !== "false" && pushToken) {
          sendEnrollNotification(pushToken, course).catch(() => {});
        }
      });
    }
  }, [selectedCourse, pushToken]);

  const openDM = useCallback(
    async (other: FirestoreUser) => {
      if (!me) return;
      const id = convId(me.uid, other.id);
      const ref = doc(db, "conversations", id);
      const snap = await getDoc(ref);
      if (!snap.exists())
        await setDoc(ref, {
          participants: [me.uid, other.id],
          lastMessage: "",
          lastAt: serverTimestamp(),
          unread: {},
        });
      setActiveConv({
        id,
        participants: [me.uid, other.id],
        lastMessage: snap.exists() ? snap.data().lastMessage : "",
        lastAt: snap.exists() ? snap.data().lastAt : null,
        otherUser: other,
        unread: 0,
      });
      setChatVisible(true);
    },
    [me],
  );

  const handleOpenCoachChat = useCallback(
    async (course: Course) => {
      if (!me) return;
      const chatId = `coach_${course.id}_${me.uid}`;
      const ref = doc(db, "conversations", chatId);
      const snap = await getDoc(ref);
      if (!snap.exists())
        await setDoc(ref, {
          participants: [me.uid, `coach_${course.id}`],
          lastMessage: "",
          lastAt: serverTimestamp(),
          unread: {},
          isCoachChat: true,
          courseId: course.id,
          courseName: course.title,
        });
      const coachUser: FirestoreUser = {
        id: course.coachId || `coach_${course.id}`,
        displayName: course.coachName,
      };
      setCoachConv({
        id: chatId,
        participants: [me.uid, coachUser.id],
        lastMessage: snap.exists() ? snap.data().lastMessage : "",
        lastAt: snap.exists() ? snap.data().lastAt : null,
        otherUser: coachUser,
        unread: 0,
      });
      setCoachChatVisible(true);
    },
    [me],
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <View style={s.badge}>
          <Text style={s.badgeTxt}>⚡ FITTRACK</Text>
        </View>
        <Text style={s.headerTitle}>
          {activeTab === "chats" ? "Messages" : "Courses"}
        </Text>
        {activeTab === "courses" ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              style={s.plansBtn}
              onPress={() => onNavigateToHistory?.()}
              activeOpacity={0.8}
            >
              <Ionicons name="time-outline" size={16} color={C.blue} />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.plansBtn}
              onPress={() => onNavigateToPlans?.("")}
              activeOpacity={0.8}
            >
              <Ionicons name="card-outline" size={16} color={C.lime} />
              <Text style={s.plansBtnTxt}>My Plans</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>
      <View style={s.tabRow}>
        {(["chats", "courses"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[s.tab, activeTab === tab && s.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[s.tabTxt, activeTab === tab && s.tabTxtActive]}>
              {tab === "chats" ? "💬  MESSAGES" : "🏋️  COURSES"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === "chats" && (
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={s.secLbl}>PEOPLE YOU FOLLOW</Text>
          {loadingFollowing ? (
            <ActivityIndicator color={C.lime} style={{ margin: 20 }} />
          ) : following.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="people-outline" size={28} color={C.muted} />
              <Text style={s.emptyTxt}>Not following anyone yet</Text>
              <Text style={s.emptySub}>
                Follow people on Discover to start chatting
              </Text>
            </View>
          ) : (
            <FlatList
              data={following}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(u) => u.id}
              contentContainerStyle={s.followersRow}
              renderItem={({ item: u }) => (
                <TouchableOpacity
                  style={s.followerItem}
                  onPress={() => openDM(u)}
                  activeOpacity={0.8}
                >
                  <View style={s.storyRing}>
                    {u.photoURL ? (
                      <Image source={{ uri: u.photoURL }} style={s.storyAv} />
                    ) : (
                      <View style={s.storyAvFallback}>
                        <Text style={s.storyInitial}>
                          {(u.displayName || u.email || "?")[0].toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.followerName} numberOfLines={1}>
                    {u.displayName || u.email?.split("@")[0] || "User"}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
          <Text style={s.secLbl}>RECENT CHATS</Text>
          {loadingConvs ? (
            <ActivityIndicator color={C.lime} style={{ margin: 20 }} />
          ) : conversations.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="chatbubble-outline" size={28} color={C.muted} />
              <Text style={s.emptyTxt}>No conversations yet</Text>
              <Text style={s.emptySub}>
                Tap a person above to start chatting
              </Text>
            </View>
          ) : (
            conversations.map((conv) => {
              const u = conv.otherUser;
              return (
                <TouchableOpacity
                  key={conv.id}
                  style={s.convItem}
                  onPress={() => {
                    setActiveConv(conv);
                    setChatVisible(true);
                  }}
                  activeOpacity={0.8}
                >
                  {u.photoURL ? (
                    <Image source={{ uri: u.photoURL }} style={s.convAv} />
                  ) : (
                    <View style={s.convAvFallback}>
                      <Text style={s.convAvTxt}>
                        {(u.displayName || "?")[0].toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={s.convInfo}>
                    <Text style={s.convName}>
                      {u.displayName || u.email?.split("@")[0] || "User"}
                    </Text>
                    <Text style={s.convPreview} numberOfLines={1}>
                      {conv.lastMessage || "Start a conversation"}
                    </Text>
                  </View>
                  <View style={s.convMeta}>
                    <Text style={s.convTime}>{timeLabel(conv.lastAt)}</Text>
                    {conv.unread > 0 && (
                      <View style={s.unreadBadge}>
                        <Text style={s.unreadTxt}>{conv.unread}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {activeTab === "courses" && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.courseList}
        >
          <View style={s.searchBar}>
            <Ionicons name="search" size={16} color={C.muted} />
            <TextInput
              style={s.searchInput}
              placeholder="Search courses..."
              placeholderTextColor={C.muted}
              value={courseSearch}
              onChangeText={setCourseSearch}
              returnKeyType="search"
            />
            {courseSearch.length > 0 && (
              <TouchableOpacity onPress={() => setCourseSearch("")}>
                <Ionicons name="close-circle" size={16} color={C.muted} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.categoryRow}
          >
            {[{ emoji: "🗂️", label: "All" }, ...CATEGORIES].map((cat) => {
              const isSel = selectedCategory === cat.label;
              const owned =
                cat.label !== "All" ? membershipFor(cat.label) : null;
              return (
                <TouchableOpacity
                  key={cat.label}
                  style={[s.categoryChip, isSel && s.categoryChipSel]}
                  onPress={() => setSelectedCategory(cat.label)}
                  activeOpacity={0.8}
                >
                  <Text style={s.categoryChipEmoji}>{cat.emoji}</Text>
                  <Text
                    style={[s.categoryChipTxt, isSel && s.categoryChipTxtSel]}
                  >
                    {cat.label}
                  </Text>
                  {owned && <View style={s.ownedDot} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={[s.secLbl, { paddingHorizontal: 0 }]}>
            {selectedCategory === "All" && !courseSearch
              ? "RECOMMENDED FOR YOU"
              : `${filteredCourses.length} RESULT${filteredCourses.length === 1 ? "" : "S"}`}
          </Text>
          {coursesLoading ? (
            <ActivityIndicator color={C.lime} style={{ margin: 30 }} />
          ) : filteredCourses.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="barbell-outline" size={28} color={C.muted} />
              <Text style={s.emptyTxt}>
                {courses.length === 0
                  ? "No courses available"
                  : "No courses match your search"}
              </Text>
              <Text style={s.emptySub}>
                {courses.length === 0
                  ? "Check back soon for new classes!"
                  : "Try a different keyword or category"}
              </Text>
            </View>
          ) : (
            filteredCourses.map((course) => {
              const isOnline = course.type === "online";
              const onlineBooked = isOnline && isOnlineBookedFor(course.id);
              const upcoming = !isOnline ? upcomingCountFor(course.id) : 0;
              const owned = membershipFor(course.category);
              return (
                <TouchableOpacity
                  key={course.id}
                  style={s.courseCard}
                  onPress={() => {
                    setSelectedCourse(course);
                    setCourseVisible(true);
                  }}
                  activeOpacity={0.85}
                >
                  <View style={s.courseThumb}>
                    {course.coverImage ? (
                      <Image
                        source={{ uri: course.coverImage }}
                        style={s.courseThumbImg}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={s.courseThumbFallback}>
                        <Text style={{ fontSize: 44 }}>{course.emoji}</Text>
                      </View>
                    )}
                    <View
                      style={[
                        s.courseTypeBadge,
                        course.type === "online"
                          ? s.badgeOnline
                          : s.badgePhysical,
                      ]}
                    >
                      <Text
                        style={[
                          s.courseTypeTxt,
                          { color: course.type === "online" ? "#fff" : C.bg },
                        ]}
                      >
                        {course.type.toUpperCase()}
                      </Text>
                    </View>
                    {course.popular && (
                      <View
                        style={[
                          s.courseTypeBadge,
                          s.badgeHot,
                          { top: undefined, bottom: 8, left: 8 },
                        ]}
                      >
                        <Text style={[s.courseTypeTxt, { color: "#fff" }]}>
                          🔥 HOT
                        </Text>
                      </View>
                    )}
                    {onlineBooked && (
                      <View style={s.enrolledBadge}>
                        <Text style={s.enrolledBadgeTxt}>✓ BOOKED</Text>
                      </View>
                    )}
                    {!isOnline && upcoming > 0 && (
                      <View style={s.upcomingBadge}>
                        <Text style={s.upcomingBadgeTxt}>
                          {upcoming} UPCOMING
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={s.courseBody}>
                    <Text style={s.courseTitle}>{course.title}</Text>
                    {course.category && (
                      <View style={s.categoryLine}>
                        <Text style={s.courseCategory}>{course.category}</Text>
                        {owned ? (
                          <Text style={s.ownedTag}>
                            ✓ {owned.remainingCredits} credits
                          </Text>
                        ) : (
                          <Text style={s.needPlanTag}>Plan required</Text>
                        )}
                      </View>
                    )}
                    <Text style={s.courseCoach}>
                      👤 {course.coachName} · {course.duration}
                    </Text>
                    {course.location && (
                      <Text style={s.courseMeta2}>📍 {course.location}</Text>
                    )}
                    <View style={s.courseMeta}>
                      <View style={s.slotBadge}>
                        <Text
                          style={[
                            s.slotTxt,
                            {
                              color:
                                course.slots === "Unlimited" ? C.green : C.pink,
                            },
                          ]}
                        >
                          {course.slots}
                        </Text>
                      </View>
                    </View>
                    {onlineBooked && course.meetingLink && (
                      <TouchableOpacity
                        style={[s.bookNowBtn, { backgroundColor: C.lime }]}
                        onPress={() =>
                          Linking.openURL(course.meetingLink!).catch(() =>
                            Alert.alert(
                              "Couldn't open link",
                              "The meeting link looks invalid.",
                            ),
                          )
                        }
                        activeOpacity={0.85}
                      >
                        <Ionicons name="videocam" size={13} color={C.bg} />
                        <Text style={s.bookNowTxt}>Join Online Class</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      <ChatWindow
        visible={chatVisible}
        conv={activeConv}
        me={me}
        onClose={() => setChatVisible(false)}
      />
      <ChatWindow
        visible={coachChatVisible}
        conv={coachConv}
        me={me}
        onClose={() => setCoachChatVisible(false)}
      />
      <CourseModal
        course={selectedCourse}
        visible={courseVisible}
        onlineBooked={
          selectedCourse ? isOnlineBookedFor(selectedCourse.id) : false
        }
        upcomingCount={selectedCourse ? upcomingCountFor(selectedCourse.id) : 0}
        ownedMembership={
          selectedCourse ? membershipFor(selectedCourse.category) : null
        }
        me={me}
        onClose={() => setCourseVisible(false)}
        onBook={handleStartBooking}
        onOpenCoachChat={() => {
          setCourseVisible(false);
          if (selectedCourse) handleOpenCoachChat(selectedCourse);
        }}
        onOpenCourseHub={() => {
          setCourseVisible(false);
          if (selectedCourse) onOpenCourseHub?.(selectedCourse.id);
        }}
      />

      <BookingModal
        course={selectedCourse}
        membership={activeMembership}
        existingBookings={
          selectedCourse ? bookingsForCourse(selectedCourse.id) : []
        }
        visible={bookingModalVisible}
        me={me}
        onClose={() => {
          setBookingModalVisible(false);
          setActiveMembership(null);
        }}
        onBooked={handleBooked}
      />

      {onlineBooking && (
        <View style={s.onlineBookingOverlay} pointerEvents="none">
          <ActivityIndicator color={C.lime} size="large" />
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  badge: {
    backgroundColor: C.lime,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeTxt: {
    color: C.bg,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: C.white,
    letterSpacing: -0.4,
  },
  plansBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  plansBtnTxt: { fontSize: 11, fontWeight: "700", color: C.lime },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: C.lime },
  tabTxt: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: C.muted },
  tabTxtActive: { color: C.lime },
  secLbl: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    color: C.muted,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  followersRow: { paddingHorizontal: 16, paddingBottom: 8, gap: 12 },
  followerItem: { alignItems: "center", width: 62, gap: 5 },
  storyRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2.5,
    borderColor: C.lime,
    justifyContent: "center",
    alignItems: "center",
  },
  storyAv: { width: 52, height: 52, borderRadius: 26 },
  storyAvFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.card2,
    justifyContent: "center",
    alignItems: "center",
  },
  storyInitial: { color: C.lime, fontSize: 20, fontWeight: "900" },
  followerName: {
    fontSize: 10,
    fontWeight: "600",
    color: C.white,
    textAlign: "center",
  },
  convItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  convAv: { width: 46, height: 46, borderRadius: 14 },
  convAvFallback: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: C.card2,
    justifyContent: "center",
    alignItems: "center",
  },
  convAvTxt: { fontSize: 18, fontWeight: "900", color: C.lime },
  convInfo: { flex: 1, minWidth: 0 },
  convName: { fontSize: 14, fontWeight: "700", color: C.white },
  convPreview: { fontSize: 12, color: C.muted, marginTop: 2 },
  convMeta: { alignItems: "flex-end", gap: 4 },
  convTime: { fontSize: 11, color: C.muted },
  unreadBadge: {
    backgroundColor: C.lime,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: "center",
  },
  unreadTxt: { fontSize: 10, fontWeight: "900", color: C.bg },
  emptyBox: {
    alignItems: "center",
    padding: 20,
    marginHorizontal: 16,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  emptyTxt: { fontSize: 14, fontWeight: "700", color: C.white },
  emptySub: { fontSize: 12, color: C.muted, textAlign: "center" },
  courseList: { padding: 16, gap: 12 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: {
    flex: 1,
    color: C.white,
    fontSize: 13,
    padding: 0,
  },
  categoryRow: {
    gap: 8,
    paddingVertical: 12,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  categoryChipSel: { backgroundColor: C.lime, borderColor: C.lime },
  categoryChipEmoji: { fontSize: 12 },
  categoryChipTxt: { fontSize: 11, fontWeight: "700", color: C.muted },
  categoryChipTxtSel: { color: C.bg },
  ownedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.green,
    marginLeft: 2,
  },
  courseCard: {
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 16,
    overflow: "hidden",
  },
  courseThumb: { height: 130, position: "relative" },
  courseThumbImg: { width: "100%", height: "100%" },
  courseThumbFallback: {
    width: "100%",
    height: "100%",
    backgroundColor: "#0f3460",
    alignItems: "center",
    justifyContent: "center",
  },
  courseTypeBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  courseTypeTxt: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  badgeOnline: { backgroundColor: C.blue },
  badgePhysical: { backgroundColor: C.lime },
  badgeHot: { backgroundColor: C.pink },
  enrolledBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: C.green,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  enrolledBadgeTxt: {
    fontSize: 9,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 1,
  },
  upcomingBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: C.blue,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  upcomingBadgeTxt: {
    fontSize: 9,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 0.5,
  },
  courseBody: { padding: 12 },
  courseTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: C.white,
    marginBottom: 4,
  },
  categoryLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  courseCategory: {
    fontSize: 10,
    fontWeight: "700",
    color: C.lime,
    letterSpacing: 0.5,
  },
  ownedTag: {
    fontSize: 10,
    fontWeight: "700",
    color: C.green,
  },
  needPlanTag: {
    fontSize: 10,
    fontWeight: "700",
    color: C.pink,
  },
  courseCoach: { fontSize: 12, color: C.muted },
  courseMeta2: { fontSize: 11, color: C.muted, marginTop: 2 },
  courseMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 8,
  },
  slotBadge: {
    backgroundColor: C.card2,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  slotTxt: { fontSize: 11, fontWeight: "700" },
  bookNowBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.blue,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
    alignSelf: "flex-start",
  },
  bookNowTxt: { color: C.bg, fontSize: 12, fontWeight: "800" },
  onlineBookingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
});

const cm = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "92%",
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  hdr: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  hdrTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: C.white,
    flex: 1,
    marginRight: 12,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
  },
  hero: { height: 180, position: "relative" },
  heroImg: { width: "100%", height: "100%" },
  heroFallback: {
    width: "100%",
    height: "100%",
    backgroundColor: "#0f3460",
    alignItems: "center",
    justifyContent: "center",
  },
  heroBadgeRow: {
    position: "absolute",
    bottom: 10,
    left: 12,
    flexDirection: "row",
    gap: 6,
  },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  badgeOnline: { backgroundColor: C.blue },
  badgePhysical: { backgroundColor: C.lime },
  badgeHot: { backgroundColor: C.pink },
  badgeTxt: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  body: { padding: 18 },
  name: {
    fontSize: 20,
    fontWeight: "900",
    color: C.white,
    letterSpacing: -0.5,
  },
  desc: {
    fontSize: 13,
    color: C.muted,
    marginTop: 6,
    marginBottom: 14,
    lineHeight: 20,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipLbl: {
    fontSize: 9,
    fontWeight: "700",
    color: C.muted,
    letterSpacing: 1.5,
  },
  chipVal: { fontSize: 12, color: C.white, fontWeight: "600", marginTop: 1 },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  infoTxt: { fontSize: 12, color: C.muted },
  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.lime,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  joinBtnTxt: { fontSize: 13, fontWeight: "900", color: C.bg },
  secLbl: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    color: C.muted,
    marginBottom: 8,
    marginTop: 4,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.lime },
  itemTxt: { fontSize: 13, color: C.white, flex: 1 },
  coachRow: {
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  coachAv: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: C.bg,
    borderWidth: 2,
    borderColor: C.lime,
    justifyContent: "center",
    alignItems: "center",
  },
  coachInitial: { fontSize: 18, fontWeight: "900", color: C.lime },
  coachName: { fontSize: 13, fontWeight: "800", color: C.white },
  coachRole: { fontSize: 11, color: C.muted, marginTop: 1 },
  coachChatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.lime,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  coachChatTxt: { fontSize: 12, fontWeight: "800", color: C.bg },
  coachNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 8,
    padding: 8,
    backgroundColor: C.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  coachNoticeTxt: { fontSize: 11, color: C.muted, flex: 1, lineHeight: 16 },
  hubBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  hubBtnTxt: { flex: 1, fontSize: 12, fontWeight: "700", color: C.white },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: C.card2,
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
  },
  priceLbl: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    color: C.muted,
  },
  membershipStatus: { fontSize: 14, fontWeight: "800", marginTop: 2 },
  slots: { fontSize: 14, fontWeight: "700", marginTop: 2 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  enrollBtn: {
    backgroundColor: C.lime,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  enrollTxt: {
    fontSize: 14,
    fontWeight: "900",
    color: C.bg,
    letterSpacing: 0.5,
  },
  enrolledPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.green + "18",
    borderWidth: 1,
    borderColor: C.green + "55",
    borderRadius: 14,
    padding: 14,
  },
  enrolledPillTxt: { fontSize: 14, fontWeight: "900", color: C.green },
  enrollFirstHint: {
    textAlign: "center",
    color: C.muted,
    fontSize: 11,
    marginTop: 8,
  },
});
