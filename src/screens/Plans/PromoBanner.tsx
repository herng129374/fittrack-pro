// PromoBanner.tsx
// Auto-sliding "billboard" carousel shown at the top of PlanPickerScreen —
// advertises current Promotions (bundle combos or promo codes). Tapping a
// slide opens PromoDetailModal with the full offer.
//
// Pure presentation + autoplay timer; all Promotion data/fetching stays in
// PlanPickerScreen so this component has no Firestore dependency.

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, Promotion } from "./Plantypes";

const { width: SCREEN_W } = Dimensions.get("window");
const SLIDE_W = SCREEN_W - 32; // matches the 16px screen padding used elsewhere
const SLIDE_H = 150;
const AUTOPLAY_MS = 4000;

export function PromoBanner({
  promotions,
  onSelect,
}: {
  promotions: Promotion[];
  onSelect: (promo: Promotion) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);

  // Autoplay — advances one slide every AUTOPLAY_MS, loops back to start.
  useEffect(() => {
    if (promotions.length <= 1) return;
    const timer = setInterval(() => {
      const next = (indexRef.current + 1) % promotions.length;
      scrollRef.current?.scrollTo({ x: next * SLIDE_W, animated: true });
      indexRef.current = next;
      setIndex(next);
    }, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [promotions.length]);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SLIDE_W);
    indexRef.current = i;
    setIndex(i);
  };

  if (promotions.length === 0) return null;

  return (
    <View style={b.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={{ width: SLIDE_W }}
      >
        {promotions.map((promo) => (
          <TouchableOpacity
            key={promo.id}
            style={{ width: SLIDE_W }}
            activeOpacity={0.9}
            onPress={() => onSelect(promo)}
          >
            <View style={b.slide}>
              {promo.bannerImageUrl ? (
                <Image
                  source={{ uri: promo.bannerImageUrl }}
                  style={b.img}
                  resizeMode="cover"
                />
              ) : (
                <View style={[b.img, b.imgFallback]}>
                  <Ionicons name="pricetag" size={30} color={C.lime} />
                </View>
              )}
              <View style={b.overlay} />
              {promo.discountPercent > 0 && (
                <View style={b.discountBadge}>
                  <Text style={b.discountTxt}>-{promo.discountPercent}%</Text>
                </View>
              )}
              <View style={b.textBox}>
                <View style={b.kindPill}>
                  <Ionicons
                    name={promo.type === "bundle" ? "gift" : "pricetag"}
                    size={11}
                    color={C.bg}
                  />
                  <Text style={b.kindTxt}>
                    {promo.type === "bundle" ? "Bundle deal" : "Promo code"}
                  </Text>
                </View>
                <Text style={b.title} numberOfLines={1}>
                  {promo.title}
                </Text>
                <Text style={b.tapHint}>Tap to view details</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {promotions.length > 1 && (
        <View style={b.dots}>
          {promotions.map((_, i) => (
            <View key={i} style={[b.dot, i === index && b.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const b = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 14, alignItems: "center" },
  slide: {
    width: "100%",
    height: SLIDE_H,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
  },
  img: { width: "100%", height: "100%", position: "absolute" },
  imgFallback: { justifyContent: "center", alignItems: "center" },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "65%",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  discountBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "#ff3b30",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  discountTxt: { fontSize: 12, fontWeight: "900", color: "#fff" },
  textBox: { position: "absolute", left: 14, right: 14, bottom: 12, gap: 3 },
  kindPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 2,
  },
  kindTxt: { fontSize: 10, fontWeight: "800", color: "#000" },
  title: { fontSize: 17, fontWeight: "900", color: "#fff" },
  tapHint: { fontSize: 11, color: "rgba(255,255,255,0.8)" },
  dots: { flexDirection: "row", gap: 6, marginTop: 10 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  dotActive: { backgroundColor: C.lime, width: 16 },
});
