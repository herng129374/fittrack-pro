// PlanPickerScreen.tsx
// Lets the user browse purchasable Plans (grouped/filterable by category)
// and see which categories they already have active credits for. Tapping
// a plan opens PlanPurchaseModal to start the PayPal purchase flow.
//
// Reached two ways:
//   1. Directly (e.g. from a Profile/Membership entry point) — no preset
//      category, shows everything.
//   2. Via ChatAndCoursesScreen's "you need a plan" prompt, which passes
//      route.params.presetCategory — this screen pre-filters to that
//      category so the user lands exactly where they need to be.
//
// Also shows an auto-sliding promo "billboard" (PromoBanner) above the
// category chips, advertising Admin-managed Promotions — bundle combos
// (e.g. Yoga + Strength at a combined discount) or promo codes (redeemed
// later in PlanPurchaseModal). Tapping a slide opens PromoDetailModal.

import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { getAuth, User } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";

import { PlanPurchaseModal } from "./PlanPurchaseModal";
import { PromoBanner } from "./PromoBanner";
import { PromoDetailModal } from "./PromoDetailModal";
import {
  C,
  CATEGORIES,
  Plan,
  Promotion,
  UserMembership,
  normalizePlan,
  normalizePromotion,
  isPromotionRedeemable,
  isMembershipUsable,
  daysRemaining,
} from "./Plantypes";

export default function PlanPickerScreen() {
  const auth = getAuth();
  const db = getFirestore();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const presetCategory: string | undefined = route?.params?.presetCategory;

  const [me, setMe] = useState<User | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [memberships, setMemberships] = useState<UserMembership[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(
    presetCategory || "All",
  );

  // Single-plan purchase
  const [purchaseTarget, setPurchaseTarget] = useState<Plan | null>(null);
  const [purchaseVisible, setPurchaseVisible] = useState(false);

  // Bundle purchase (from a promo banner) — when set, PlanPurchaseModal
  // creates one membership per plan in bundleTarget instead of a single one.
  const [bundleTarget, setBundleTarget] = useState<Plan[] | null>(null);
  const [bundlePromo, setBundlePromo] = useState<Promotion | null>(null);

  // Promo detail sheet
  const [selectedPromo, setSelectedPromo] = useState<Promotion | null>(null);
  const [promoDetailVisible, setPromoDetailVisible] = useState(false);

  useEffect(() => {
    setMe(auth.currentUser);
    return auth.onAuthStateChanged((u) => setMe(u));
  }, []);

  // Live plan catalogue (Admin-managed).
  useEffect(() => {
    const q = query(collection(db, "plans"), where("status", "==", "active"));
    return onSnapshot(
      q,
      (snap) => {
        setPlans(snap.docs.map((d) => normalizePlan(d.id, d.data())));
        setLoading(false);
      },
      (err) => {
        console.error("Plans snapshot error:", err);
        setLoading(false);
      },
    );
  }, []);

  // Live promo billboard (Admin-managed) — bundles + promo codes.
  useEffect(() => {
    const q = query(
      collection(db, "promotions"),
      where("status", "==", "active"),
    );
    return onSnapshot(
      q,
      (snap) => {
        setPromotions(
          snap.docs
            .map((d) => normalizePromotion(d.id, d.data()))
            .filter(isPromotionRedeemable),
        );
      },
      (err) => console.error("Promotions snapshot error:", err),
    );
  }, []);

  // The current user's memberships — used to show "You have 6 credits
  // left" on cards for categories they already hold an active plan for.
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

  const membershipForCategory = (category: string) =>
    memberships.find((m) => m.category === category && isMembershipUsable(m));

  const filteredPlans = useMemo(() => {
    if (selectedCategory === "All") return plans;
    return plans.filter((p) => p.category === selectedCategory);
  }, [plans, selectedCategory]);

  // Only show category filter chips for categories that actually have a
  // plan — no point offering a filter that always returns empty.
  const availableCategories = useMemo(() => {
    const set = new Set(plans.map((p) => p.category));
    return CATEGORIES.filter((c) => set.has(c.label));
  }, [plans]);

  const openPromo = (promo: Promotion) => {
    setSelectedPromo(promo);
    setPromoDetailVisible(true);
  };

  const startBundlePurchase = (promo: Promotion, bundlePlans: Plan[]) => {
    if (bundlePlans.length === 0) return;
    // Synthetic combo "plan" — purely for the header/summary card in
    // PlanPurchaseModal; the real per-category memberships come from
    // bundlePlans on confirm.
    const comboPlan: Plan = {
      id: `bundle:${promo.id}`,
      name: promo.title,
      category: bundlePlans.map((p) => p.category).join(" + "),
      emoji: "🎁",
      imageUrl: promo.bannerImageUrl,
      credits: bundlePlans.reduce((s, p) => s + p.credits, 0),
      price: promo.title,
      validDays: Math.max(...bundlePlans.map((p) => p.validDays)),
      status: "active",
    };
    setBundleTarget(bundlePlans);
    setBundlePromo(promo);
    setPurchaseTarget(comboPlan);
    setPromoDetailVisible(false);
    setPurchaseVisible(true);
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Membership Plans</Text>
          <Text style={s.headerSub}>
            {presetCategory
              ? `Buy a ${presetCategory} plan to unlock booking`
              : "Buy credits to book classes in that category"}
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.list}
      >
        {/* Promo billboard — auto-slides through active bundle/promo-code
            offers. Hidden entirely when Admin has none active. */}
        <PromoBanner promotions={promotions} onSelect={openPromo} />

        {/* Category filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.categoryRow}
        >
          {[{ emoji: "🗂️", label: "All" }, ...availableCategories].map(
            (cat) => {
              const isSel = selectedCategory === cat.label;
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
                </TouchableOpacity>
              );
            },
          )}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={C.lime} style={{ margin: 40 }} />
        ) : filteredPlans.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="card-outline" size={28} color={C.muted} />
            <Text style={s.emptyTxt}>No plans available</Text>
            <Text style={s.emptySub}>Check back soon</Text>
          </View>
        ) : (
          filteredPlans.map((plan) => {
            const owned = membershipForCategory(plan.category);
            return (
              <View key={plan.id} style={s.card}>
                {plan.imageUrl ? (
                  <Image source={{ uri: plan.imageUrl }} style={s.cardImage} />
                ) : null}
                <View style={s.cardTop}>
                  {!plan.imageUrl && (
                    <Text style={s.cardEmoji}>{plan.emoji}</Text>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardName}>{plan.name}</Text>
                    <View style={s.cardCategoryPill}>
                      <Text style={s.cardCategoryTxt}>{plan.category}</Text>
                    </View>
                  </View>
                </View>

                <View style={s.cardStatsRow}>
                  <View style={s.statBox}>
                    <Text style={s.statVal}>{plan.credits}</Text>
                    <Text style={s.statLbl}>SESSIONS</Text>
                  </View>
                  <View style={s.statBox}>
                    <Text style={s.statVal}>{plan.validDays}d</Text>
                    <Text style={s.statLbl}>VALID FOR</Text>
                  </View>
                  <View style={s.statBox}>
                    <Text style={[s.statVal, { color: C.lime }]}>
                      {plan.price}
                    </Text>
                    <Text style={s.statLbl}>PRICE</Text>
                  </View>
                </View>

                {owned ? (
                  <View style={s.ownedBox}>
                    <Ionicons
                      name="checkmark-circle"
                      size={15}
                      color={C.green}
                    />
                    <Text style={s.ownedTxt}>
                      You have {owned.remainingCredits} credit
                      {owned.remainingCredits === 1 ? "" : "s"} left ·{" "}
                      {daysRemaining(owned)}d remaining
                    </Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={s.buyBtn}
                  onPress={() => {
                    setBundleTarget(null);
                    setBundlePromo(null);
                    setPurchaseTarget(plan);
                    setPurchaseVisible(true);
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="cart-outline" size={16} color={C.bg} />
                  <Text style={s.buyBtnTxt}>
                    {owned ? "Buy again / Top up" : "Purchase"}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
        <View style={{ height: 60 }} />
      </ScrollView>

      <PromoDetailModal
        promo={selectedPromo}
        plans={plans}
        visible={promoDetailVisible}
        onClose={() => setPromoDetailVisible(false)}
        onBuyBundle={startBundlePurchase}
      />

      <PlanPurchaseModal
        plan={purchaseTarget}
        visible={purchaseVisible}
        me={me}
        bundlePlans={bundleTarget ?? undefined}
        bundlePromotion={bundlePromo ?? undefined}
        onClose={() => setPurchaseVisible(false)}
        onPurchased={() => {
          setPurchaseVisible(false);
          setBundleTarget(null);
          setBundlePromo(null);
          // Bounce back automatically if we arrived here specifically to
          // unlock a category for booking — the user's next natural step
          // is to go book the course they came from.
          if (presetCategory) navigation.goBack();
        }}
      />
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
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: C.white,
    letterSpacing: -0.4,
  },
  headerSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  categoryRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
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
  list: { paddingBottom: 4, gap: 12 },
  emptyBox: {
    alignItems: "center",
    padding: 30,
    marginTop: 20,
    marginHorizontal: 16,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  emptyTxt: { fontSize: 14, fontWeight: "700", color: C.white },
  emptySub: { fontSize: 12, color: C.muted },
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 16,
    marginHorizontal: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    overflow: "hidden",
  },
  cardImage: {
    // Full-bleed to the card's edges: card has 16px padding + overflow
    // hidden + borderRadius, so pulling the image out with negative
    // margins lets the rounded corners still clip it correctly.
    height: 120,
    marginTop: -16,
    marginLeft: -16,
    marginRight: -16,
    marginBottom: 12,
    alignSelf: "stretch",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  cardEmoji: { fontSize: 34 },
  cardName: { fontSize: 16, fontWeight: "800", color: C.white },
  cardCategoryPill: {
    alignSelf: "flex-start",
    backgroundColor: C.card2,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  cardCategoryTxt: { fontSize: 10, fontWeight: "700", color: C.lime },
  cardStatsRow: {
    flexDirection: "row",
    backgroundColor: C.card2,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  statBox: { flex: 1, alignItems: "center" },
  statVal: { fontSize: 15, fontWeight: "900", color: C.white },
  statLbl: {
    fontSize: 9,
    color: C.muted,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  ownedBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.green + "18",
    borderWidth: 1,
    borderColor: C.green + "40",
    borderRadius: 10,
    padding: 9,
    marginBottom: 12,
  },
  ownedTxt: { flex: 1, fontSize: 11, color: C.green, fontWeight: "600" },
  buyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.lime,
    borderRadius: 14,
    padding: 13,
  },
  buyBtnTxt: { fontSize: 14, fontWeight: "900", color: C.bg },
});
