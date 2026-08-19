// planTypes.ts
// Shared types + helpers for the Membership Plan purchase flow (mobile).
//
// Reuses C (palette), CATEGORIES, and parsePriceToAmount from
// ChatAndCourse/chatcoursetype — those are already the source of truth
// for course categories, and a Plan's `category` must always match one
// of them 1:1.
//
// UserMembership / isMembershipUsable / daysRemaining / findUsableMembership
// are also re-exported from ChatAndCourse/chatcoursetype rather than
// redefined here — Booking (in ChatAndCourse) needs those same helpers to
// decide whether a user can book a course, so chatcoursetype.tsx is the
// single source of truth for them. Defining them twice risked the two
// copies drifting apart.

import {
  C,
  CATEGORIES,
  CourseCategory,
  parsePriceToAmount,
  UserMembership,
  MembershipStatus,
  isMembershipUsable,
  daysRemaining,
  findUsableMembership,
} from "../ChatAndCourse/chatcoursetype";

export { C, CATEGORIES, parsePriceToAmount };
export { isMembershipUsable, daysRemaining, findUsableMembership };
export type { CourseCategory, UserMembership, MembershipStatus };

// ── Plan (defined by Admin, read-only on the mobile side) ─────
export interface Plan {
  id: string;
  name: string;
  category: string; // one of CATEGORIES[].label
  emoji: string;
  imageUrl?: string; // optional hero image for the plan card; falls back to emoji
  credits: number;
  price: string; // display string e.g. "RM 150"
  validDays: number;
  status: "active" | "archived";
}

export function normalizePlan(id: string, data: any): Plan {
  return {
    id,
    name: data.name ?? "",
    category: data.category ?? "",
    emoji: data.emoji ?? "🏋️",
    imageUrl: data.imageUrl || undefined,
    credits: data.credits ?? 0,
    price: data.price ?? "",
    validDays: data.validDays ?? 90,
    status: data.status ?? "active",
  };
}

// ── Order (payment record — shared "orders" collection with Marketplace,
// distinguished by `type: "plan"`) ─────────────────────────────
export type OrderStatus = "pending_payment" | "paid" | "refunded" | "failed";

export interface PlanOrder {
  id: string;
  type: "plan"; // distinguishes from Marketplace product orders in the same collection
  userId: string;
  planId: string;
  planName: string;
  category: string;
  amount: number;
  // Populated when a promotion (promo code or bundle) was applied at checkout.
  originalAmount?: number;
  promotionId?: string;
  promoCode?: string;
  discountPercent?: number;
  paypalOrderId?: string;
  status: OrderStatus;
  createdAt: any;
  paidAt?: any;
}

// ── Promotion (Admin-managed marketing banner / discount) ─────
// Two flavours, both surfaced in the auto-sliding banner on
// PlanPickerScreen:
//
//   "bundle"    — buy several category plans together at a combined
//                 discount (e.g. Yoga + Strength for 20% off). The
//                 banner's detail sheet lets the user check out the
//                 whole bundle in one purchase.
//   "promocode" — a redeemable code the user types into
//                 PlanPurchaseModal at checkout to get % off any single
//                 plan. The banner just advertises/explains it.
export type PromotionType = "bundle" | "promocode";

export interface Promotion {
  id: string;
  type: PromotionType;
  title: string; // e.g. "Yoga + Strength Combo"
  description: string; // shown in the detail sheet
  bannerImageUrl: string; // carousel image
  discountPercent: number; // 0–100
  // type === "bundle"
  bundlePlanIds?: string[]; // Plan.id[] included in the combo
  // type === "promocode"
  code?: string; // uppercase redemption code, e.g. "SUMMER20"
  applicablePlanIds?: string[]; // scope: empty/undefined = valid on ANY plan; else restricted to these Plan.id[]
  maxRedemptions?: number; // total uses allowed across all users; undefined = unlimited
  redeemedCount?: number; // running total, server-incremented on each successful purchase
  perUserLimit?: number; // max uses per single user; undefined = unlimited
  expiresAt?: any; // Firestore Timestamp; undefined = never expires
  status: "active" | "archived";
}

export function normalizePromotion(id: string, data: any): Promotion {
  return {
    id,
    type: data.type === "bundle" ? "bundle" : "promocode",
    title: data.title ?? "",
    description: data.description ?? "",
    bannerImageUrl: data.bannerImageUrl ?? "",
    discountPercent: Number(data.discountPercent) || 0,
    bundlePlanIds: Array.isArray(data.bundlePlanIds)
      ? data.bundlePlanIds
      : undefined,
    code: data.code ? String(data.code).toUpperCase() : undefined,
    applicablePlanIds: Array.isArray(data.applicablePlanIds)
      ? data.applicablePlanIds
      : undefined,
    maxRedemptions:
      typeof data.maxRedemptions === "number" ? data.maxRedemptions : undefined,
    redeemedCount: Number(data.redeemedCount) || 0,
    perUserLimit:
      typeof data.perUserLimit === "number" ? data.perUserLimit : undefined,
    expiresAt: data.expiresAt ?? undefined,
    status: data.status ?? "active",
  };
}

// True if a Promotion is still redeemable right now, independent of who's
// trying to use it — checks status + expiry + the global usage cap. Per-
// user limit and per-plan scope need a Firestore round-trip (userId/planId
// context), so those stay in PlanPurchaseModal's validatePromo.
export function isPromotionRedeemable(promo: Promotion): boolean {
  if (promo.status !== "active") return false;
  if (promo.expiresAt) {
    const exp = promo.expiresAt.toDate
      ? promo.expiresAt.toDate()
      : new Date(promo.expiresAt);
    if (exp.getTime() < Date.now()) return false;
  }
  if (
    promo.maxRedemptions != null &&
    (promo.redeemedCount ?? 0) >= promo.maxRedemptions
  ) {
    return false;
  }
  return true;
}

// Applies a percentage discount to a ringgit amount, rounded to 2dp.
export function applyDiscount(amount: number, discountPercent: number): number {
  const pct = Math.min(Math.max(discountPercent, 0), 100);
  return Math.round(amount * (1 - pct / 100) * 100) / 100;
}
