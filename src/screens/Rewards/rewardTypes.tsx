// rewardTypes.tsx
// Shared types + helpers for the Daily Rewards feature (mobile). Mirrors
// the admin-side dailyRewardTypes.tsx model — see that file's comments
// for why each reward type maps onto an existing system instead of a new
// one (token -> users.tokens, coupon -> userCoupons, planCredit ->
// memberships).
//
// This phase (UI first, per plan) implements the full claim BOOKKEEPING
// (userRewardProgress + rewardClaims + streak) and actually grants Token
// rewards (trivial — one field increment). Coupon/planCredit granting is
// intentionally left as a TODO inside claimTodayReward — the day still
// correctly advances/locks either way, so the calendar UI is fully
// testable now; wiring up the actual coupon/membership creation is next
// phase's job.

import {
  Firestore,
  doc,
  collection,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { C } from "../ChatAndCourse/chatcoursetype";

export { C };

export const TOTAL_DAYS = 30;

export type RewardType = "token" | "coupon" | "planCredit";

export interface DailyRewardDay {
  day: number;
  rewardType: RewardType;
  title: string;
  description: string;
  icon: string;
  tokenAmount?: number;
  couponDiscountPercent?: number;
  couponApplicablePlanIds?: string[];
  couponValidDays?: number;
  planId?: string;
  planCredits?: number;
}

export function normalizeDailyRewardDay(day: number, data: any): DailyRewardDay {
  return {
    day,
    rewardType: data.rewardType ?? "token",
    title: data.title ?? "",
    description: data.description ?? "",
    icon: data.icon ?? "🎁",
    tokenAmount: typeof data.tokenAmount === "number" ? data.tokenAmount : undefined,
    couponDiscountPercent:
      typeof data.couponDiscountPercent === "number" ? data.couponDiscountPercent : undefined,
    couponApplicablePlanIds: Array.isArray(data.couponApplicablePlanIds)
      ? data.couponApplicablePlanIds
      : undefined,
    couponValidDays: typeof data.couponValidDays === "number" ? data.couponValidDays : undefined,
    planId: data.planId || undefined,
    planCredits: typeof data.planCredits === "number" ? data.planCredits : undefined,
  };
}

export function rewardSummary(d: DailyRewardDay): string {
  if (d.rewardType === "token") return `${d.tokenAmount ?? 0} Tokens`;
  if (d.rewardType === "coupon") return `${d.couponDiscountPercent ?? 0}% OFF Coupon`;
  return `${d.planCredits ?? 0} credit${(d.planCredits ?? 0) === 1 ? "" : "s"}`;
}

// ── Progress / streak ───────────────────────────────────────
export interface UserRewardProgress {
  currentDay: number; // 1..30, the next unclaimed day. > 30 = cycle complete.
  lastClaimedDate: string | null; // "YYYY-MM-DD"
  streak: number;
  totalClaimed: number;
}

export function normalizeProgress(data: any): UserRewardProgress {
  return {
    currentDay: data?.currentDay ?? 1,
    lastClaimedDate: data?.lastClaimedDate ?? null,
    streak: data?.streak ?? 0,
    totalClaimed: data?.totalClaimed ?? 0,
  };
}

export function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function yesterdayStr(): string {
  return new Date(Date.now() - 86400000).toISOString().split("T")[0];
}

export function canClaimToday(progress: UserRewardProgress): boolean {
  return progress.currentDay <= TOTAL_DAYS && progress.lastClaimedDate !== todayStr();
}

export function isCycleComplete(progress: UserRewardProgress): boolean {
  return progress.currentDay > TOTAL_DAYS;
}

// Ms remaining until local midnight — drives the "come back in Xh Ym"
// countdown once today's reward is already claimed.
export function msUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "0h 0m";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

export type ClaimResult =
  | { success: true }
  | { success: false; error: string };

// Claims day `dayConfig.day` for `uid`. A transaction so two rapid taps
// (or two devices) can't both succeed for the same day.
export async function claimTodayReward(
  db: Firestore,
  uid: string,
  dayConfig: DailyRewardDay,
): Promise<ClaimResult> {
  const progressRef = doc(db, "userRewardProgress", uid);
  const userRef = doc(db, "users", uid);

  try {
    await runTransaction(db, async (tx) => {
      // ── ALL reads first ──
      const progressSnap = await tx.get(progressRef);
      const userSnap = await tx.get(userRef);

      const progress = normalizeProgress(
        progressSnap.exists() ? progressSnap.data() : null,
      );
      const today = todayStr();

      if (progress.lastClaimedDate === today) throw new Error("ALREADY_CLAIMED");
      if (progress.currentDay > TOTAL_DAYS) throw new Error("CYCLE_COMPLETE");
      if (progress.currentDay !== dayConfig.day) throw new Error("WRONG_DAY");

      const streakBroken =
        progress.lastClaimedDate !== null && progress.lastClaimedDate !== yesterdayStr();
      const newStreak = streakBroken ? 1 : progress.streak + 1;

      // ── Then ALL writes ──
      tx.set(
        progressRef,
        {
          currentDay: progress.currentDay + 1,
          lastClaimedDate: today,
          streak: newStreak,
          totalClaimed: progress.totalClaimed + 1,
        },
        { merge: true },
      );

      const claimRef = doc(collection(db, "rewardClaims"));
      tx.set(claimRef, {
        userId: uid,
        day: dayConfig.day,
        rewardType: dayConfig.rewardType,
        claimedAt: serverTimestamp(),
        ...(dayConfig.rewardType === "token"
          ? { tokenAmount: dayConfig.tokenAmount ?? 0 }
          : {}),
        ...(dayConfig.rewardType === "planCredit"
          ? { planId: dayConfig.planId, planCredits: dayConfig.planCredits }
          : {}),
        ...(dayConfig.rewardType === "coupon"
          ? { couponDiscountPercent: dayConfig.couponDiscountPercent }
          : {}),
      });

      if (dayConfig.rewardType === "token") {
        const currentTokens = userSnap.exists() ? userSnap.data().tokens ?? 0 : 0;
        tx.update(userRef, { tokens: currentTokens + (dayConfig.tokenAmount ?? 0) });
      }

      // TODO (claim backend phase): rewardType === "coupon" -> generate a
      // unique code + write it to userCoupons/; rewardType === "planCredit"
      // -> create/top-up a memberships/ doc for dayConfig.planId (same
      // shape PlanPurchaseModal writes on a real purchase, using that
      // Plan's own validDays/category/name). Both need one more doc read
      // (the Plan, or a uniqueness check) that's cleaner to add as its
      // own step next phase rather than growing this transaction now —
      // the calendar still advances/locks correctly without them.
    });

    return { success: true };
  } catch (e: any) {
    if (e.message === "ALREADY_CLAIMED")
      return { success: false, error: "You've already claimed today's reward." };
    if (e.message === "WRONG_DAY")
      return { success: false, error: "This isn't today's reward." };
    if (e.message === "CYCLE_COMPLETE")
      return { success: false, error: "You've completed the full 30-day cycle!" };
    console.error("claimTodayReward error:", e);
    return { success: false, error: "Something went wrong. Try again." };
  }
}
