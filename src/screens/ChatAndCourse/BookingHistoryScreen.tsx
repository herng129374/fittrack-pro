// BookingHistoryScreen.tsx
// Shows the current user's booking history, grouped into "Upcoming" and
// "Past" sections. Upcoming bookings can be cancelled — cancelling first
// goes through SecurityVerifyModal (password/PIN/none, per the user's
// Profile > Security setting), then refunds 1 credit to the membership
// and decrements the slot's taken count, all in one transaction.

import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { getAuth, User } from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  query,
  where,
  onSnapshot,
  runTransaction,
} from "firebase/firestore";

import { SecurityVerifyModal } from "../Security/SecurityVerifyModal";
import { C, Booking, SlotDoc, slotKey, isUpcoming } from "./chatcoursetype";

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-MY", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function BookingCard({
  booking,
  cancellable,
  onCancel,
}: {
  booking: Booking;
  cancellable: boolean;
  onCancel: () => void;
}) {
  const isOnline = !booking.date;
  const cancelled = booking.status === "cancelled";
  return (
    <View style={[card.root, cancelled && card.rootCancelled]}>
      <View style={card.topRow}>
        <View style={card.iconWrap}>
          <Text style={{ fontSize: 26 }}>{booking.courseEmoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={card.titleRow}>
            <Text style={card.title} numberOfLines={1}>
              {booking.courseTitle}
            </Text>
            {cancelled && (
              <View style={card.cancelledPill}>
                <Text style={card.cancelledPillTxt}>Cancelled</Text>
              </View>
            )}
          </View>

          {isOnline ? (
            <View style={card.metaRow}>
              <Ionicons name="videocam-outline" size={12} color={C.blue} />
              <Text style={card.metaTxt}>Online session</Text>
            </View>
          ) : (
            <View style={card.metaRow}>
              <Ionicons name="calendar-outline" size={12} color={C.muted} />
              <Text style={card.metaTxt}>
                {formatDate(booking.date)} · {booking.timeSlot}
              </Text>
            </View>
          )}

          {booking.coachName ? (
            <View style={card.metaRow}>
              <Ionicons name="person-outline" size={12} color={C.muted} />
              <Text style={card.metaTxt}>{booking.coachName}</Text>
            </View>
          ) : null}

          {booking.location ? (
            <View style={card.metaRow}>
              <Ionicons name="location-outline" size={12} color={C.muted} />
              <Text style={card.metaTxt}>{booking.location}</Text>
            </View>
          ) : null}

          <View style={card.categoryPill}>
            <Text style={card.categoryPillTxt}>{booking.category}</Text>
          </View>
        </View>
      </View>

      {cancellable && !cancelled && (
        <TouchableOpacity
          style={card.cancelBtn}
          onPress={onCancel}
          activeOpacity={0.8}
        >
          <Ionicons name="close-circle-outline" size={14} color={C.danger} />
          <Text style={card.cancelBtnTxt}>Cancel booking</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function BookingHistoryScreen() {
  const auth = getAuth();
  const db = getFirestore();
  const navigation = useNavigation<any>();
  const [me, setMe] = useState<User | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const [verifyVisible, setVerifyVisible] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    setMe(auth.currentUser);
    return auth.onAuthStateChanged((u) => setMe(u));
  }, []);

  useEffect(() => {
    if (!me) return;
    const q = query(collection(db, "bookings"), where("userId", "==", me.uid));
    return onSnapshot(
      q,
      (snap) => {
        setBookings(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Booking),
        );
        setLoading(false);
      },
      (err) => {
        console.error("Bookings history snapshot error:", err);
        setLoading(false);
      },
    );
  }, [me]);

  const { upcoming, past } = useMemo(() => {
    const confirmed = bookings.filter((b) => b.status === "confirmed");
    const up = confirmed
      .filter((b) => isUpcoming(b))
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    const pastList = bookings
      .filter((b) => b.status === "cancelled" || !isUpcoming(b))
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return { upcoming: up, past: pastList };
  }, [bookings]);

  const requestCancel = (booking: Booking) => {
    const message = `${booking.courseTitle} — ${booking.date ? `${formatDate(booking.date)} · ${booking.timeSlot}` : "Online session"}.\n\n1 credit will be refunded to your membership.`;

    // Alert.alert's custom buttons don't render on web — it falls back to
    // a plain browser alert with no way to distinguish "Keep" vs "Cancel".
    // Use window.confirm there instead, which has real Yes/No semantics.
    if (Platform.OS === "web") {
      const confirmed = window.confirm(`Cancel this booking?\n\n${message}`);
      if (confirmed) {
        setCancelTarget(booking);
        setVerifyVisible(true);
      }
      return;
    }

    Alert.alert("Cancel this booking?", message, [
      { text: "Keep booking", style: "cancel" },
      {
        text: "Cancel booking",
        style: "destructive",
        onPress: () => {
          setCancelTarget(booking);
          setVerifyVisible(true);
        },
      },
    ]);
  };

  const performCancel = async () => {
    if (!cancelTarget || !me) return;
    setCancelling(true);
    try {
      await runTransaction(db, async (tx) => {
        const bookingRef = doc(db, "bookings", cancelTarget.id);
        const membershipRef = doc(db, "memberships", cancelTarget.membershipId);

        // Slot ref only applies to physical bookings (date+timeSlot set).
        const slotRef =
          cancelTarget.date && cancelTarget.timeSlot
            ? doc(
                db,
                "courses",
                cancelTarget.courseId,
                "slots",
                slotKey(cancelTarget.date, cancelTarget.timeSlot),
              )
            : null;

        // ── ALL reads happen first, before any writes ──────────
        const [bookingSnap, membershipSnap, slotSnap] = await Promise.all([
          tx.get(bookingRef),
          tx.get(membershipRef),
          slotRef ? tx.get(slotRef) : Promise.resolve(null),
        ]);

        if (
          !bookingSnap.exists() ||
          bookingSnap.data().status !== "confirmed"
        ) {
          throw new Error("ALREADY_CANCELLED");
        }

        // ── Then ALL writes ─────────────────────────────────────
        // Refund 1 credit — if the membership doc is gone (shouldn't
        // normally happen), still cancel the booking, just skip the
        // refund rather than blocking the cancellation entirely.
        if (membershipSnap.exists()) {
          const m = membershipSnap.data();
          tx.update(membershipRef, {
            remainingCredits: (m.remainingCredits || 0) + 1,
            status: "active",
          });
        }

        // Free up the slot, for physical bookings only.
        if (slotRef && slotSnap && slotSnap.exists()) {
          const slotData = slotSnap.data() as SlotDoc;
          tx.set(
            slotRef,
            { taken: Math.max(0, (slotData.taken || 0) - 1) },
            { merge: true },
          );
        }

        tx.update(bookingRef, { status: "cancelled" });
      });

      setVerifyVisible(false);
      setCancelTarget(null);
      Alert.alert("Booking cancelled", "Your credit has been refunded.");
    } catch (e: any) {
      if (e.message === "ALREADY_CANCELLED") {
        Alert.alert("Already cancelled", "This booking was already cancelled.");
      } else {
        Alert.alert("Error", e.message ?? "Could not cancel this booking.");
      }
      setVerifyVisible(false);
      setCancelTarget(null);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Booking History</Text>
          <Text style={s.headerSub}>Your upcoming and past sessions</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.body}
      >
        {loading ? (
          <ActivityIndicator color={C.lime} style={{ margin: 40 }} />
        ) : bookings.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="calendar-outline" size={28} color={C.muted} />
            <Text style={s.emptyTxt}>No bookings yet</Text>
            <Text style={s.emptySub}>Sessions you book will show up here</Text>
          </View>
        ) : (
          <>
            <Text style={s.secLbl}>UPCOMING · {upcoming.length}</Text>
            {upcoming.length === 0 ? (
              <Text style={s.emptySectionTxt}>No upcoming sessions</Text>
            ) : (
              upcoming.map((b) => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  cancellable
                  onCancel={() => requestCancel(b)}
                />
              ))
            )}

            <Text style={[s.secLbl, { marginTop: 24 }]}>
              PAST · {past.length}
            </Text>
            {past.length === 0 ? (
              <Text style={s.emptySectionTxt}>No past sessions yet</Text>
            ) : (
              past.map((b) => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  cancellable={false}
                  onCancel={() => {}}
                />
              ))
            )}
          </>
        )}
        <View style={{ height: 60 }} />
      </ScrollView>

      <SecurityVerifyModal
        visible={verifyVisible}
        title="Confirm cancellation"
        subtitle="Verify it's you before this booking is cancelled."
        onVerified={performCancel}
        onCancel={() => {
          setVerifyVisible(false);
          setCancelTarget(null);
        }}
      />

      {cancelling && (
        <View style={s.cancellingOverlay} pointerEvents="none">
          <ActivityIndicator color={C.lime} size="large" />
        </View>
      )}
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
  secLbl: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: C.muted,
    marginBottom: 10,
  },
  emptySectionTxt: {
    fontSize: 12,
    color: C.muted,
    fontStyle: "italic",
    marginBottom: 8,
  },
  emptyBox: {
    alignItems: "center",
    padding: 30,
    marginTop: 30,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  emptyTxt: { fontSize: 14, fontWeight: "700", color: C.white },
  emptySub: { fontSize: 12, color: C.muted },
  cancellingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
});

const card = StyleSheet.create({
  root: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
  },
  rootCancelled: { opacity: 0.5 },
  topRow: { flexDirection: "row", gap: 12 },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.card2,
    justifyContent: "center",
    alignItems: "center",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: "800", color: C.white },
  cancelledPill: {
    backgroundColor: C.danger + "22",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  cancelledPillTxt: { fontSize: 10, fontWeight: "700", color: C.danger },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  metaTxt: { fontSize: 12, color: C.muted },
  categoryPill: {
    alignSelf: "flex-start",
    backgroundColor: C.card2,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
  },
  categoryPillTxt: { fontSize: 10, fontWeight: "700", color: C.lime },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.danger + "55",
  },
  cancelBtnTxt: { fontSize: 12, fontWeight: "700", color: C.danger },
});
