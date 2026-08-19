// BookingModal.tsx
// Booking flow with a soft "confirmation hold":
//   1. Tap a time slot -> a transaction atomically checks
//      (taken + activeHolds < totalSeats). If there's room, it reserves a
//      spot by writing a hold entry (keyed by a deterministic ID, expiring
//      in HOLD_DURATION_MS) and opens the confirmation screen with a
//      countdown. If there's no room (including spots held by OTHER users
//      currently on their own confirmation screens), the tap is rejected
//      immediately with a clear message — no confirmation screen opens.
//   2. On the confirmation screen, a self-correcting countdown (computed
//      from the fixed expiry timestamp every tick, not decremented
//      blindly — this avoids the "stacked interval" bug we hit before)
//      shows how long the hold is good for.
//   3. Confirm within time -> the hold converts into a real Booking
//      (credit deducted, taken incremented) in one transaction.
//   4. Time runs out, or the user backs out manually -> the hold is
//      released immediately (best effort) and the user returns to the
//      slot list, where the freed-up spot becomes visible to everyone
//      again in real time.

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  StatusBar,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { User } from "firebase/auth";
import {
  getFirestore,
  doc,
  collection,
  runTransaction,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import {
  C,
  Course,
  SlotDoc,
  Booking,
  slotKey,
  bookingId,
  activeHoldCount,
  HOLD_DURATION_MS,
  UserMembership,
  generateCalendarDays,
} from "./chatcoursetype";

export function BookingModal({
  course,
  membership,
  existingBookings,
  visible,
  me,
  onClose,
  onBooked,
}: {
  course: Course | null;
  membership: UserMembership | null;
  existingBookings: Booking[];
  visible: boolean;
  me: User | null;
  onClose: () => void;
  onBooked: () => void;
}) {
  const db = getFirestore();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [pendingSlot, setPendingSlot] = useState<string | null>(null);
  const [slotDocs, setSlotDocs] = useState<Record<string, SlotDoc>>({});
  const [acquiring, setAcquiring] = useState(false); // tapping a slot -> trying to acquire hold
  const [booking, setBooking] = useState(false); // confirming the hold into a real booking
  const [secs, setSecs] = useState(0);
  const calDays = course ? generateCalendarDays(course.scheduleDays) : [];

  const holdExpiryRef = useRef<number>(0);
  const holdKeyRef = useRef<string | null>(null); // slotKey(date, timeSlot) of the held slot
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const releasedRef = useRef(true); // starts true = nothing to release

  useEffect(() => {
    if (!visible) return;
    setSelectedDate(null);
    setPendingSlot(null);
    releasedRef.current = true;
  }, [visible, course?.id]);

  useEffect(() => {
    if (!visible || !course) return;
    return onSnapshot(
      collection(db, "courses", course.id, "slots"),
      (snap) => {
        const map: Record<string, SlotDoc> = {};
        snap.docs.forEach((d) => {
          map[d.id] = d.data() as SlotDoc;
        });
        setSlotDocs(map);
      },
      (err) => console.error("Slots snapshot error:", err),
    );
  }, [visible, course?.id]);

  // Remaining spots = total - confirmed - other users' active holds. This
  // is what the slot LIST shows, so it reflects other people's in-progress
  // confirmations in real time (via onSnapshot above).
  const remainingFor = (date: string, timeSlot: string) => {
    if (!course) return 0;
    const key = slotKey(date, timeSlot);
    const data = slotDocs[key];
    const taken = data?.taken || 0;
    const holds = activeHoldCount(data?.holds, Date.now());
    return Math.max(0, course.totalSeats - taken - holds);
  };

  const alreadyBookedFor = (date: string, timeSlot: string) =>
    existingBookings.some(
      (b) =>
        b.date === date && b.timeSlot === timeSlot && b.status === "confirmed",
    );

  // Releases whatever hold is currently held (if any). Best-effort — the
  // hold would also just expire on its own within a minute, so failures
  // here aren't critical, just less immediate for other users.
  const releaseHold = async () => {
    if (releasedRef.current || !course || !holdKeyRef.current) return;
    releasedRef.current = true;
    const key = holdKeyRef.current;
    const id =
      holdKeyRef.current && pendingSlot
        ? bookingId(me?.uid ?? "", course.id, selectedDate, pendingSlot)
        : null;
    try {
      await runTransaction(db, async (tx) => {
        const slotRef = doc(db, "courses", course.id, "slots", key);
        const snap = await tx.get(slotRef);
        if (!snap.exists() || !id) return;
        const data = snap.data() as SlotDoc;
        const holds = { ...(data.holds || {}) };
        delete holds[id];
        tx.set(slotRef, { ...data, holds }, { merge: true });
      });
    } catch (e) {
      console.error("Failed to release hold:", e);
    }
  };

  // Self-correcting countdown — recomputes remaining time from the fixed
  // expiry timestamp every tick instead of decrementing a counter, so it
  // can't be thrown off by overlapping intervals.
  useEffect(() => {
    if (!pendingSlot) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((holdExpiryRef.current - Date.now()) / 1000),
      );
      setSecs(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current!);
        releaseHold().finally(() => {
          setPendingSlot(null);
          Alert.alert(
            "Hold expired",
            "You took too long to confirm — this spot has been released. Please select a time again.",
          );
        });
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSlot]);

  // Step 1: tap a slot -> try to atomically acquire a hold on it.
  const handleSelectSlot = async (date: string, timeSlot: string) => {
    if (!course || !me || acquiring) return;
    if (alreadyBookedFor(date, timeSlot)) {
      Alert.alert("Already booked", "You've already booked this session.");
      return;
    }
    setAcquiring(true);
    try {
      const id = bookingId(me.uid, course.id, date, timeSlot);
      const expiry = Date.now() + HOLD_DURATION_MS;

      await runTransaction(db, async (tx) => {
        const key = slotKey(date, timeSlot);
        const slotRef = doc(db, "courses", course.id, "slots", key);
        const snap = await tx.get(slotRef);
        const data: SlotDoc = snap.exists()
          ? (snap.data() as SlotDoc)
          : { taken: 0 };
        const now = Date.now();
        const holds = activeHoldCount(data.holds, now);

        if ((data.taken || 0) + holds >= course.totalSeats) {
          throw new Error("SLOT_FULL");
        }

        const newHolds = { ...(data.holds || {}) };
        newHolds[id] = expiry;
        tx.set(
          slotRef,
          { taken: data.taken || 0, holds: newHolds },
          { merge: true },
        );
      });

      holdExpiryRef.current = expiry;
      holdKeyRef.current = slotKey(date, timeSlot);
      releasedRef.current = false;
      setPendingSlot(timeSlot);
    } catch (e: any) {
      if (e.message === "SLOT_FULL") {
        Alert.alert(
          "Spot unavailable",
          "This slot just filled up or is being held by another user finishing their booking. Please try again in a moment or pick another time.",
        );
      } else {
        Alert.alert("Error", e.message ?? "Could not select this slot.");
      }
    } finally {
      setAcquiring(false);
    }
  };

  // Step 2: confirm within the hold window -> convert hold into a real
  // booking (deduct credit, increment taken, write the Booking doc).
  const handleConfirm = async () => {
    if (
      !course ||
      !me ||
      !membership ||
      !selectedDate ||
      !pendingSlot ||
      booking
    )
      return;
    const date = selectedDate;
    const timeSlot = pendingSlot;
    const id = bookingId(me.uid, course.id, date, timeSlot);
    setBooking(true);
    try {
      await runTransaction(db, async (tx) => {
        const key = slotKey(date, timeSlot);
        const slotRef = doc(db, "courses", course.id, "slots", key);
        const membershipRef = doc(db, "memberships", membership.id);
        const bookingRef = doc(db, "bookings", id);

        const [slotSnap, membershipSnap, bookingSnap] = await Promise.all([
          tx.get(slotRef),
          tx.get(membershipRef),
          tx.get(bookingRef),
        ]);

        if (bookingSnap.exists() && bookingSnap.data().status === "confirmed") {
          throw new Error("ALREADY_BOOKED");
        }

        const slotData: SlotDoc = slotSnap.exists()
          ? (slotSnap.data() as SlotDoc)
          : { taken: 0 };
        const myHoldExpiry = slotData.holds?.[id];
        if (!myHoldExpiry || myHoldExpiry < Date.now()) {
          throw new Error("HOLD_EXPIRED");
        }

        if (!membershipSnap.exists()) throw new Error("NO_MEMBERSHIP");
        const freshMembership = membershipSnap.data() as UserMembership;
        if (
          freshMembership.status !== "active" ||
          freshMembership.remainingCredits <= 0
        ) {
          throw new Error("NO_CREDITS");
        }

        const newHolds = { ...(slotData.holds || {}) };
        delete newHolds[id];
        const newRemaining = freshMembership.remainingCredits - 1;

        tx.set(
          slotRef,
          { taken: (slotData.taken || 0) + 1, holds: newHolds },
          { merge: true },
        );
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
          date,
          timeSlot,
          status: "confirmed",
          createdAt: serverTimestamp(),
        });
      });

      releasedRef.current = true; // hold has been consumed, nothing left to release
      setPendingSlot(null);
      Alert.alert("🎉 Booked!", `${course.title} on ${date} at ${timeSlot}`);
      onBooked();
    } catch (e: any) {
      if (e.message === "HOLD_EXPIRED") {
        Alert.alert(
          "Hold expired",
          "Your hold on this spot expired. Please select a time again.",
        );
        setPendingSlot(null);
      } else if (e.message === "ALREADY_BOOKED") {
        Alert.alert("Already booked", "You've already booked this session.");
        setPendingSlot(null);
      } else if (e.message === "NO_CREDITS" || e.message === "NO_MEMBERSHIP") {
        Alert.alert(
          "No credits left",
          "Your membership ran out of credits. Please purchase another plan.",
        );
        onClose();
      } else {
        Alert.alert(
          "Booking error",
          e.message ?? "Could not complete booking.",
        );
      }
    } finally {
      setBooking(false);
    }
  };

  const handleBackFromConfirm = () => {
    releaseHold();
    setPendingSlot(null);
  };

  const handleCloseModal = () => {
    if (pendingSlot) releaseHold();
    onClose();
  };

  if (!course) return null;
  const mins = Math.floor(secs / 60);
  const sec = secs % 60;
  const urgent = secs <= 15;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCloseModal}
    >
      <View style={ss.root}>
        <StatusBar barStyle="light-content" />
        <View style={ss.hdr}>
          <TouchableOpacity
            style={ss.backBtn}
            onPress={() =>
              pendingSlot ? handleBackFromConfirm() : handleCloseModal()
            }
          >
            <Ionicons name="chevron-back" size={22} color={C.white} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={ss.hdrTitle}>
              {pendingSlot ? "Confirm Booking" : "Book a Session"}
            </Text>
            <Text style={ss.hdrSub}>
              {course.emoji} {course.title}
            </Text>
          </View>
        </View>

        {pendingSlot && (
          <View style={[ss.timerBar, urgent && ss.timerBarUrgent]}>
            <Ionicons
              name="time-outline"
              size={16}
              color={urgent ? C.danger : C.lime}
            />
            <Text style={[ss.timerTxt, urgent && { color: C.danger }]}>
              {mins}:{String(sec).padStart(2, "0")} to confirm — your spot is
              held until then
            </Text>
          </View>
        )}

        {pendingSlot ? (
          <ScrollView
            contentContainerStyle={ss.body}
            showsVerticalScrollIndicator={false}
          >
            <View style={ss.summaryCard}>
              <Text style={ss.summaryEmoji}>{course.emoji}</Text>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={ss.summaryTitle}>{course.title}</Text>
                <View style={ss.summaryRow}>
                  <Ionicons name="calendar-outline" size={13} color={C.muted} />
                  <Text style={ss.summaryInfo}>
                    {selectedDate} · {pendingSlot}
                  </Text>
                </View>
                <View style={ss.summaryRow}>
                  <Ionicons name="person-outline" size={13} color={C.muted} />
                  <Text style={ss.summaryInfo}>{course.coachName}</Text>
                </View>
                {course.location && (
                  <View style={ss.summaryRow}>
                    <Ionicons
                      name="location-outline"
                      size={13}
                      color={C.muted}
                    />
                    <Text style={ss.summaryInfo}>{course.location}</Text>
                  </View>
                )}
              </View>
            </View>

            {membership && (
              <View style={ss.creditCard}>
                <Ionicons name="card-outline" size={16} color={C.lime} />
                <Text style={ss.creditCardTxt}>
                  {membership.planName} · this will use{" "}
                  <Text style={{ fontWeight: "900" }}>1 credit</Text> (
                  {membership.remainingCredits} →{" "}
                  {membership.remainingCredits - 1} remaining)
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[ss.confirmBtn, booking && { opacity: 0.6 }]}
              onPress={handleConfirm}
              disabled={booking}
              activeOpacity={0.85}
            >
              {booking ? (
                <ActivityIndicator color={C.bg} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={C.bg} />
                  <Text style={ss.confirmBtnTxt}>Confirm Booking</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={ss.cancelLink}
              onPress={handleBackFromConfirm}
              disabled={booking}
            >
              <Text style={ss.cancelLinkTxt}>Choose a different time</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <>
            {membership && (
              <View style={ss.creditBar}>
                <Ionicons name="card-outline" size={16} color={C.lime} />
                <Text style={ss.creditTxt}>
                  Using {membership.planName} · {membership.remainingCredits}{" "}
                  credit{membership.remainingCredits === 1 ? "" : "s"} left
                </Text>
              </View>
            )}

            <ScrollView
              contentContainerStyle={ss.body}
              showsVerticalScrollIndicator={false}
            >
              <Text style={ss.stepLbl}>SELECT DATE</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={ss.calRow}
              >
                {calDays.map((d) => {
                  const isSel = selectedDate === d.date;
                  return (
                    <TouchableOpacity
                      key={d.date}
                      style={[
                        ss.calDay,
                        isSel && ss.calDaySel,
                        !d.available && ss.calDayDis,
                      ]}
                      onPress={() => d.available && setSelectedDate(d.date)}
                      disabled={!d.available}
                    >
                      <Text
                        style={[
                          ss.calDayName,
                          isSel && ss.calTxtSel,
                          !d.available && ss.calTxtDis,
                        ]}
                      >
                        {d.day}
                      </Text>
                      <Text
                        style={[
                          ss.calDayNum,
                          isSel && ss.calTxtSel,
                          !d.available && ss.calTxtDis,
                        ]}
                      >
                        {d.label.split(" ")[0]}
                      </Text>
                      <Text
                        style={[
                          ss.calDayMon,
                          isSel && ss.calTxtSel,
                          !d.available && ss.calTxtDis,
                        ]}
                      >
                        {d.label.split(" ")[1]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {selectedDate && (
                <>
                  <Text style={[ss.stepLbl, { marginTop: 20 }]}>
                    SELECT TIME SLOT
                  </Text>
                  <View style={ss.timeGrid}>
                    {course.timeSlots.map((ts) => {
                      const remaining = remainingFor(selectedDate, ts);
                      const isFull = remaining <= 0;
                      const isBooked = alreadyBookedFor(selectedDate, ts);
                      const disabled = isFull || isBooked || acquiring;
                      return (
                        <TouchableOpacity
                          key={ts}
                          style={[
                            ss.timeSlot,
                            isFull && ss.timeSlotFull,
                            isBooked && ss.timeSlotBooked,
                          ]}
                          onPress={() =>
                            !disabled && handleSelectSlot(selectedDate, ts)
                          }
                          disabled={disabled}
                        >
                          {acquiring ? (
                            <ActivityIndicator size="small" color={C.lime} />
                          ) : (
                            <Ionicons
                              name={
                                isBooked ? "checkmark-circle" : "time-outline"
                              }
                              size={16}
                              color={
                                isBooked ? C.green : isFull ? C.muted : C.lime
                              }
                            />
                          )}
                          <Text
                            style={[
                              ss.timeSlotTxt,
                              isFull && ss.timeTxtFull,
                              isBooked && ss.timeTxtBooked,
                            ]}
                          >
                            {ts}
                          </Text>
                          <View
                            style={[
                              ss.seatBadge,
                              isFull && { backgroundColor: C.danger + "22" },
                              isBooked && { backgroundColor: C.green + "22" },
                            ]}
                          >
                            <Text
                              style={[
                                ss.seatTxt,
                                isFull && { color: C.danger },
                                isBooked && { color: C.green },
                              ]}
                            >
                              {isBooked
                                ? "Booked"
                                : isFull
                                  ? "Full"
                                  : `${remaining} left`}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={ss.tapHint}>
                    Tap a time slot to hold your spot for 1 minute while you
                    confirm.
                  </Text>
                </>
              )}
            </ScrollView>
          </>
        )}
      </View>
    </Modal>
  );
}

const ss = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  hdr: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 16,
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
  hdrTitle: { fontSize: 16, fontWeight: "800", color: C.white },
  hdrSub: { fontSize: 12, color: C.muted, marginTop: 1 },
  timerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.lime + "15",
    paddingVertical: 10,
  },
  timerBarUrgent: { backgroundColor: C.danger + "15" },
  timerTxt: { color: C.lime, fontSize: 12, fontWeight: "800" },
  creditBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.lime + "15",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  creditTxt: { flex: 1, color: C.lime, fontSize: 12, fontWeight: "700" },
  body: { padding: 20, paddingBottom: 40 },
  stepLbl: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    color: C.muted,
    marginBottom: 10,
  },
  calRow: { gap: 8, paddingVertical: 4 },
  calDay: {
    width: 58,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    gap: 2,
  },
  calDaySel: { backgroundColor: C.lime, borderColor: C.lime },
  calDayDis: { opacity: 0.3 },
  calDayName: {
    fontSize: 10,
    fontWeight: "700",
    color: C.muted,
    letterSpacing: 0.5,
  },
  calDayNum: { fontSize: 18, fontWeight: "900", color: C.white },
  calDayMon: { fontSize: 10, fontWeight: "600", color: C.muted },
  calTxtSel: { color: C.bg },
  calTxtDis: { color: C.muted },
  timeGrid: { gap: 10 },
  timeSlot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  timeSlotFull: { opacity: 0.5, borderStyle: "dashed" },
  timeSlotBooked: {
    borderColor: C.green + "55",
    backgroundColor: C.green + "0d",
  },
  timeSlotTxt: { flex: 1, fontSize: 15, fontWeight: "700", color: C.white },
  timeTxtFull: { color: C.muted },
  timeTxtBooked: { color: C.green },
  seatBadge: {
    backgroundColor: C.card2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  seatTxt: { fontSize: 11, fontWeight: "700", color: C.lime },
  tapHint: {
    fontSize: 11,
    color: C.muted,
    textAlign: "center",
    marginTop: 16,
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 14,
  },
  summaryEmoji: { fontSize: 36 },
  summaryTitle: { fontSize: 15, fontWeight: "800", color: C.white },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  summaryInfo: { fontSize: 12, color: C.muted },
  creditCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.lime + "15",
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  creditCardTxt: { flex: 1, fontSize: 12, color: C.white, lineHeight: 17 },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.lime,
    borderRadius: 16,
    padding: 16,
  },
  confirmBtnTxt: { fontSize: 15, fontWeight: "900", color: C.bg },
  cancelLink: { alignItems: "center", padding: 12 },
  cancelLinkTxt: { fontSize: 12, color: C.muted, fontWeight: "600" },
});
