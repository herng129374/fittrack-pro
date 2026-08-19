import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  Dimensions,
  Alert,
  StyleSheet,
  StatusBar,
  FlatList,
  Text,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  PanResponder,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getAuth, onAuthStateChanged, User } from "firebase/auth";
import CheckoutModal from "./checkoutmodal";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  arrayUnion,
  onSnapshot,
} from "firebase/firestore";

const { width, height: SCREEN_H } = Dimensions.get("window");

// ── Responsive columns ────────────────────────────────────
const getNumColumns = () => {
  if (width >= 1024) return 4;
  if (width >= 768) return 3;
  return 2;
};
const NUM_COLS = getNumColumns();
const CARD_W = (width - 32 - (NUM_COLS - 1) * 10) / NUM_COLS;

// ── Palette (matches existing app) ────────────────────────
const C = {
  bg: "#0d0d0f",
  card: "#1c1d23",
  cardAlt: "#212330",
  lime: "#c8f135",
  limeDeep: "#9dbf1e",
  white: "#f2f2f4",
  muted: "#6b6d7a",
  border: "#26272f",
  blue: "#4e8ef7",
  danger: "#ff4f4f",
  pink: "#ff4d6d",
  orange: "#f97316",
  green: "#22c55e",
  gold: "#fbbf24",
  purple: "#a855f7",
} as const;

// ── Types ─────────────────────────────────────────────────
interface ProductVariant {
  label: string;
  price: number;
}

interface ProductReview {
  id: string;
  userId: string;
  username: string;
  rating: number;
  comment: string;
  createdAt: string;
}

interface Product {
  id: string;
  name: string;
  description: string;
  images: string[];
  basePrice: number;
  tokenDiscount: number; // % discount when paying with tokens
  category: string;
  tags: string[];
  variants?: ProductVariant[];
  soldCount: number;
  rating: number;
  reviews: ProductReview[];
  stock: number;
  featured?: boolean;
  badge?: string; // e.g. "NEW", "HOT", "SALE"
  status?: "active" | "archived";
}

interface CartItem {
  product: Product;
  variant?: ProductVariant;
  quantity: number;
  useTokens: boolean;
}

// ── Firestore → Product normalizer ─────────────────────────
// Admin dashboard writes a slimmer shape (no tags/rating/reviews/etc).
// This fills in safe defaults so the marketplace UI never breaks on
// fields the admin form doesn't manage yet.
function normalizeProduct(id: string, data: any): Product {
  return {
    id,
    name: data.name ?? "",
    description: data.description ?? "",
    images:
      Array.isArray(data.images) && data.images.length > 0
        ? data.images
        : [
            "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600",
          ],
    basePrice: data.basePrice ?? 0,
    tokenDiscount: data.tokenDiscount ?? 0,
    category: data.category ?? "Equipment",
    tags: Array.isArray(data.tags) ? data.tags : [],
    variants: Array.isArray(data.variants) ? data.variants : undefined,
    soldCount: data.soldCount ?? 0,
    rating: data.rating ?? 0,
    reviews: Array.isArray(data.reviews) ? data.reviews : [],
    stock: data.stock ?? 0,
    featured: data.featured ?? false,
    badge: data.badge || undefined,
    status: data.status ?? "active",
  };
}

const CATEGORIES = [
  "All",
  "Equipment",
  "Nutrition",
  "Apparel",
  "Accessories",
  "Tech",
  "Recovery",
];
const RECOMMENDATIONS = [
  { label: "🔥 Trending", query: "trending" },
  { label: "💪 Strength", query: "strength" },
  { label: "🧘 Yoga", query: "yoga" },
  { label: "🏃 Cardio", query: "cardio" },
  { label: "🥗 Nutrition", query: "nutrition" },
  { label: "🔋 Recovery", query: "recovery" },
  { label: "📱 Tech", query: "tech" },
  { label: "👕 Apparel", query: "apparel" },
];

// ── Star Rating ───────────────────────────────────────────
function StarRating({ rating, size = 12 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= Math.round(rating) ? "star" : "star-outline"}
          size={size}
          color={i <= Math.round(rating) ? C.gold : C.muted}
        />
      ))}
    </View>
  );
}

// ── Token Badge ───────────────────────────────────────────
function TokenBadge({ count }: { count: number }) {
  return (
    <View style={tb.wrap}>
      <Text style={tb.emoji}>🪙</Text>
      <Text style={tb.count}>{count}</Text>
    </View>
  );
}
const tb = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: C.border,
    gap: 5,
  },
  emoji: { fontSize: 15 },
  count: { color: C.lime, fontSize: 15, fontWeight: "800" },
});

// ── Product Card ──────────────────────────────────────────
function ProductCard({
  product,
  tokens,
  onPress,
}: {
  product: Product;
  tokens: number;
  onPress: () => void;
}) {
  const discountedPrice = product.basePrice * (1 - product.tokenDiscount / 100);
  const canAffordDiscount = tokens >= 10;

  return (
    <TouchableOpacity
      style={[pc.card, { width: CARD_W }]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      <View style={pc.imgWrap}>
        <Image
          source={{ uri: product.images[0] }}
          style={pc.img}
          resizeMode="cover"
        />
        {product.badge && (
          <View
            style={[
              pc.badge,
              { backgroundColor: getBadgeColor(product.badge) },
            ]}
          >
            <Text style={pc.badgeTxt}>{product.badge}</Text>
          </View>
        )}
        {product.stock <= 15 && (
          <View style={pc.stockWarn}>
            <Text style={pc.stockWarnTxt}>Only {product.stock} left</Text>
          </View>
        )}
        {product.images.length > 1 && (
          <View style={pc.multiImg}>
            <Ionicons name="images-outline" size={10} color={C.white} />
          </View>
        )}
      </View>
      <View style={pc.info}>
        <Text style={pc.name} numberOfLines={2}>
          {product.name}
        </Text>
        <View style={pc.ratingRow}>
          <StarRating rating={product.rating} size={10} />
          <Text style={pc.soldTxt}>{formatSold(product.soldCount)} sold</Text>
        </View>
        <View style={pc.priceRow}>
          <Text style={pc.price}>RM {product.basePrice}</Text>
          {canAffordDiscount && (
            <View style={pc.discountBadge}>
              <Text style={pc.discountTxt}>🪙 -{product.tokenDiscount}%</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function getBadgeColor(badge: string) {
  switch (badge) {
    case "HOT":
      return C.danger;
    case "NEW":
      return C.blue;
    case "SALE":
      return C.orange;
    case "POPULAR":
      return C.purple;
    case "PREMIUM":
      return C.gold;
    default:
      return C.muted;
  }
}

function formatSold(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

const pc = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
  },
  imgWrap: { width: "100%", aspectRatio: 1, position: "relative" },
  img: { width: "100%", height: "100%" },
  badge: {
    position: "absolute",
    top: 7,
    left: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeTxt: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  stockWarn: {
    position: "absolute",
    bottom: 7,
    left: 7,
    backgroundColor: "rgba(255,79,79,0.85)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  stockWarnTxt: { color: "#fff", fontSize: 9, fontWeight: "700" },
  multiImg: {
    position: "absolute",
    top: 7,
    right: 7,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 4,
    borderRadius: 5,
  },
  info: { padding: 9 },
  name: {
    color: C.white,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 5,
    lineHeight: 16,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 5,
  },
  soldTxt: { color: C.muted, fontSize: 10 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  price: { color: C.lime, fontSize: 13, fontWeight: "900" },
  discountBadge: {
    backgroundColor: C.lime + "22",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  discountTxt: { color: C.lime, fontSize: 9, fontWeight: "700" },
});

// ── Product Detail Modal ───────────────────────────────────
function ProductModal({
  product,
  visible,
  onClose,
  userTokens,
  onAddToCart,
  onBuyNow,
  onSubmitReview,
}: {
  product: Product | null;
  visible: boolean;
  onClose: () => void;
  userTokens: number;
  onAddToCart: (item: CartItem) => void;
  onBuyNow: (item: CartItem) => void;
  onSubmitReview: (productId: string, review: ProductReview) => void;
}) {
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    null,
  );
  const [useTokens, setUseTokens] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [showReviewInput, setShowReviewInput] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);

  // Draggable left panel
  const panelWidth = Math.min(width * 0.42, 340);
  const panelAnim = useRef(new Animated.Value(panelWidth)).current;
  const panelWidthRef = useRef(panelWidth);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gs) => {
        const newW = Math.max(
          160,
          Math.min(width * 0.6, panelWidthRef.current + gs.dx),
        );
        panelAnim.setValue(newW);
      },
      onPanResponderRelease: (_, gs) => {
        const newW = Math.max(
          160,
          Math.min(width * 0.6, panelWidthRef.current + gs.dx),
        );
        panelWidthRef.current = newW;
        panelAnim.setValue(newW);
      },
    }),
  ).current;

  useEffect(() => {
    if (visible && product) {
      setSelectedVariant(product.variants?.[0] ?? null);
      setUseTokens(false);
      setImgIndex(0);
      setReviewText("");
      setReviewRating(5);
      setShowReviewInput(false);
    }
  }, [visible, product]);

  if (!product) return null;

  const currentPrice = selectedVariant?.price ?? product.basePrice;
  const discountedPrice = useTokens
    ? currentPrice * (1 - product.tokenDiscount / 100)
    : currentPrice;
  const tokenSaving = currentPrice - discountedPrice;
  const canUseTokens = userTokens >= 10;

  const cartItem: CartItem = {
    product,
    variant: selectedVariant ?? undefined,
    quantity: 1,
    useTokens,
  };

  const handleSubmitReview = async () => {
    if (!reviewText.trim() || submittingReview) return;
    setSubmittingReview(true);
    const auth = getAuth();
    const review: ProductReview = {
      id: `r-${Date.now()}`,
      userId: auth.currentUser?.uid ?? "anonymous",
      username: auth.currentUser?.displayName || "Member",
      rating: reviewRating,
      comment: reviewText.trim(),
      createdAt: new Date().toISOString().slice(0, 10),
    };
    try {
      const db = getFirestore();
      await updateDoc(doc(db, "products", product.id), {
        reviews: arrayUnion(review),
      });
      onSubmitReview(product.id, review);
      Alert.alert("✅ Review submitted!", "Thank you for your feedback.");
      setReviewText("");
      setShowReviewInput(false);
    } catch (e) {
      Alert.alert("Couldn't submit review", "Please try again.");
    }
    setSubmittingReview(false);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={pm.root}>
        {/* Top bar */}
        <View style={pm.topBar}>
          <TouchableOpacity style={pm.topBtn} onPress={onClose}>
            <Ionicons name="chevron-down" size={22} color={C.white} />
          </TouchableOpacity>
          <Text style={pm.topTitle} numberOfLines={1}>
            {product.name}
          </Text>
          <View style={pm.tokenDisplay}>
            <Text style={pm.tokenEmoji}>🪙</Text>
            <Text style={pm.tokenCount}>{userTokens}</Text>
          </View>
        </View>

        {/* Body: left info panel + right image */}
        <View style={pm.body}>
          {/* ─── LEFT: Scrollable info (draggable width) ─── */}
          <Animated.View style={[pm.leftPanel, { width: panelAnim }]}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 30 }}
            >
              {/* Product name + rating */}
              <Text style={pm.prodName}>{product.name}</Text>
              <View style={pm.ratingRow}>
                <StarRating rating={product.rating} size={14} />
                <Text style={pm.ratingTxt}>{product.rating}</Text>
                <Text style={pm.soldTxt}>
                  ({formatSold(product.soldCount)} sold)
                </Text>
              </View>

              {/* Price */}
              <View style={pm.priceBox}>
                <Text style={pm.currentPrice}>
                  RM {discountedPrice.toFixed(0)}
                </Text>
                {useTokens && (
                  <View style={pm.savingBadge}>
                    <Text style={pm.savingTxt}>
                      You save RM {tokenSaving.toFixed(0)}!
                    </Text>
                  </View>
                )}
              </View>

              {/* Token discount toggle */}
              {canUseTokens && (
                <TouchableOpacity
                  style={[pm.tokenToggle, useTokens && pm.tokenToggleActive]}
                  onPress={() => setUseTokens(!useTokens)}
                >
                  <Text style={pm.tokenToggleEmoji}>🪙</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={pm.tokenToggleTxt}>
                      Use tokens — save {product.tokenDiscount}%
                    </Text>
                    <Text style={pm.tokenToggleSub}>
                      You have {userTokens} tokens · Earn more by completing
                      tasks
                    </Text>
                  </View>
                  <View style={[pm.toggleDot, useTokens && pm.toggleDotActive]}>
                    {useTokens && (
                      <Ionicons name="checkmark" size={12} color={C.bg} />
                    )}
                  </View>
                </TouchableOpacity>
              )}

              {!canUseTokens && (
                <View style={pm.earnTokensHint}>
                  <Ionicons
                    name="information-circle-outline"
                    size={14}
                    color={C.orange}
                  />
                  <Text style={pm.earnTokensTxt}>
                    Complete daily tasks to earn tokens for discounts!
                  </Text>
                </View>
              )}

              {/* Variants */}
              {product.variants && product.variants.length > 0 && (
                <View style={pm.section}>
                  <Text style={pm.sectionLbl}>SELECT OPTION</Text>
                  <View style={pm.variantsWrap}>
                    {product.variants.map((v, i) => (
                      <TouchableOpacity
                        key={i}
                        style={[
                          pm.variantChip,
                          selectedVariant?.label === v.label &&
                            pm.variantChipActive,
                        ]}
                        onPress={() => setSelectedVariant(v)}
                      >
                        <Text
                          style={[
                            pm.variantTxt,
                            selectedVariant?.label === v.label &&
                              pm.variantTxtActive,
                          ]}
                        >
                          {v.label}
                        </Text>
                        {v.price !== product.basePrice && (
                          <Text
                            style={[
                              pm.variantPrice,
                              selectedVariant?.label === v.label && {
                                color: C.lime,
                              },
                            ]}
                          >
                            RM {v.price}
                          </Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Action buttons */}
              <TouchableOpacity
                style={pm.buyNowBtn}
                onPress={() => {
                  onBuyNow(cartItem);
                  onClose();
                }}
              >
                <Ionicons name="flash" size={16} color={C.bg} />
                <Text style={pm.buyNowTxt}>
                  Buy Now · RM {discountedPrice.toFixed(0)}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={pm.addCartBtn}
                onPress={() => {
                  onAddToCart(cartItem);
                  onClose();
                }}
              >
                <Ionicons name="cart-outline" size={16} color={C.lime} />
                <Text style={pm.addCartTxt}>Add to Cart</Text>
              </TouchableOpacity>

              {/* Description */}
              <View style={pm.section}>
                <Text style={pm.sectionLbl}>DESCRIPTION</Text>
                <Text style={pm.descTxt}>{product.description}</Text>
              </View>

              {/* Stock info */}
              <View style={pm.infoRow}>
                <Ionicons name="cube-outline" size={14} color={C.muted} />
                <Text style={pm.infoTxt}>
                  Stock: {product.stock} units available
                </Text>
              </View>
              <View style={pm.infoRow}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={14}
                  color={C.green}
                />
                <Text style={[pm.infoTxt, { color: C.green }]}>
                  Authentic product · Secured checkout
                </Text>
              </View>

              {/* Token earn reminder */}
              <View style={pm.tokenEarnBox}>
                <Text style={pm.tokenEarnTitle}>
                  💡 Earn Tokens, Get Discounts
                </Text>
                <Text style={pm.tokenEarnTxt}>
                  Complete daily tasks and challenges to earn 🪙 tokens. Use
                  tokens at checkout to unlock up to {product.tokenDiscount}%
                  off this product!
                </Text>
              </View>

              {/* Reviews */}
              <View style={pm.section}>
                <View style={pm.reviewsHeader}>
                  <Text style={pm.sectionLbl}>
                    REVIEWS ({product.reviews.length})
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowReviewInput(!showReviewInput)}
                  >
                    <Text style={pm.writeReviewBtn}>+ Write Review</Text>
                  </TouchableOpacity>
                </View>

                {showReviewInput && (
                  <View style={pm.reviewInput}>
                    <View
                      style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}
                    >
                      {[1, 2, 3, 4, 5].map((s) => (
                        <TouchableOpacity
                          key={s}
                          onPress={() => setReviewRating(s)}
                        >
                          <Ionicons
                            name={s <= reviewRating ? "star" : "star-outline"}
                            size={22}
                            color={s <= reviewRating ? C.gold : C.muted}
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TextInput
                      style={pm.reviewTextInput}
                      placeholder="Share your experience..."
                      placeholderTextColor={C.muted}
                      value={reviewText}
                      onChangeText={setReviewText}
                      multiline
                    />
                    <TouchableOpacity
                      style={pm.submitReviewBtn}
                      onPress={handleSubmitReview}
                      disabled={submittingReview}
                    >
                      <Text style={pm.submitReviewTxt}>
                        {submittingReview ? "Submitting..." : "Submit Review"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {product.reviews.length === 0 ? (
                  <View style={pm.noReviews}>
                    <Text style={pm.noReviewsTxt}>
                      No reviews yet · Be the first!
                    </Text>
                  </View>
                ) : (
                  product.reviews.map((r) => (
                    <View key={r.id} style={pm.reviewItem}>
                      <View style={pm.reviewTop}>
                        <View style={pm.reviewAvatar}>
                          <Text style={pm.reviewAvatarTxt}>
                            {r.username[0]?.toUpperCase() ?? "?"}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={pm.reviewUser}>@{r.username}</Text>
                          <StarRating rating={r.rating} size={11} />
                        </View>
                        <Text style={pm.reviewDate}>{r.createdAt}</Text>
                      </View>
                      <Text style={pm.reviewComment}>{r.comment}</Text>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>

            {/* Drag handle */}
            <View {...panResponder.panHandlers} style={pm.dragHandle}>
              <View style={pm.dragBar} />
            </View>
          </Animated.View>

          {/* ─── RIGHT: Image gallery ─── */}
          <View style={{ flex: 1, backgroundColor: C.bg }}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={(e) => {
                const rightW = width - panelWidthRef.current;
                const idx = Math.round(e.nativeEvent.contentOffset.x / rightW);
                setImgIndex(idx);
              }}
              scrollEventThrottle={16}
            >
              {product.images.map((uri, i) => (
                <View
                  key={i}
                  style={{
                    width: width - panelWidth,
                    height: "100%",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Image
                    source={{ uri }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                  />
                </View>
              ))}
            </ScrollView>

            {/* Dot indicators */}
            {product.images.length > 1 && (
              <View style={pm.imgDots}>
                {product.images.map((_, i) => (
                  <View
                    key={i}
                    style={[pm.dot, i === imgIndex && pm.dotActive]}
                  />
                ))}
              </View>
            )}

            {/* Image count badge */}
            {product.images.length > 1 && (
              <View style={pm.imgBadge}>
                <Ionicons name="images-outline" size={12} color={C.white} />
                <Text style={pm.imgBadgeTxt}>
                  {imgIndex + 1}/{product.images.length}
                </Text>
              </View>
            )}

            {/* Rating overlay */}
            <View style={pm.imgOverlay}>
              <View style={pm.overlayStat}>
                <Ionicons name="star" size={14} color={C.gold} />
                <Text style={pm.overlayStatTxt}>{product.rating}</Text>
              </View>
              <View style={pm.overlayStat}>
                <Ionicons name="cart-outline" size={14} color={C.lime} />
                <Text style={pm.overlayStatTxt}>
                  {formatSold(product.soldCount)} sold
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const pm = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 52,
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.bg,
  },
  topBtn: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
  },
  topTitle: {
    flex: 1,
    color: C.white,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
    marginHorizontal: 10,
  },
  tokenDisplay: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: C.border,
    gap: 4,
  },
  tokenEmoji: { fontSize: 13 },
  tokenCount: { color: C.lime, fontSize: 13, fontWeight: "800" },
  body: { flex: 1, flexDirection: "row" },
  leftPanel: {
    backgroundColor: C.card,
    borderRightWidth: 1,
    borderRightColor: C.border,
    paddingHorizontal: 14,
    paddingTop: 14,
    position: "relative",
  },
  dragHandle: {
    position: "absolute",
    right: -12,
    top: "50%",
    width: 24,
    height: 60,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  dragBar: {
    width: 4,
    height: 40,
    backgroundColor: C.border,
    borderRadius: 2,
  },
  prodName: {
    color: C.white,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 22,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  ratingTxt: { color: C.gold, fontSize: 12, fontWeight: "700" },
  soldTxt: { color: C.muted, fontSize: 11 },
  priceBox: { marginBottom: 10 },
  currentPrice: {
    color: C.lime,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  savingBadge: {
    backgroundColor: C.lime + "20",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginTop: 4,
    borderWidth: 1,
    borderColor: C.lime + "40",
  },
  savingTxt: { color: C.lime, fontSize: 11, fontWeight: "700" },
  tokenToggle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.cardAlt,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 10,
    gap: 8,
  },
  tokenToggleActive: { borderColor: C.lime, backgroundColor: C.lime + "12" },
  tokenToggleEmoji: { fontSize: 18 },
  tokenToggleTxt: {
    color: C.white,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 2,
  },
  tokenToggleSub: { color: C.muted, fontSize: 10 },
  toggleDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.cardAlt,
    borderWidth: 1.5,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
  },
  toggleDotActive: { backgroundColor: C.lime, borderColor: C.lime },
  earnTokensHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.orange + "15",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.orange + "30",
  },
  earnTokensTxt: { color: C.orange, fontSize: 11, fontWeight: "600", flex: 1 },
  section: { marginTop: 16 },
  sectionLbl: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  variantsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  variantChip: {
    backgroundColor: C.cardAlt,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  variantChipActive: { borderColor: C.lime, backgroundColor: C.lime + "18" },
  variantTxt: { color: C.muted, fontSize: 11, fontWeight: "600" },
  variantTxtActive: { color: C.lime },
  variantPrice: { color: C.muted, fontSize: 10, marginTop: 1 },
  buyNowBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.lime,
    borderRadius: 14,
    padding: 13,
    marginTop: 16,
    gap: 6,
  },
  buyNowTxt: { color: C.bg, fontSize: 14, fontWeight: "900" },
  addCartBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.lime + "18",
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
    gap: 6,
    borderWidth: 1.5,
    borderColor: C.lime + "50",
  },
  addCartTxt: { color: C.lime, fontSize: 13, fontWeight: "800" },
  descTxt: { color: C.white, fontSize: 13, lineHeight: 20, opacity: 0.85 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  infoTxt: { color: C.muted, fontSize: 12 },
  tokenEarnBox: {
    backgroundColor: C.lime + "10",
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: C.lime + "30",
  },
  tokenEarnTitle: {
    color: C.lime,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 5,
  },
  tokenEarnTxt: { color: C.white, fontSize: 11, lineHeight: 17, opacity: 0.75 },
  reviewsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  writeReviewBtn: { color: C.blue, fontSize: 11, fontWeight: "700" },
  reviewInput: {
    backgroundColor: C.cardAlt,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  reviewTextInput: {
    color: C.white,
    fontSize: 13,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 10,
    minHeight: 70,
    marginBottom: 10,
  },
  submitReviewBtn: {
    backgroundColor: C.blue,
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
  },
  submitReviewTxt: { color: "#fff", fontSize: 12, fontWeight: "800" },
  noReviews: { alignItems: "center", paddingVertical: 20 },
  noReviewsTxt: { color: C.muted, fontSize: 13 },
  reviewItem: {
    backgroundColor: C.cardAlt,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  reviewTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 7,
  },
  reviewAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: C.blue + "30",
    justifyContent: "center",
    alignItems: "center",
  },
  reviewAvatarTxt: { color: C.blue, fontSize: 12, fontWeight: "900" },
  reviewUser: {
    color: C.lime,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 2,
  },
  reviewDate: { color: C.muted, fontSize: 10 },
  reviewComment: {
    color: C.white,
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.85,
  },
  imgDots: {
    position: "absolute",
    bottom: 80,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  dotActive: { backgroundColor: C.lime, width: 16 },
  imgBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  imgBadgeTxt: { color: C.white, fontSize: 11, fontWeight: "700" },
  imgOverlay: {
    position: "absolute",
    bottom: 16,
    right: 16,
    gap: 6,
  },
  overlayStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  overlayStatTxt: { color: C.white, fontSize: 11, fontWeight: "700" },
});

// ── Cart Modal ────────────────────────────────────────────
function CartModal({
  visible,
  onClose,
  cart,
  onRemove,
  userTokens,
  onCheckout,
}: {
  visible: boolean;
  onClose: () => void;
  cart: CartItem[];
  onRemove: (idx: number) => void;
  userTokens: number;
  onCheckout: () => void;
}) {
  const total = cart.reduce((sum, item) => {
    const price = item.variant?.price ?? item.product.basePrice;
    const discounted = item.useTokens
      ? price * (1 - item.product.tokenDiscount / 100)
      : price;
    return sum + discounted * item.quantity;
  }, 0);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={cm.root}>
        <View style={cm.header}>
          <TouchableOpacity style={cm.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={C.white} />
          </TouchableOpacity>
          <Text style={cm.title}>Cart ({cart.length})</Text>
          <TokenBadge count={userTokens} />
        </View>

        {cart.length === 0 ? (
          <View style={cm.empty}>
            <Ionicons name="cart-outline" size={50} color={C.muted} />
            <Text style={cm.emptyTxt}>Your cart is empty</Text>
            <Text style={cm.emptySub}>
              Complete tasks to earn tokens and save more!
            </Text>
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={cm.list}>
              {cart.map((item, idx) => {
                const price = item.variant?.price ?? item.product.basePrice;
                const discounted = item.useTokens
                  ? price * (1 - item.product.tokenDiscount / 100)
                  : price;
                return (
                  <View key={idx} style={cm.cartItem}>
                    <Image
                      source={{ uri: item.product.images[0] }}
                      style={cm.cartImg}
                      resizeMode="cover"
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={cm.cartName} numberOfLines={2}>
                        {item.product.name}
                      </Text>
                      {item.variant && (
                        <Text style={cm.cartVariant}>{item.variant.label}</Text>
                      )}
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          marginTop: 4,
                        }}
                      >
                        <Text style={cm.cartPrice}>
                          RM {discounted.toFixed(0)}
                        </Text>
                        {item.useTokens && (
                          <View style={cm.tokenUsedBadge}>
                            <Text style={cm.tokenUsedTxt}>
                              🪙 -{item.product.tokenDiscount}%
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => onRemove(idx)}
                      style={cm.removeBtn}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color={C.danger}
                      />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
            <View style={cm.footer}>
              <View style={cm.totalRow}>
                <Text style={cm.totalLbl}>Total</Text>
                <Text style={cm.totalAmt}>RM {total.toFixed(0)}</Text>
              </View>
              <TouchableOpacity style={cm.checkoutBtn} onPress={onCheckout}>
                <Ionicons name="flash" size={18} color={C.bg} />
                <Text style={cm.checkoutTxt}>
                  Checkout · RM {total.toFixed(0)}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const cm = StyleSheet.create({
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
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10 },
  emptyTxt: { color: C.white, fontSize: 16, fontWeight: "700" },
  emptySub: {
    color: C.muted,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 30,
  },
  list: { padding: 16, gap: 10 },
  cartItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  cartImg: { width: 60, height: 60, borderRadius: 10 },
  cartName: { color: C.white, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  cartVariant: { color: C.muted, fontSize: 11, marginTop: 2 },
  cartPrice: { color: C.lime, fontSize: 14, fontWeight: "900" },
  tokenUsedBadge: {
    backgroundColor: C.lime + "20",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tokenUsedTxt: { color: C.lime, fontSize: 10, fontWeight: "700" },
  removeBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: C.danger + "15",
    justifyContent: "center",
    alignItems: "center",
  },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: C.border },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  totalLbl: { color: C.muted, fontSize: 14, fontWeight: "600" },
  totalAmt: { color: C.white, fontSize: 22, fontWeight: "900" },
  checkoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.lime,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  checkoutTxt: { color: C.bg, fontSize: 16, fontWeight: "900" },
});

// ── Main Marketplace Page ─────────────────────────────────
export default function MarketplacePage() {
  const auth = getAuth();
  const [me, setMe] = useState<User | null>(null);
  const [userTokens, setUserTokens] = useState(0);

  // Live products straight from the admin-managed Firestore `products`
  // collection. onSnapshot means changes made in the admin dashboard
  // (add / edit / archive) show up here immediately, no refresh needed.
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  const [filtered, setFiltered] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productModalVisible, setProductModalVisible] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartVisible, setCartVisible] = useState(false);
  const [checkoutVisible, setCheckoutVisible] = useState(false);

  const cartTotal = cart.reduce((sum, item) => {
    const price = item.variant?.price ?? item.product.basePrice;
    const discounted = item.useTokens
      ? price * (1 - item.product.tokenDiscount / 100)
      : price;
    return sum + discounted * item.quantity;
  }, 0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setMe(u);
      if (u) {
        try {
          const db = getFirestore();
          const snap = await getDoc(doc(db, "users", u.uid));
          if (snap.exists()) setUserTokens(snap.data().tokens || 0);
        } catch {}
      }
    });
    return unsub;
  }, []);

  // Subscribe to the products collection (admin dashboard writes here)
  useEffect(() => {
    const db = getFirestore();
    const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => normalizeProduct(d.id, d.data()))
          .filter((p) => p.status !== "archived");
        setProducts(list);
        setProductsLoading(false);
      },
      () => {
        // e.g. missing index/permissions — fail gracefully with an empty catalog
        setProducts([]);
        setProductsLoading(false);
      },
    );
    return unsub;
  }, []);

  // Filter logic
  useEffect(() => {
    let result = products;
    if (activeCategory !== "All") {
      result = result.filter((p) => p.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q)) ||
          p.category.toLowerCase().includes(q),
      );
    }
    setFiltered(result);
  }, [searchQuery, activeCategory, products]);

  const handleRecommendation = (query: string) => {
    setSearchQuery(query);
    setActiveCategory("All");
  };

  const handleScanCamera = () => {
    Alert.alert(
      "📷 Scan Product",
      "Point your camera at a product barcode or image to find it in our marketplace.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Open Camera",
          onPress: () => Alert.alert("Camera", "Camera feature coming soon!"),
        },
      ],
    );
  };

  const addToCart = (item: CartItem) => {
    setCart((prev) => [...prev, item]);
    Alert.alert("✅ Added to cart!", `${item.product.name} has been added.`);
  };

  const buyNow = (item: CartItem) => {
    setCart([item]);
    setCartVisible(true);
  };

  const removeFromCart = (idx: number) => {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  };

  // Keep the open product modal + product list in sync after a review is
  // submitted (Firestore onSnapshot will also eventually push this, but
  // updating optimistically keeps the open modal responsive).
  const handleReviewSubmitted = (productId: string, review: ProductReview) => {
    setSelectedProduct((prev) =>
      prev && prev.id === productId
        ? { ...prev, reviews: [...prev.reviews, review] }
        : prev,
    );
  };

  // Build grid rows
  const rows: Product[][] = [];
  for (let i = 0; i < filtered.length; i += NUM_COLS) {
    rows.push(filtered.slice(i, i + NUM_COLS));
  }

  if (productsLoading) {
    return (
      <View
        style={[s.root, { justifyContent: "center", alignItems: "center" }]}
      >
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={C.lime} size="large" />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Marketplace</Text>
          <Text style={s.headerSub}>Earn tasks → Get tokens → Save more</Text>
        </View>
        <View style={s.headerRight}>
          <TokenBadge count={userTokens} />
          <TouchableOpacity
            style={s.cartBtn}
            onPress={() => setCartVisible(true)}
          >
            <Ionicons name="cart-outline" size={20} color={C.white} />
            {cart.length > 0 && (
              <View style={s.cartDot}>
                <Text style={s.cartDotTxt}>{cart.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ── Token incentive banner ── */}
        <View style={s.tokenBanner}>
          <View style={s.tokenBannerLeft}>
            <Text style={s.tokenBannerEmoji}>🪙</Text>
            <View>
              <Text style={s.tokenBannerTitle}>Use Tokens, Save More!</Text>
              <Text style={s.tokenBannerSub}>
                Complete daily tasks to earn tokens · Up to 35% off
              </Text>
            </View>
          </View>
          <View style={s.tokenBannerBadge}>
            <Text style={s.tokenBannerBadgeTxt}>{userTokens} pts</Text>
          </View>
        </View>

        {/* ── Search bar ── */}
        <View style={[s.searchBar, searchFocused && { borderColor: C.lime }]}>
          <Ionicons
            name="search"
            size={16}
            color={searchFocused ? C.lime : C.muted}
            style={{ marginRight: 8 }}
          />
          <TextInput
            placeholder="Search products, tags..."
            placeholderTextColor={C.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={s.searchInput}
          />
          {!!searchQuery && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={16} color={C.muted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.scanBtn} onPress={handleScanCamera}>
            <Ionicons name="scan-outline" size={18} color={C.lime} />
          </TouchableOpacity>
        </View>

        {/* ── Recommendation pills ── */}
        <Text style={s.sectionLbl}>QUICK SEARCH</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.recsRow}
        >
          {RECOMMENDATIONS.map((rec) => (
            <TouchableOpacity
              key={rec.query}
              style={[s.recChip, searchQuery === rec.query && s.recChipActive]}
              onPress={() =>
                handleRecommendation(searchQuery === rec.query ? "" : rec.query)
              }
            >
              <Text
                style={[s.recTxt, searchQuery === rec.query && s.recTxtActive]}
              >
                {rec.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Category tabs ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.catsRow}
        >
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[s.catTab, activeCategory === cat && s.catTabActive]}
              onPress={() => setActiveCategory(cat)}
            >
              <Text
                style={[s.catTxt, activeCategory === cat && s.catTxtActive]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Results header ── */}
        <View style={s.resultsHeader}>
          <Text style={s.sectionLbl}>
            {searchQuery
              ? `RESULTS (${filtered.length})`
              : `ALL PRODUCTS (${filtered.length})`}
          </Text>
        </View>

        {/* ── Product grid ── */}
        {filtered.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="search-outline" size={44} color={C.muted} />
            <Text style={s.emptyTxt}>No products found</Text>
            <Text style={s.emptySub}>Try a different search or category</Text>
          </View>
        ) : (
          <View style={s.grid}>
            {rows.map((row, ri) => (
              <View key={ri} style={s.row}>
                {row.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    tokens={userTokens}
                    onPress={() => {
                      setSelectedProduct(product);
                      setProductModalVisible(true);
                    }}
                  />
                ))}
                {/* Fill empty slots */}
                {row.length < NUM_COLS &&
                  Array(NUM_COLS - row.length)
                    .fill(null)
                    .map((_, i) => (
                      <View key={`empty-${i}`} style={{ width: CARD_W }} />
                    ))}
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Modals ── */}
      <ProductModal
        product={selectedProduct}
        visible={productModalVisible}
        onClose={() => setProductModalVisible(false)}
        userTokens={userTokens}
        onAddToCart={addToCart}
        onBuyNow={buyNow}
        onSubmitReview={handleReviewSubmitted}
      />

      <CartModal
        visible={cartVisible}
        onClose={() => setCartVisible(false)}
        cart={cart}
        onRemove={removeFromCart}
        userTokens={userTokens}
        onCheckout={() => {
          setCartVisible(false);
          setCheckoutVisible(true);
        }}
      />

      <CheckoutModal
        visible={checkoutVisible}
        onClose={() => setCheckoutVisible(false)}
        amount={cartTotal}
        userId={me?.uid ?? "guest"}
        items={cart.map((i) => ({
          name: i.product.name,
          image: i.product.images[0],
        }))}
        onSuccess={(orderID) => {
          Alert.alert(
            "✅ Order confirmed!",
            `Order ${orderID} paid successfully.`,
          );
          setCart([]);
        }}
      />
    </View>
  );
}

// ── Main screen styles ─────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    color: C.white,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  headerSub: { color: C.muted, fontSize: 11, marginTop: 2 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  cartBtn: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  cartDot: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: C.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: C.bg,
  },
  cartDotTxt: { color: "#fff", fontSize: 9, fontWeight: "900" },
  tokenBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.lime + "12",
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 4,
    padding: 14,
    borderWidth: 1,
    borderColor: C.lime + "35",
  },
  tokenBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  tokenBannerEmoji: { fontSize: 24 },
  tokenBannerTitle: {
    color: C.lime,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 2,
  },
  tokenBannerSub: { color: C.muted, fontSize: 11 },
  tokenBannerBadge: {
    backgroundColor: C.lime,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tokenBannerBadgeTxt: { color: C.bg, fontSize: 12, fontWeight: "900" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: C.card,
    borderColor: C.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.white, padding: 0 },
  scanBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: C.lime + "18",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
    borderWidth: 1,
    borderColor: C.lime + "40",
  },
  sectionLbl: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
  },
  recsRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  recChip: {
    backgroundColor: C.card,
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: C.border,
  },
  recChipActive: { backgroundColor: C.lime + "20", borderColor: C.lime },
  recTxt: { color: C.muted, fontSize: 12, fontWeight: "600" },
  recTxtActive: { color: C.lime },
  catsRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 6, marginTop: 6 },
  catTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  catTabActive: { backgroundColor: C.white, borderColor: C.white },
  catTxt: { color: C.muted, fontSize: 12, fontWeight: "700" },
  catTxtActive: { color: C.bg },
  resultsHeader: { paddingHorizontal: 16 },
  grid: { paddingHorizontal: 16 },
  row: { flexDirection: "row", gap: 10, marginBottom: 0 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyTxt: { color: C.white, fontSize: 16, fontWeight: "700" },
  emptySub: { color: C.muted, fontSize: 13 },
});
