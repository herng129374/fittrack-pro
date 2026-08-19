// CheckoutModal.tsx
// Triggered from the cart's "Checkout" button. Walks the buyer through:
// create order -> open PayPal sandbox approve page -> MANUAL confirm ->
// capture order -> success state.
//
// Why manual confirm instead of relying on WebBrowser.openAuthSessionAsync's
// automatic redirect detection: on Expo Web, custom URL schemes
// (fittrack://...) aren't reliably intercepted by the browser, so the
// "result.type === 'success'" check silently falls through to idle even
// after a real approval. Manual confirm sidesteps that entirely — works
// identically on web, iOS, and Android. Swap back to automatic detection
// later once you're testing in a packaged native build if you want it.

import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Image,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import {
  createPaypalOrder,
  capturePaypalOrder,
  getPaypalApproveUrl,
} from "./paypalservice";

const C = {
  bg: "#0d0d0f",
  card: "#1c1d23",
  cardAlt: "#212330",
  lime: "#c8f135",
  white: "#f2f2f4",
  muted: "#6b6d7a",
  border: "#26272f",
  danger: "#ff4f4f",
  green: "#22c55e",
} as const;

type CheckoutStatus =
  | "idle" // nothing happened yet
  | "creating" // calling create-order
  | "awaiting_confirm" // browser opened, waiting for user to tap "I've paid"
  | "capturing" // calling capture-order
  | "success"
  | "error";

interface CheckoutItem {
  name: string;
  image?: string;
}

interface CheckoutModalProps {
  visible: boolean;
  onClose: () => void;
  amount: number; // total in USD, matches what backend sends to PayPal
  userId: string;
  items: CheckoutItem[];
  onSuccess: (orderID: string) => void;
}

export default function CheckoutModal({
  visible,
  onClose,
  amount,
  userId,
  items,
  onSuccess,
}: CheckoutModalProps) {
  const [status, setStatus] = useState<CheckoutStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [orderID, setOrderID] = useState<string | null>(null);

  const reset = () => {
    setStatus("idle");
    setErrorMsg("");
    setOrderID(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Step 1: create the order, then open PayPal's sandbox approve page.
  const handlePayWithPaypal = async () => {
    try {
      setStatus("creating");
      const newOrderID = await createPaypalOrder(amount, userId);
      setOrderID(newOrderID);

      const approveUrl = getPaypalApproveUrl(newOrderID);

      if (Platform.OS === "web") {
        // Open in a new tab so the checkout modal stays visible underneath
        // with the "I've completed payment" button ready.
        window.open(approveUrl, "_blank");
      } else {
        await WebBrowser.openBrowserAsync(approveUrl);
      }

      setStatus("awaiting_confirm");
    } catch (err: any) {
      console.error("Checkout create-order error:", err);
      setErrorMsg(err.message ?? "Something went wrong");
      setStatus("error");
    }
  };

  // Step 2: user manually confirms after approving on PayPal's page.
  const handleConfirmPayment = async () => {
    if (!orderID) return;
    try {
      setStatus("capturing");
      await capturePaypalOrder(orderID);
      setStatus("success");
      onSuccess(orderID);
    } catch (err: any) {
      console.error("Checkout capture-order error:", err);
      setErrorMsg(
        err.message ?? "Capture failed — did you approve on PayPal first?",
      );
      setStatus("error");
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={s.root}>
        <View style={s.header}>
          <TouchableOpacity style={s.closeBtn} onPress={handleClose}>
            <Ionicons name="close" size={20} color={C.white} />
          </TouchableOpacity>
          <Text style={s.title}>Checkout</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={s.body}>
          {/* Order summary */}
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>ORDER SUMMARY</Text>
            {items.map((item, i) => (
              <View key={i} style={s.itemRow}>
                {item.image && (
                  <Image source={{ uri: item.image }} style={s.itemImg} />
                )}
                <Text style={s.itemName} numberOfLines={1}>
                  {item.name}
                </Text>
              </View>
            ))}
            <View style={s.divider} />
            <View style={s.totalRow}>
              <Text style={s.totalLbl}>Total (USD)</Text>
              <Text style={s.totalAmt}>${amount.toFixed(2)}</Text>
            </View>
          </View>

          {/* Step 1: Pay button */}
          {status === "idle" && (
            <TouchableOpacity style={s.payBtn} onPress={handlePayWithPaypal}>
              <Ionicons name="logo-paypal" size={18} color={C.bg} />
              <Text style={s.payBtnTxt}>Pay with PayPal</Text>
            </TouchableOpacity>
          )}

          {status === "creating" && (
            <View style={s.statusBox}>
              <ActivityIndicator color={C.lime} size="small" />
              <Text style={s.statusTxt}>Creating your order...</Text>
            </View>
          )}

          {/* Step 2: manual confirm, shown after the PayPal tab opens */}
          {status === "awaiting_confirm" && (
            <View style={s.confirmBox}>
              <Ionicons name="open-outline" size={32} color={C.lime} />
              <Text style={s.confirmTitle}>Complete payment in the tab</Text>
              <Text style={s.confirmSub}>
                Log in with your PayPal sandbox personal account and click
                Approve. Once you're done, come back here and confirm.
              </Text>
              <TouchableOpacity
                style={s.confirmBtn}
                onPress={handleConfirmPayment}
              >
                <Ionicons name="checkmark-circle" size={18} color={C.bg} />
                <Text style={s.confirmBtnTxt}>I've completed payment</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={reset}>
                <Text style={s.cancelLink}>Cancel and start over</Text>
              </TouchableOpacity>
            </View>
          )}

          {status === "capturing" && (
            <View style={s.statusBox}>
              <ActivityIndicator color={C.lime} size="small" />
              <Text style={s.statusTxt}>Confirming payment with PayPal...</Text>
            </View>
          )}

          {status === "success" && (
            <View style={s.successBox}>
              <Ionicons name="checkmark-circle" size={48} color={C.green} />
              <Text style={s.successTitle}>Payment successful!</Text>
              <Text style={s.successSub}>
                Order {orderID} has been confirmed.
              </Text>
              <TouchableOpacity style={s.doneBtn} onPress={handleClose}>
                <Text style={s.doneBtnTxt}>Done</Text>
              </TouchableOpacity>
            </View>
          )}

          {status === "error" && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle" size={40} color={C.danger} />
              <Text style={s.errorTitle}>Payment failed</Text>
              <Text style={s.errorSub}>{errorMsg}</Text>
              <TouchableOpacity style={s.retryBtn} onPress={reset}>
                <Text style={s.retryBtnTxt}>Try again</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={s.sandboxNote}>
            🧪 Sandbox mode — log in with your PayPal sandbox personal account,
            not a real PayPal account.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
  },
  title: { color: C.white, fontSize: 16, fontWeight: "800" },
  body: { flex: 1, padding: 16 },
  summaryCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 20,
  },
  summaryLabel: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  itemImg: { width: 32, height: 32, borderRadius: 7 },
  itemName: { color: C.white, fontSize: 13, flex: 1 },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 10 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLbl: { color: C.muted, fontSize: 13, fontWeight: "600" },
  totalAmt: { color: C.lime, fontSize: 20, fontWeight: "900" },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.lime,
    borderRadius: 14,
    padding: 15,
    gap: 8,
  },
  payBtnTxt: { color: C.bg, fontSize: 15, fontWeight: "900" },
  statusBox: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 30,
  },
  statusTxt: { color: C.white, fontSize: 13, fontWeight: "600" },
  confirmBox: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 20,
    backgroundColor: C.cardAlt,
    borderRadius: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  confirmTitle: {
    color: C.white,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 6,
  },
  confirmSub: {
    color: C.muted,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 8,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.lime,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 13,
    gap: 8,
    width: "100%",
  },
  confirmBtnTxt: { color: C.bg, fontSize: 14, fontWeight: "800" },
  cancelLink: {
    color: C.muted,
    fontSize: 12,
    marginTop: 6,
    textDecorationLine: "underline",
  },
  successBox: { alignItems: "center", gap: 8, paddingVertical: 24 },
  successTitle: { color: C.white, fontSize: 17, fontWeight: "800" },
  successSub: { color: C.muted, fontSize: 12, textAlign: "center" },
  doneBtn: {
    marginTop: 12,
    backgroundColor: C.lime,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  doneBtnTxt: { color: C.bg, fontSize: 14, fontWeight: "800" },
  errorBox: { alignItems: "center", gap: 8, paddingVertical: 24 },
  errorTitle: { color: C.white, fontSize: 16, fontWeight: "800" },
  errorSub: {
    color: C.muted,
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: C.cardAlt,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: C.border,
  },
  retryBtnTxt: { color: C.white, fontSize: 13, fontWeight: "700" },
  sandboxNote: {
    color: C.muted,
    fontSize: 11,
    textAlign: "center",
    marginTop: "auto",
    paddingTop: 16,
  },
});
