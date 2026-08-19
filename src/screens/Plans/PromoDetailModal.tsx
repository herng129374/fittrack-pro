// PromoDetailModal.tsx
// Opens when a user taps a slide in PromoBanner. Two flavours:
//
//   bundle    — lists every Plan included in the combo with the
//               discounted combined price, and a "Buy this bundle"
//               button that hands off to PlanPurchaseModal via
//               onBuyBundle (PlanPickerScreen builds the synthetic
//               combo Plan + membership list from this).
//   promocode — shows the code big or copyable, and explains it's
//               entered at checkout in PlanPurchaseModal.

import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import {
  C,
  Plan,
  Promotion,
  applyDiscount,
  parsePriceToAmount,
} from "./Plantypes";

export function PromoDetailModal({
  promo,
  plans,
  visible,
  onClose,
  onBuyBundle,
}: {
  promo: Promotion | null;
  plans: Plan[]; // full catalogue, used to resolve bundlePlanIds -> Plan objects
  visible: boolean;
  onClose: () => void;
  onBuyBundle: (promo: Promotion, bundlePlans: Plan[]) => void;
}) {
  if (!promo) return null;

  const bundlePlans =
    promo.type === "bundle"
      ? plans.filter((p) => promo.bundlePlanIds?.includes(p.id))
      : [];
  const originalTotal = bundlePlans.reduce(
    (sum, p) => sum + parsePriceToAmount(p.price),
    0,
  );
  const discountedTotal = applyDiscount(originalTotal, promo.discountPercent);

  const copyCode = async () => {
    if (!promo.code) return;
    await Clipboard.setStringAsync(promo.code);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={d.backdrop}>
        <View style={d.sheet}>
          <View style={d.grabber} />
          {promo.bannerImageUrl ? (
            <Image source={{ uri: promo.bannerImageUrl }} style={d.hero} />
          ) : null}

          <ScrollView
            contentContainerStyle={d.body}
            showsVerticalScrollIndicator={false}
          >
            <View style={d.kindPill}>
              <Ionicons
                name={promo.type === "bundle" ? "gift" : "pricetag"}
                size={12}
                color={C.bg}
              />
              <Text style={d.kindTxt}>
                {promo.type === "bundle" ? "Bundle deal" : "Promo code"}
              </Text>
            </View>
            <Text style={d.title}>{promo.title}</Text>
            {promo.description ? (
              <Text style={d.desc}>{promo.description}</Text>
            ) : null}

            {promo.type === "bundle" ? (
              <>
                <View style={d.planList}>
                  {bundlePlans.map((p) => (
                    <View key={p.id} style={d.planRow}>
                      <Text style={d.planEmoji}>{p.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={d.planName}>{p.name}</Text>
                        <Text style={d.planSub}>
                          {p.credits} sessions · {p.category}
                        </Text>
                      </View>
                      <Text style={d.planPrice}>{p.price}</Text>
                    </View>
                  ))}
                  {bundlePlans.length === 0 && (
                    <Text style={d.planSub}>
                      This bundle's plans are no longer available.
                    </Text>
                  )}
                </View>

                {bundlePlans.length > 0 && (
                  <View style={d.priceRow}>
                    <View>
                      <Text style={d.priceLbl}>BUNDLE PRICE</Text>
                      <Text style={d.strike}>
                        RM {originalTotal.toFixed(0)}
                      </Text>
                    </View>
                    <Text style={d.priceVal}>
                      RM {discountedTotal.toFixed(0)}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    d.mainBtn,
                    bundlePlans.length === 0 && { opacity: 0.5 },
                  ]}
                  disabled={bundlePlans.length === 0}
                  onPress={() => onBuyBundle(promo, bundlePlans)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="cart-outline" size={16} color={C.bg} />
                  <Text style={d.mainBtnTxt}>Buy this bundle</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={d.codeBox}>
                  <Text style={d.code}>{promo.code}</Text>
                  <TouchableOpacity onPress={copyCode} style={d.copyBtn}>
                    <Ionicons name="copy-outline" size={15} color={C.bg} />
                    <Text style={d.copyBtnTxt}>Copy</Text>
                  </TouchableOpacity>
                </View>
                <Text style={d.desc}>
                  Enter this code at checkout on any plan to get{" "}
                  {promo.discountPercent}% off.
                </Text>
              </>
            )}
          </ScrollView>

          <TouchableOpacity style={d.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={C.muted} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const d = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    borderWidth: 1,
    borderColor: C.border,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: "center",
    marginTop: 10,
  },
  hero: { width: "100%", height: 150, marginTop: 12 },
  body: { padding: 20, paddingTop: 16, gap: 10 },
  kindPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: C.lime,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  kindTxt: { fontSize: 10, fontWeight: "800", color: C.bg },
  title: { fontSize: 19, fontWeight: "900", color: C.white },
  desc: { fontSize: 13, color: C.muted, lineHeight: 19 },
  planList: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    gap: 10,
    marginTop: 4,
  },
  planRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  planEmoji: { fontSize: 22 },
  planName: { fontSize: 13, fontWeight: "700", color: C.white },
  planSub: { fontSize: 11, color: C.muted, marginTop: 1 },
  planPrice: { fontSize: 12, fontWeight: "800", color: C.muted },
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
    letterSpacing: 1.5,
    color: C.muted,
  },
  strike: {
    fontSize: 13,
    color: C.muted,
    textDecorationLine: "line-through",
    marginTop: 2,
  },
  priceVal: { fontSize: 24, fontWeight: "900", color: C.lime },
  mainBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.lime,
    borderRadius: 14,
    padding: 14,
    marginTop: 4,
  },
  mainBtnTxt: { fontSize: 14, fontWeight: "900", color: C.bg },
  codeBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.lime,
    borderStyle: "dashed",
    borderRadius: 14,
    padding: 14,
  },
  code: { fontSize: 20, fontWeight: "900", letterSpacing: 2, color: C.white },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.lime,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  copyBtnTxt: { fontSize: 12, fontWeight: "800", color: C.bg },
  closeBtn: {
    position: "absolute",
    top: 10,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.card,
    justifyContent: "center",
    alignItems: "center",
  },
});
