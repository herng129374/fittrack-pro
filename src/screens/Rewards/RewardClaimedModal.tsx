// RewardClaimedModal.tsx
// The "🎉 Congratulations!" celebration shown right after a successful
// claim. Shared by DailyRewardsCard (quick-claim from Home) and
// RewardCalendarScreen (tapping today's cell).

import React from "react";
import { View, Text, Modal, TouchableOpacity, StyleSheet } from "react-native";
import { DailyRewardDay, rewardSummary, C } from "./rewardTypes";

export function RewardClaimedModal({
  visible,
  day,
  onClose,
}: {
  visible: boolean;
  day: DailyRewardDay | null;
  onClose: () => void;
}) {
  if (!day) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={m.backdrop}>
        <View style={m.card}>
          <Text style={m.congrats}>🎉 Congratulations!</Text>
          <Text style={m.sub}>You received</Text>
          <Text style={m.icon}>{day.icon}</Text>
          <Text style={m.title}>{day.title}</Text>
          <Text style={m.amount}>+{rewardSummary(day)}</Text>

          {day.rewardType !== "token" && (
            <View style={m.noteBox}>
              <Text style={m.noteTxt}>
                This will be added to your account shortly.
              </Text>
            </View>
          )}

          <TouchableOpacity style={m.btn} onPress={onClose} activeOpacity={0.85}>
            <Text style={m.btnTxt}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const m = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },
  card: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: C.card,
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: C.lime + "55",
  },
  congrats: { fontSize: 18, fontWeight: "900", color: C.white },
  sub: { fontSize: 13, color: C.muted, marginTop: 4 },
  icon: { fontSize: 56, marginTop: 18 },
  title: { fontSize: 16, fontWeight: "800", color: C.white, marginTop: 8 },
  amount: { fontSize: 24, fontWeight: "900", color: C.lime, marginTop: 6 },
  noteBox: {
    marginTop: 14,
    backgroundColor: C.card2,
    borderRadius: 10,
    padding: 10,
  },
  noteTxt: { fontSize: 11, color: C.muted, textAlign: "center" },
  btn: {
    marginTop: 24,
    width: "100%",
    backgroundColor: C.lime,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnTxt: { fontSize: 14, fontWeight: "900", color: C.bg },
});
