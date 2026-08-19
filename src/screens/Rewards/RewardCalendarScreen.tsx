// RewardCalendarScreen.tsx
// Full 30-day Daily Rewards calendar — opened from DailyRewardsCard on
// Home. Shows every day's reward, which are claimed/locked, and lets the
// user claim today's from here too (same claimTodayReward function the
// Home card uses).

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { getAuth } from "firebase/auth";
import { getFirestore, collection, doc, onSnapshot } from "firebase/firestore";

import {
  C,
  TOTAL_DAYS,
  DailyRewardDay,
  UserRewardProgress,
  normalizeDailyRewardDay,
  normalizeProgress,
  canClaimToday,
  isCycleComplete,
  claimTodayReward,
  rewardSummary,
} from "./rewardTypes";
import { RewardClaimedModal } from "./RewardClaimedModal";

type DayStatus = "claimed" | "today" | "locked";

export default function RewardCalendarScreen() {
  const navigation = useNavigation<any>();
  const auth = getAuth();
  const db = getFirestore();
  const uid = auth.currentUser?.uid;

  const [progress, setProgress] = useState<UserRewardProgress>(normalizeProgress(null));
  const [days, setDays] = useState<Record<number, DailyRewardDay>>({});
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [celebrateDay, setCelebrateDay] = useState<DailyRewardDay | null>(null);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "userRewardProgress", uid), (snap) => {
      setProgress(normalizeProgress(snap.exists() ? snap.data() : null));
    });
  }, [uid]);

  useEffect(() => {
    return onSnapshot(collection(db, "dailyRewards"), (snap) => {
      const map: Record<number, DailyRewardDay> = {};
      snap.docs.forEach((d) => {
        const dayNum = Number(d.id);
        if (dayNum) map[dayNum] = normalizeDailyRewardDay(dayNum, d.data());
      });
      setDays(map);
      setLoading(false);
    });
  }, []);

  const statusFor = (day: number): DayStatus => {
    if (day < progress.currentDay) return "claimed";
    if (day === progress.currentDay && canClaimToday(progress)) return "today";
    if (day === progress.currentDay) return "claimed"; // claimed today already, waiting on tomorrow
    return "locked";
  };

  const handleClaimDay = async (dayConfig: DailyRewardDay) => {
    if (!uid || claiming) return;
    setClaiming(true);
    const result = await claimTodayReward(db, uid, dayConfig);
    setClaiming(false);
    if (result.success) setCelebrateDay(dayConfig);
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Daily Rewards</Text>
          <Text style={s.headerSub}>
            {isCycleComplete(progress)
              ? "Cycle complete — nice streak!"
              : `Day ${progress.currentDay} of ${TOTAL_DAYS} · ${progress.streak} day streak 🔥`}
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={C.lime} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={s.grid} showsVerticalScrollIndicator={false}>
          {Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1).map((dayNum) => {
            const d = days[dayNum];
            const status = statusFor(dayNum);
            return (
              <DayCell
                key={dayNum}
                dayNum={dayNum}
                reward={d}
                status={status}
                claiming={claiming}
                onClaim={() => d && handleClaimDay(d)}
              />
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <RewardClaimedModal
        visible={!!celebrateDay}
        day={celebrateDay}
        onClose={() => setCelebrateDay(null)}
      />
    </View>
  );
}

function DayCell({
  dayNum,
  reward,
  status,
  claiming,
  onClaim,
}: {
  dayNum: number;
  reward: DailyRewardDay | undefined;
  status: DayStatus;
  claiming: boolean;
  onClaim: () => void;
}) {
  const locked = status === "locked";
  const today = status === "today";
  const claimed = status === "claimed";

  return (
    <View
      style={[
        d.cell,
        today && d.cellToday,
        locked && d.cellLocked,
      ]}
    >
      <View style={d.cellTop}>
        <Text style={[d.dayLbl, locked && { color: C.muted }]}>DAY {dayNum}</Text>
        {claimed && <Ionicons name="checkmark-circle" size={16} color={C.green} />}
        {locked && <Ionicons name="lock-closed" size={13} color={C.muted} />}
      </View>

      <Text style={[d.icon, locked && { opacity: 0.35 }]}>{reward?.icon ?? "🎁"}</Text>

      <Text style={[d.title, locked && { color: C.muted }]} numberOfLines={2}>
        {reward ? reward.title || rewardSummary(reward) : "Not set"}
      </Text>

      {today && (
        <TouchableOpacity
          style={[d.claimBtn, claiming && { opacity: 0.6 }]}
          onPress={onClaim}
          disabled={claiming || !reward}
          activeOpacity={0.85}
        >
          <Text style={d.claimBtnTxt}>{claiming ? "…" : "Claim"}</Text>
        </TouchableOpacity>
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
  grid: {
    padding: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
});

const d = StyleSheet.create({
  cell: {
    width: "31%",
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
    minHeight: 118,
    justifyContent: "space-between",
  },
  cellToday: { borderColor: C.lime, borderWidth: 1.5, backgroundColor: C.lime + "10" },
  cellLocked: { opacity: 0.55 },
  cellTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dayLbl: { fontSize: 9, fontWeight: "800", color: C.muted, letterSpacing: 0.5 },
  icon: { fontSize: 26, textAlign: "center", marginVertical: 4 },
  title: { fontSize: 10.5, fontWeight: "700", color: C.white, textAlign: "center" },
  claimBtn: {
    marginTop: 6,
    backgroundColor: C.lime,
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: "center",
  },
  claimBtnTxt: { fontSize: 11, fontWeight: "900", color: C.bg },
});
