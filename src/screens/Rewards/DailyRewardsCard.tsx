// DailyRewardsCard.tsx
// Replaces Home.tsx's old one-tap "Daily Check-in" card. Self-fetches its
// own data (today's reward config + the user's progress) so Home.tsx only
// needs to render <DailyRewardsCard onOpenCalendar={...} />.

import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";

import {
  C,
  TOTAL_DAYS,
  DailyRewardDay,
  UserRewardProgress,
  normalizeDailyRewardDay,
  normalizeProgress,
  canClaimToday,
  isCycleComplete,
  msUntilMidnight,
  formatCountdown,
  claimTodayReward,
  rewardSummary,
} from "./rewardTypes";
import { RewardClaimedModal } from "./RewardClaimedModal";

export function DailyRewardsCard({ onOpenCalendar }: { onOpenCalendar: () => void }) {
  const auth = getAuth();
  const db = getFirestore();
  const uid = auth.currentUser?.uid;

  const [progress, setProgress] = useState<UserRewardProgress>(normalizeProgress(null));
  const [todayReward, setTodayReward] = useState<DailyRewardDay | null>(null);
  const [tomorrowReward, setTomorrowReward] = useState<DailyRewardDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [countdown, setCountdown] = useState(formatCountdown(msUntilMidnight()));
  const [celebrateDay, setCelebrateDay] = useState<DailyRewardDay | null>(null);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    return onSnapshot(doc(db, "userRewardProgress", uid), (snap) => {
      setProgress(normalizeProgress(snap.exists() ? snap.data() : null));
    });
  }, [uid]);

  useEffect(() => {
    if (isCycleComplete(progress)) {
      setLoading(false);
      return;
    }
    const unsubToday = onSnapshot(
      doc(db, "dailyRewards", String(progress.currentDay)),
      (snap) => {
        setTodayReward(snap.exists() ? normalizeDailyRewardDay(progress.currentDay, snap.data()) : null);
        setLoading(false);
      },
    );
    const unsubTomorrow =
      progress.currentDay < TOTAL_DAYS
        ? onSnapshot(doc(db, "dailyRewards", String(progress.currentDay + 1)), (snap) => {
            setTomorrowReward(
              snap.exists() ? normalizeDailyRewardDay(progress.currentDay + 1, snap.data()) : null,
            );
          })
        : undefined;
    return () => {
      unsubToday();
      unsubTomorrow?.();
    };
  }, [progress.currentDay]);

  // Countdown ticks once a minute while today's reward is already claimed.
  useEffect(() => {
    if (canClaimToday(progress)) return;
    const t = setInterval(() => setCountdown(formatCountdown(msUntilMidnight())), 60000);
    return () => clearInterval(t);
  }, [progress]);

  const handleClaim = async () => {
    if (!uid || !todayReward || claiming) return;
    setClaiming(true);
    const result = await claimTodayReward(db, uid, todayReward);
    setClaiming(false);
    if (result.success) {
      setCelebrateDay(todayReward);
    }
    // Silently ignore race-condition errors here (e.g. already claimed on
    // another device) — the live progress/today listeners will just
    // re-render into the correct "claimed" state on their own.
  };

  if (loading) {
    return (
      <View style={[c.card, { alignItems: "center", padding: 24 }]}>
        <ActivityIndicator color={C.lime} />
      </View>
    );
  }

  if (isCycleComplete(progress)) {
    return (
      <TouchableOpacity style={c.card} onPress={onOpenCalendar} activeOpacity={0.85}>
        <Text style={c.doneEmoji}>🏆</Text>
        <Text style={c.doneTitle}>30-day cycle complete!</Text>
        <Text style={c.doneSub}>You claimed every reward. Nice streak.</Text>
      </TouchableOpacity>
    );
  }

  if (!todayReward) {
    // Admin hasn't configured this day yet — fail gracefully rather than
    // showing a broken claim button.
    return null;
  }

  const claimable = canClaimToday(progress);
  const streakDisplay = Math.min(progress.streak, 7);

  return (
    <View style={c.card}>
      <View style={c.topRow}>
        <View style={c.giftBadge}>
          <Ionicons name="gift" size={14} color={C.bg} />
          <Text style={c.giftBadgeTxt}>Daily Rewards</Text>
        </View>
        <TouchableOpacity onPress={onOpenCalendar} style={c.calendarLink}>
          <Text style={c.calendarLinkTxt}>Day {progress.currentDay}</Text>
          <Ionicons name="chevron-forward" size={13} color={C.muted} />
        </TouchableOpacity>
      </View>

      <View style={c.mainRow}>
        <Text style={c.mainIcon}>{todayReward.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={c.mainLbl}>TODAY'S REWARD</Text>
          <Text style={c.mainTitle}>{todayReward.title || rewardSummary(todayReward)}</Text>
        </View>
      </View>

      {claimable ? (
        <TouchableOpacity
          style={[c.claimBtn, claiming && { opacity: 0.6 }]}
          onPress={handleClaim}
          disabled={claiming}
          activeOpacity={0.85}
        >
          {claiming ? (
            <ActivityIndicator color={C.bg} />
          ) : (
            <>
              <Ionicons name="gift-outline" size={16} color={C.bg} />
              <Text style={c.claimBtnTxt}>Claim Reward</Text>
            </>
          )}
        </TouchableOpacity>
      ) : (
        <View style={c.claimedBox}>
          <Ionicons name="checkmark-circle" size={16} color={C.green} />
          <Text style={c.claimedTxt}>Claimed today · back in {countdown}</Text>
        </View>
      )}

      <View style={c.footerRow}>
        <View style={c.streakRow}>
          <Ionicons name="flame" size={14} color={progress.streak > 0 ? C.orange : C.muted} />
          <Text style={c.streakTxt}>{progress.streak} day streak</Text>
          <View style={{ flexDirection: "row", gap: 2, marginLeft: 4 }}>
            {Array.from({ length: 7 }, (_, i) => (
              <View
                key={i}
                style={[c.streakDot, i < streakDisplay && { backgroundColor: C.orange }]}
              />
            ))}
          </View>
        </View>
        {tomorrowReward && (
          <Text style={c.nextTxt} numberOfLines={1}>
            Next: {tomorrowReward.icon} {rewardSummary(tomorrowReward)}
          </Text>
        )}
      </View>

      <RewardClaimedModal
        visible={!!celebrateDay}
        day={celebrateDay}
        onClose={() => setCelebrateDay(null)}
      />
    </View>
  );
}

const c = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: C.border,
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  giftBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.lime,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  giftBadgeTxt: { fontSize: 11, fontWeight: "800", color: C.bg },
  calendarLink: { flexDirection: "row", alignItems: "center", gap: 2 },
  calendarLinkTxt: { fontSize: 12, fontWeight: "700", color: C.muted },
  mainRow: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 16 },
  mainIcon: { fontSize: 42 },
  mainLbl: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5, color: C.muted },
  mainTitle: { fontSize: 18, fontWeight: "900", color: C.white, marginTop: 3 },
  claimBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.lime,
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 16,
  },
  claimBtnTxt: { fontSize: 14, fontWeight: "900", color: C.bg },
  claimedBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: C.green + "18",
    borderWidth: 1,
    borderColor: C.green + "40",
    borderRadius: 14,
    paddingVertical: 12,
    marginTop: 16,
  },
  claimedTxt: { fontSize: 12.5, fontWeight: "700", color: C.green },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    gap: 10,
  },
  streakRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  streakTxt: { fontSize: 11.5, fontWeight: "700", color: C.muted },
  streakDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.border },
  nextTxt: { flex: 1, fontSize: 11, color: C.muted, textAlign: "right" },
  doneEmoji: { fontSize: 36, textAlign: "center" },
  doneTitle: { fontSize: 15, fontWeight: "800", color: C.white, textAlign: "center", marginTop: 8 },
  doneSub: { fontSize: 12, color: C.muted, textAlign: "center", marginTop: 4 },
});
