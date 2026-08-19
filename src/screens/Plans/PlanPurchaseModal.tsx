// PlanPurchaseModal.tsx
// Purchase flow for a Membership Plan: create a PayPal Sandbox order, send
// the user to approve it, then finalize by writing an Order record (shared
// "orders" collection, type: "plan") and a new UserMembership on confirm.
//
// Reuses the exact same PayPal service used elsewhere in the app —
// nothing new needed there.
//
// Two purchase modes, distinguished by whether `bundlePlans` is passed:
//   • Single plan  — normal flow. User may optionally type a promo code
//                    (a Promotion of type "promocode") for % off.
//   • Bundle       — reached from PromoDetailModal's "Buy this bundle".
//                    `plan` is a synthetic combo Plan for display only;
//                    `bundlePlans` holds the real Plans included, and on
//                    confirm we create one UserMembership per plan (each
//                    keeping its own category/credits), all linked to the
//                    same order. The discount is already baked into the
//                    price, so the manual promo-code field is hidden.

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  StatusBar,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { User } from "firebase/auth";
import {
  getFirestore,
  doc,
  addDoc,
  collection,
  updateDoc,
  serverTimestamp,
  Timestamp,
  query,
  where,
  getDocs,
  increment,
} from "firebase/firestore";
import {
  createPaypalOrder,
  capturePaypalOrder,
  getPaypalApproveUrl,
} from "../paypalservice";
import {
  C,
  Plan,
  Promotion,
  parsePriceToAmount,
  applyDiscount,
  normalizePromotion,
} from "./Plantypes";

type Step = "pay" | "confirm";

export function PlanPurchaseModal({
  plan,
  visible,
  me,
  bundlePlans,
  bundlePromotion,
  onClose,
  onPurchased,
}: {
  plan: Plan | null;
  visible: boolean;
  me: User | null;
  bundlePlans?: Plan[];
  bundlePromotion?: Promotion;
  onClose: () => void;
  onPurchased: () => void;
}) {
  const db = getFirestore();
  const isBundle = !!bundlePlans && bundlePlans.length > 0;

  const [step, setStep] = useState<Step>("pay");
  const [orderRecordId, setOrderRecordId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // ── Promo code (single-plan purchases only) ──
  const [promoInput, setPromoInput] = useState("");
  const [applyingPromo, setApplyingPromo] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [appliedPromo, setAppliedPromo] = useState<Promotion | null>(null);

  useEffect(() => {
    if (!visible) return;
    setStep("pay");
    setOrderRecordId(null);
    setOrderId(null);
    setPromoInput("");
    setPromoError(null);
    setAppliedPromo(null);
  }, [visible, plan?.id]);

  // Base (pre-discount) total: sum of bundle plan prices, or the single
  // plan's price.
  const baseAmount = isBundle
    ? bundlePlans!.reduce((sum, p) => sum + parsePriceToAmount(p.price), 0)
    : parsePriceToAmount(plan?.price ?? "");

  const activePromo = isBundle ? bundlePromotion : appliedPromo;
  const finalAmount = activePromo
    ? applyDiscount(baseAmount, activePromo.discountPercent)
    : baseAmount;
  const hasDiscount = !!activePromo && finalAmount < baseAmount;

  // Checks everything that requires live Firestore context (a Promotion's
  // own status/expiry/global cap is checked upfront by
  // isPromotionRedeemable when the list loads — this additionally checks
  // per-plan scope and per-user redemption history, which need `planId`
  // and `me`). Returns a user-facing error string, or null if OK to use.
  const validatePromo = async (
    promo: Promotion,
    planId: string | null,
  ): Promise<string | null> => {
    if (promo.status !== "active") return "This code is no longer active.";
    if (promo.expiresAt) {
      const exp = promo.expiresAt.toDate
        ? promo.expiresAt.toDate()
        : new Date(promo.expiresAt);
      if (exp.getTime() < Date.now()) return "This code has expired.";
    }
    if (
      promo.maxRedemptions != null &&
      (promo.redeemedCount ?? 0) >= promo.maxRedemptions
    ) {
      return "This code has reached its usage limit.";
    }
    if (
      planId &&
      promo.applicablePlanIds &&
      promo.applicablePlanIds.length > 0 &&
      !promo.applicablePlanIds.includes(planId)
    ) {
      return "This code isn't valid for this plan.";
    }
    if (promo.perUserLimit != null && me) {
      const q = query(
        collection(db, "orders"),
        where("userId", "==", me.uid),
        where("promotionId", "==", promo.id),
        where("status", "==", "paid"),
      );
      const snap = await getDocs(q);
      if (snap.size >= promo.perUserLimit) {
        return "You've already used this code the maximum number of times.";
      }
    }
    return null;
  };

  const handleApplyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setApplyingPromo(true);
    setPromoError(null);
    try {
      const q = query(
        collection(db, "promotions"),
        where("type", "==", "promocode"),
        where("code", "==", code),
        where("status", "==", "active"),
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setPromoError("That code isn't valid or has expired.");
        setAppliedPromo(null);
        return;
      }
      const promo = normalizePromotion(snap.docs[0].id, snap.docs[0].data());
      const err = await validatePromo(promo, plan?.id ?? null);
      if (err) {
        setPromoError(err);
        setAppliedPromo(null);
        return;
      }
      setAppliedPromo(promo);
    } catch (e: any) {
      setPromoError("Couldn't check that code. Try again.");
    } finally {
      setApplyingPromo(false);
    }
  };

  const clearPromo = () => {
    setAppliedPromo(null);
    setPromoInput("");
    setPromoError(null);
  };

  const handlePay = async () => {
    if (!plan || !me) return;
    if (finalAmount <= 0) {
      Alert.alert(
        "Invalid price",
        "This plan doesn't have a valid price set. Contact support.",
      );
      return;
    }
    if (activePromo) {
      const err = await validatePromo(activePromo, isBundle ? null : plan.id);
      if (err) {
        Alert.alert("Promo code", err);
        if (!isBundle) clearPromo();
        return;
      }
    }
    setPaying(true);
    try {
      // Order record first (pending) — this is the audit trail even if the
      // user abandons checkout in PayPal.
      const orderRef = await addDoc(collection(db, "orders"), {
        type: "plan",
        userId: me.uid,
        planId: isBundle
          ? `bundle:${bundlePromotion?.id ?? "manual"}`
          : plan.id,
        planName: plan.name,
        category: isBundle ? "Bundle" : plan.category,
        amount: finalAmount,
        ...(hasDiscount
          ? {
              originalAmount: baseAmount,
              promotionId: activePromo!.id,
              discountPercent: activePromo!.discountPercent,
              ...(activePromo!.code ? { promoCode: activePromo!.code } : {}),
            }
          : {}),
        status: "pending_payment",
        createdAt: serverTimestamp(),
      });

      const newPaypalOrderId = await createPaypalOrder(finalAmount, me.uid);
      await updateDoc(doc(db, "orders", orderRef.id), {
        paypalOrderId: newPaypalOrderId,
      });

      setOrderRecordId(orderRef.id);
      setOrderId(newPaypalOrderId);
      setStep("confirm");
      await Linking.openURL(getPaypalApproveUrl(newPaypalOrderId));
    } catch (e: any) {
      Alert.alert("Payment error", e.message ?? "Could not start payment.");
    } finally {
      setPaying(false);
    }
  };

  const handleConfirm = async () => {
    if (!plan || !me || !orderId || !orderRecordId) return;
    setConfirming(true);
    try {
      const result = await capturePaypalOrder(orderId);
      if (!result.success) {
        Alert.alert(
          "Payment not completed",
          "We couldn't confirm your payment yet. Finish the PayPal checkout, then try Confirm again.",
        );
        return;
      }

      const now = Date.now();

      // Create the membership(s) and mark the order paid. Not wrapped in a
      // Firestore transaction because there's no contended resource here
      // (unlike course-slot capacity) — worst case of a partial failure is
      // an order stuck at pending_payment, which is safe to retry/support.
      const plansToGrant = isBundle ? bundlePlans! : [plan];
      for (const p of plansToGrant) {
        const validUntil = Timestamp.fromMillis(
          now + p.validDays * 24 * 60 * 60 * 1000,
        );
        await addDoc(collection(db, "memberships"), {
          userId: me.uid,
          planId: p.id,
          planName: p.name,
          category: p.category,
          totalCredits: p.credits,
          remainingCredits: p.credits,
          validFrom: Timestamp.fromMillis(now),
          validUntil,
          status: "active",
          orderId: orderRecordId,
        });
      }

      await updateDoc(doc(db, "orders", orderRecordId), {
        status: "paid",
        paidAt: serverTimestamp(),
      });

      // Bump the usage counter now that the redemption is real — done here
      // (not at "Apply") so someone who applies a code but abandons
      // checkout never burns a use.
      if (activePromo) {
        await updateDoc(doc(db, "promotions", activePromo.id), {
          redeemedCount: increment(1),
        });
      }

      Alert.alert(
        "🎉 Purchased!",
        isBundle
          ? `${plan.name} is active — ${plansToGrant
              .map((p) => `${p.credits} ${p.category}`)
              .join(" + ")} sessions to use.`
          : `${plan.name} is active — you have ${plan.credits} sessions to use.`,
      );
      onPurchased();
    } catch (e: any) {
      Alert.alert(
        "Confirmation error",
        e.message ?? "Could not finalize purchase. You can try Confirm again.",
      );
    } finally {
      setConfirming(false);
    }
  };

  if (!plan) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={pm.root}>
        <StatusBar barStyle="light-content" />
        <View style={pm.hdr}>
          <TouchableOpacity style={pm.backBtn} onPress={onClose}>
            <Ionicons name="chevron-back" size={22} color={C.white} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={pm.hdrTitle}>
              {isBundle ? "Purchase Bundle" : "Purchase Plan"}
            </Text>
            <Text style={pm.hdrSub}>
              {plan.emoji} {plan.name}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={pm.body}
          showsVerticalScrollIndicator={false}
        >
          <View style={pm.summaryCard}>
            <Text style={pm.summaryEmoji}>{plan.emoji}</Text>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={pm.summaryTitle}>{plan.name}</Text>
              {isBundle ? (
                bundlePlans!.map((p) => (
                  <View key={p.id} style={pm.summaryRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={13}
                      color={C.lime}
                    />
                    <Text style={pm.summaryInfo}>
                      {p.category} · {p.credits} sessions
                    </Text>
                  </View>
                ))
              ) : (
                <>
                  <View style={pm.summaryRow}>
                    <Ionicons
                      name="pricetag-outline"
                      size={13}
                      color={C.muted}
                    />
                    <Text style={pm.summaryInfo}>{plan.category} only</Text>
                  </View>
                  <View style={pm.summaryRow}>
                    <Ionicons name="repeat-outline" size={13} color={C.muted} />
                    <Text style={pm.summaryInfo}>
                      {plan.credits} sessions · valid {plan.validDays} days
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* Promo code entry — single-plan purchases only. Bundle
              purchases already have their discount baked in from the
              banner promotion. */}
          {!isBundle && (
            <View style={pm.promoBox}>
              {appliedPromo ? (
                <View style={pm.promoApplied}>
                  <Ionicons name="pricetag" size={15} color={C.green} />
                  <Text style={pm.promoAppliedTxt}>
                    "{appliedPromo.code}" applied ·{" "}
                    {appliedPromo.discountPercent}% off
                  </Text>
                  <TouchableOpacity onPress={clearPromo}>
                    <Ionicons name="close-circle" size={17} color={C.muted} />
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={pm.promoLbl}>Have a promo code?</Text>
                  <View style={pm.promoRow}>
                    <TextInput
                      value={promoInput}
                      onChangeText={(t) => {
                        setPromoInput(t);
                        setPromoError(null);
                      }}
                      placeholder="Enter code"
                      placeholderTextColor={C.muted}
                      autoCapitalize="characters"
                      style={pm.promoInput}
                    />
                    <TouchableOpacity
                      style={[
                        pm.promoApplyBtn,
                        (!promoInput.trim() || applyingPromo) && {
                          opacity: 0.5,
                        },
                      ]}
                      onPress={handleApplyPromo}
                      disabled={!promoInput.trim() || applyingPromo}
                    >
                      {applyingPromo ? (
                        <ActivityIndicator color={C.bg} size="small" />
                      ) : (
                        <Text style={pm.promoApplyTxt}>Apply</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  {promoError && (
                    <Text style={pm.promoErrTxt}>{promoError}</Text>
                  )}
                </>
              )}
            </View>
          )}

          <View style={pm.priceRow}>
            <View>
              <Text style={pm.priceLbl}>TOTAL</Text>
              {hasDiscount && (
                <Text style={pm.priceStrike}>RM {baseAmount.toFixed(0)}</Text>
              )}
            </View>
            <Text style={pm.price}>
              {finalAmount > 0
                ? `RM ${finalAmount.toFixed(0)}`
                : "Price unavailable"}
            </Text>
          </View>

          {step === "pay" ? (
            <>
              <Text style={pm.stepHint}>
                You'll be sent to PayPal Sandbox to approve the payment, then
                brought back here to confirm.
              </Text>
              <TouchableOpacity
                style={[pm.payBtn, paying && { opacity: 0.6 }]}
                onPress={handlePay}
                disabled={paying}
                activeOpacity={0.85}
              >
                {paying ? (
                  <ActivityIndicator color={C.bg} />
                ) : (
                  <>
                    <Ionicons name="logo-paypal" size={18} color={C.bg} />
                    <Text style={pm.payBtnTxt}>Pay with PayPal Sandbox</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={pm.pendingBox}>
                <Ionicons
                  name="information-circle-outline"
                  size={16}
                  color={C.blue}
                />
                <Text style={pm.pendingTxt}>
                  Complete the checkout in the browser/PayPal app that just
                  opened, then come back and tap Confirm below.
                </Text>
              </View>
              <TouchableOpacity
                style={[pm.confirmBtn, confirming && { opacity: 0.6 }]}
                onPress={handleConfirm}
                disabled={confirming}
                activeOpacity={0.85}
              >
                {confirming ? (
                  <ActivityIndicator color={C.bg} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color={C.bg} />
                    <Text style={pm.confirmBtnTxt}>Confirm Payment</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={pm.retryLink}
                onPress={() =>
                  orderId && Linking.openURL(getPaypalApproveUrl(orderId))
                }
              >
                <Text style={pm.retryLinkTxt}>Reopen PayPal checkout</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const pm = StyleSheet.create({
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
  body: { padding: 20, paddingBottom: 40, gap: 16 },
  summaryCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  summaryEmoji: { fontSize: 36 },
  summaryTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: C.white,
    marginBottom: 4,
  },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  summaryInfo: { fontSize: 12, color: C.muted },
  promoBox: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    gap: 8,
  },
  promoLbl: { fontSize: 12, fontWeight: "700", color: C.white },
  promoRow: { flexDirection: "row", gap: 8 },
  promoInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    color: C.white,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    backgroundColor: C.card2,
  },
  promoApplyBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: C.lime,
    justifyContent: "center",
    alignItems: "center",
  },
  promoApplyTxt: { fontSize: 12, fontWeight: "900", color: C.bg },
  promoErrTxt: { fontSize: 11, color: "#ff6b6b" },
  promoApplied: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  promoAppliedTxt: { flex: 1, fontSize: 12, fontWeight: "700", color: C.green },
  priceRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    backgroundColor: C.card2,
    borderRadius: 12,
    padding: 14,
  },
  priceLbl: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    color: C.muted,
  },
  priceStrike: {
    fontSize: 12,
    color: C.muted,
    textDecorationLine: "line-through",
    marginTop: 2,
  },
  price: { fontSize: 22, fontWeight: "900", color: C.lime, marginTop: 2 },
  stepHint: { fontSize: 12, color: C.muted, lineHeight: 18 },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ffc439",
    borderRadius: 16,
    padding: 16,
  },
  payBtnTxt: { fontSize: 15, fontWeight: "900", color: "#003087" },
  pendingBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: C.blue + "15",
    borderRadius: 12,
    padding: 12,
  },
  pendingTxt: { flex: 1, fontSize: 12, color: C.white, lineHeight: 17 },
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
  retryLink: { alignItems: "center", padding: 8 },
  retryLinkTxt: { fontSize: 12, color: C.blue, fontWeight: "600" },
});
