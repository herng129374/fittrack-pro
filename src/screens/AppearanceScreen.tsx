import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  StatusBar,
  Alert,
  Image,
  Modal,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
  useAppearance,
  PRESETS,
  AppearanceTheme,
  AccentColor,
  FontSize,
  BubbleStyle,
  ChatBackground,
} from "../screens/AppearanceContext";

// ── Static palette options ─────────────────────────────────
const ACCENT_OPTIONS: { color: AccentColor; label: string; emoji: string }[] = [
  { color: "#c8f135", label: "Lime", emoji: "⚡" },
  { color: "#4e8ef7", label: "Blue", emoji: "🌊" },
  { color: "#ff6b9d", label: "Pink", emoji: "🌸" },
  { color: "#f97316", label: "Orange", emoji: "🔥" },
  { color: "#22d3ee", label: "Cyan", emoji: "🧊" },
  { color: "#a78bfa", label: "Purple", emoji: "🔮" },
  { color: "#22c55e", label: "Green", emoji: "🌿" },
  { color: "#ff4f4f", label: "Red", emoji: "❤️‍🔥" },
];

const SOLID_BG_OPTIONS = [
  { color: "#0d0d0f", label: "Void" },
  { color: "#07090f", label: "Abyss" },
  { color: "#0a0a0a", label: "Onyx" },
  { color: "#0f0f14", label: "Slate" },
  { color: "#050d0a", label: "Forest" },
  { color: "#0a0614", label: "Cosmos" },
  { color: "#130808", label: "Ember" },
  { color: "#060e16", label: "Ocean" },
];

const GRADIENT_OPTIONS: { color: string; color2: string; label: string }[] = [
  { color: "#070d1f", color2: "#0e1f3a", label: "Midnight" },
  { color: "#130810", color2: "#1f0d18", label: "Sakura" },
  { color: "#040b16", color2: "#071020", label: "Cyber" },
  { color: "#0a0714", color2: "#17103a", label: "Violet" },
  { color: "#07100a", color2: "#0d2015", label: "Forest" },
  { color: "#130a00", color2: "#261200", label: "Amber" },
];

// ── Live mini chat preview ─────────────────────────────────
function ChatPreview({ theme }: { theme: AppearanceTheme }) {
  const br =
    theme.bubbleStyle === "pill" ? 24 : theme.bubbleStyle === "sharp" ? 4 : 16;

  const bg = theme.chatBackground;
  const previewStyle: any = {
    width: "100%",
    height: 130,
    borderRadius: 14,
    overflow: "hidden",
    justifyContent: "flex-end",
    padding: 10,
    gap: 7,
  };

  return (
    <View style={[previewStyle, { backgroundColor: bg.color }]}>
      {bg.type === "image" && bg.imageUri ? (
        <Image
          source={{ uri: bg.imageUri }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
      ) : null}
      {/* Dark overlay for image readability */}
      {bg.type === "image" && (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: "rgba(0,0,0,0.35)" },
          ]}
        />
      )}

      {/* "Their" bubble */}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 7,
            backgroundColor: theme.accentColor + "33",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 10 }}>A</Text>
        </View>
        <View
          style={{
            backgroundColor: theme.theirBubbleColor,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: br,
            borderBottomLeftRadius: 4,
            maxWidth: "55%",
          }}
        >
          <Text
            style={{
              color: theme.theirBubbleTextColor,
              fontSize: 11,
              fontWeight: "500",
            }}
          >
            Hey! Ready for training? 💪
          </Text>
        </View>
      </View>

      {/* "My" bubble */}
      <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: theme.myBubbleColor,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: br,
            borderBottomRightRadius: 4,
            maxWidth: "60%",
          }}
        >
          <Text
            style={{
              color: theme.myBubbleTextColor,
              fontSize: 11,
              fontWeight: "600",
            }}
          >
            Let's go! See you at 6AM 🔥
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Section wrapper ────────────────────────────────────────
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={cs.section}>
      <Text style={cs.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// ── Color swatch button ────────────────────────────────────
function ColorDot({
  color,
  selected,
  onPress,
  size = 36,
  label,
}: {
  color: string;
  selected: boolean;
  onPress: () => void;
  size?: number;
  label?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{ alignItems: "center", gap: 5 }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          borderWidth: selected ? 2.5 : 1.5,
          borderColor: selected ? "#ffffff" : color + "66",
          justifyContent: "center",
          alignItems: "center",
          shadowColor: selected ? color : "transparent",
          shadowOpacity: 0.7,
          shadowRadius: 8,
          elevation: selected ? 6 : 0,
        }}
      >
        {selected && (
          <Ionicons name="checkmark" size={size * 0.4} color="#000" />
        )}
      </View>
      {label ? (
        <Text
          style={{
            fontSize: 9,
            fontWeight: "700",
            color: selected ? color : "#6b6d7a",
            letterSpacing: 0.5,
          }}
        >
          {label}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

// ── Gradient swatch ────────────────────────────────────────
function GradientSwatch({
  color,
  color2,
  label,
  selected,
  onPress,
}: {
  color: string;
  color2: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  // RN doesn't support LinearGradient natively — use two halves as approximation
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{ alignItems: "center", gap: 4 }}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          overflow: "hidden",
          borderWidth: selected ? 2.5 : 1.5,
          borderColor: selected ? "#ffffff" : "rgba(255,255,255,0.15)",
        }}
      >
        <View style={{ flex: 1, backgroundColor: color }} />
        <View style={{ flex: 1, backgroundColor: color2 }} />
        {selected && (
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { justifyContent: "center", alignItems: "center" },
            ]}
          >
            <Ionicons name="checkmark-circle" size={22} color="#fff" />
          </View>
        )}
      </View>
      <Text
        style={{
          fontSize: 9,
          fontWeight: "700",
          color: selected ? "#fff" : "#6b6d7a",
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ── Main Component ─────────────────────────────────────────
export default function AppearanceScreen({ navigation }: { navigation: any }) {
  const { theme, setTheme, applyPreset, updateField, resetToDefault } =
    useAppearance();

  const [bgTab, setBgTab] = useState<"color" | "gradient" | "image">(
    theme.chatBackground.type,
  );
  const [pickingImage, setPickingImage] = useState(false);

  const T = theme; // shorthand

  // ── Pick custom image ──────────────────────────────────
  const pickChatImage = async () => {
    setPickingImage(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.[0]) {
        updateField("chatBackground", {
          type: "image",
          color: "#000",
          imageUri: result.assets[0].uri,
        });
        setBgTab("image");
      }
    } finally {
      setPickingImage(false);
    }
  };

  return (
    <View style={[cs.root, { backgroundColor: T.bgColor }]}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
      <View style={[cs.header, { borderBottomColor: T.borderColor }]}>
        <TouchableOpacity
          style={[
            cs.backBtn,
            { backgroundColor: T.cardColor, borderColor: T.borderColor },
          ]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={22} color={T.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[cs.headerTitle, { color: T.textPrimary }]}>
            Appearance
          </Text>
          <Text style={[cs.headerSub, { color: T.textSecondary }]}>
            {T.presetName} theme
          </Text>
        </View>
        <TouchableOpacity
          style={[cs.resetBtn, { borderColor: T.borderColor }]}
          onPress={() => {
            Alert.alert(
              "Reset Appearance",
              "Restore all settings to default Dark Lime theme?",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Reset",
                  style: "destructive",
                  onPress: () => {
                    resetToDefault();
                    setBgTab("color");
                  },
                },
              ],
            );
          }}
        >
          <Ionicons name="refresh-outline" size={16} color={T.textSecondary} />
          <Text style={[cs.resetTxt, { color: T.textSecondary }]}>Reset</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={cs.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Live Preview ── */}
        <View style={cs.previewWrap}>
          <Text style={[cs.previewLabel, { color: T.textSecondary }]}>
            LIVE PREVIEW
          </Text>
          {/* Main screen mini preview */}
          <View
            style={[
              cs.screenPreview,
              { backgroundColor: T.bgColor, borderColor: T.borderColor },
            ]}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9,
                  backgroundColor: T.accentColor,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 12 }}>⚡</Text>
              </View>
              <Text
                style={{
                  color: T.textPrimary,
                  fontSize: 13,
                  fontWeight: "800",
                }}
              >
                FitApp
              </Text>
              <View style={{ flex: 1 }} />
              <View
                style={{
                  backgroundColor: T.accentColor,
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text
                  style={{ color: T.bgColor, fontSize: 9, fontWeight: "900" }}
                >
                  LIVE
                </Text>
              </View>
            </View>
            <View style={{ marginTop: 10 }}>
              <ChatPreview theme={T} />
            </View>
          </View>
        </View>

        {/* ── 1. Theme Presets ── */}
        <Section title="🎨  THEME PRESETS">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
          >
            {Object.entries(PRESETS).map(([name, preset]) => {
              const isActive = T.presetName === name;
              return (
                <TouchableOpacity
                  key={name}
                  onPress={() => {
                    applyPreset(name);
                    setBgTab(preset.chatBackground.type);
                  }}
                  activeOpacity={0.85}
                  style={[
                    cs.presetCard,
                    {
                      backgroundColor: preset.cardColor,
                      borderColor: isActive
                        ? preset.accentColor
                        : preset.borderColor,
                      borderWidth: isActive ? 2 : 1,
                    },
                  ]}
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: preset.accentColor,
                      marginBottom: 6,
                      shadowColor: preset.accentColor,
                      shadowOpacity: 0.7,
                      shadowRadius: 6,
                    }}
                  />
                  <Text
                    style={{
                      color: isActive ? preset.accentColor : preset.textPrimary,
                      fontSize: 11,
                      fontWeight: "800",
                    }}
                  >
                    {name}
                  </Text>
                  {isActive && (
                    <View
                      style={{
                        marginTop: 4,
                        backgroundColor: preset.accentColor,
                        borderRadius: 4,
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                      }}
                    >
                      <Text
                        style={{
                          color: preset.bgColor,
                          fontSize: 8,
                          fontWeight: "900",
                        }}
                      >
                        ACTIVE
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Section>

        {/* ── 2. Accent Color ── */}
        <Section title="💡  ACCENT COLOR">
          <View style={cs.swatchRow}>
            {ACCENT_OPTIONS.map((a) => (
              <ColorDot
                key={a.color}
                color={a.color}
                selected={T.accentColor === a.color}
                onPress={() =>
                  updateField("accentColor", a.color as AccentColor)
                }
                size={40}
                label={a.label}
              />
            ))}
          </View>
        </Section>

        {/* ── 3. Chat Background ── */}
        <Section title="💬  CHAT BACKGROUND">
          {/* Sub-tabs */}
          <View
            style={[
              cs.tabRow,
              { backgroundColor: T.cardColor, borderColor: T.borderColor },
            ]}
          >
            {(["color", "gradient", "image"] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[
                  cs.tab,
                  bgTab === tab && {
                    backgroundColor: T.accentColor,
                  },
                ]}
                onPress={() => setBgTab(tab)}
              >
                <Text
                  style={[
                    cs.tabTxt,
                    {
                      color: bgTab === tab ? T.bgColor : T.textSecondary,
                    },
                  ]}
                >
                  {tab === "color"
                    ? "⬛ Solid"
                    : tab === "gradient"
                      ? "🌈 Gradient"
                      : "🖼️ Image"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {bgTab === "color" && (
            <View style={cs.swatchGrid}>
              {SOLID_BG_OPTIONS.map((opt) => {
                const active =
                  T.chatBackground.type === "color" &&
                  T.chatBackground.color === opt.color;
                return (
                  <TouchableOpacity
                    key={opt.color}
                    onPress={() =>
                      updateField("chatBackground", {
                        type: "color",
                        color: opt.color,
                      })
                    }
                    activeOpacity={0.85}
                    style={{ alignItems: "center", gap: 4 }}
                  >
                    <View
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 14,
                        backgroundColor: opt.color,
                        borderWidth: active ? 2.5 : 1.5,
                        borderColor: active
                          ? T.accentColor
                          : "rgba(255,255,255,0.12)",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      {active && (
                        <Ionicons
                          name="checkmark-circle"
                          size={22}
                          color={T.accentColor}
                        />
                      )}
                    </View>
                    <Text
                      style={{
                        fontSize: 9,
                        fontWeight: "700",
                        color: active ? T.accentColor : T.textSecondary,
                      }}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {bgTab === "gradient" && (
            <View style={cs.swatchGrid}>
              {GRADIENT_OPTIONS.map((g) => {
                const active =
                  T.chatBackground.type === "gradient" &&
                  T.chatBackground.color === g.color;
                return (
                  <GradientSwatch
                    key={g.color}
                    color={g.color}
                    color2={g.color2}
                    label={g.label}
                    selected={active}
                    onPress={() =>
                      updateField("chatBackground", {
                        type: "gradient",
                        color: g.color,
                        color2: g.color2,
                      })
                    }
                  />
                );
              })}
            </View>
          )}

          {bgTab === "image" && (
            <View style={{ gap: 12 }}>
              {T.chatBackground.type === "image" &&
              T.chatBackground.imageUri ? (
                <View style={cs.imagePreviewBox}>
                  <Image
                    source={{ uri: T.chatBackground.imageUri }}
                    style={cs.imagePreview}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    style={cs.removeImgBtn}
                    onPress={() => {
                      updateField("chatBackground", {
                        type: "color",
                        color: "#0d0d0f",
                      });
                      setBgTab("color");
                    }}
                  >
                    <Ionicons name="close-circle" size={22} color="#ff4f4f" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View
                  style={[
                    cs.imageDropZone,
                    {
                      backgroundColor: T.cardColor,
                      borderColor: T.borderColor,
                    },
                  ]}
                >
                  <Ionicons
                    name="image-outline"
                    size={32}
                    color={T.textSecondary}
                  />
                  <Text
                    style={{
                      color: T.textSecondary,
                      fontSize: 12,
                      marginTop: 6,
                    }}
                  >
                    No image selected
                  </Text>
                </View>
              )}
              <TouchableOpacity
                style={[
                  cs.pickImageBtn,
                  { backgroundColor: T.accentColor },
                  pickingImage && { opacity: 0.6 },
                ]}
                onPress={pickChatImage}
                disabled={pickingImage}
                activeOpacity={0.85}
              >
                {pickingImage ? (
                  <ActivityIndicator color={T.bgColor} size="small" />
                ) : (
                  <>
                    <Ionicons
                      name="folder-open-outline"
                      size={18}
                      color={T.bgColor}
                    />
                    <Text style={[cs.pickImageTxt, { color: T.bgColor }]}>
                      Choose from Gallery
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </Section>

        {/* ── 4. Bubble Style ── */}
        <Section title="💭  BUBBLE STYLE">
          <View style={cs.bubbleRow}>
            {(
              [
                { v: "rounded", label: "Rounded", icon: "⬜" },
                { v: "pill", label: "Pill", icon: "💊" },
                { v: "sharp", label: "Sharp", icon: "⬛" },
              ] as { v: BubbleStyle; label: string; icon: string }[]
            ).map((opt) => (
              <TouchableOpacity
                key={opt.v}
                style={[
                  cs.bubbleOption,
                  {
                    backgroundColor:
                      T.bubbleStyle === opt.v ? T.accentColor : T.cardColor,
                    borderColor:
                      T.bubbleStyle === opt.v ? T.accentColor : T.borderColor,
                  },
                ]}
                onPress={() => updateField("bubbleStyle", opt.v)}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 20 }}>{opt.icon}</Text>
                <Text
                  style={{
                    color: T.bubbleStyle === opt.v ? T.bgColor : T.textPrimary,
                    fontSize: 12,
                    fontWeight: "700",
                    marginTop: 4,
                  }}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        {/* ── 5. Bubble Colors ── */}
        <Section title="🎨  BUBBLE COLORS">
          {/* My bubble */}
          <View
            style={[
              cs.colorRow,
              { backgroundColor: T.cardColor, borderColor: T.borderColor },
            ]}
          >
            <View style={cs.colorRowLeft}>
              <View
                style={[
                  cs.bubbleDemoMy,
                  {
                    backgroundColor: T.myBubbleColor,
                    borderRadius:
                      T.bubbleStyle === "pill"
                        ? 20
                        : T.bubbleStyle === "sharp"
                          ? 4
                          : 12,
                  },
                ]}
              >
                <Text
                  style={{
                    color: T.myBubbleTextColor,
                    fontSize: 11,
                    fontWeight: "600",
                  }}
                >
                  My message
                </Text>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, alignItems: "center" }}
            >
              {ACCENT_OPTIONS.map((a) => (
                <ColorDot
                  key={a.color}
                  color={a.color}
                  selected={T.myBubbleColor === a.color}
                  onPress={() => updateField("myBubbleColor", a.color)}
                  size={28}
                />
              ))}
            </ScrollView>
          </View>

          {/* Their bubble */}
          <View
            style={[
              cs.colorRow,
              {
                backgroundColor: T.cardColor,
                borderColor: T.borderColor,
                marginTop: 10,
              },
            ]}
          >
            <View style={cs.colorRowLeft}>
              <View
                style={[
                  cs.bubbleDemoThem,
                  {
                    backgroundColor: T.theirBubbleColor,
                    borderRadius:
                      T.bubbleStyle === "pill"
                        ? 20
                        : T.bubbleStyle === "sharp"
                          ? 4
                          : 12,
                    borderWidth: 1,
                    borderColor: T.borderColor,
                  },
                ]}
              >
                <Text
                  style={{
                    color: T.theirBubbleTextColor,
                    fontSize: 11,
                    fontWeight: "600",
                  }}
                >
                  Their msg
                </Text>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, alignItems: "center" }}
            >
              {[
                "#1c1d23",
                "#121828",
                "#1e1118",
                "#08182c",
                "#0a1525",
                "#1e1440",
                "#112018",
                "#13080a",
              ].map((c) => (
                <ColorDot
                  key={c}
                  color={c}
                  selected={T.theirBubbleColor === c}
                  onPress={() => updateField("theirBubbleColor", c)}
                  size={28}
                />
              ))}
            </ScrollView>
          </View>
        </Section>

        {/* ── 6. Typography ── */}
        <Section title="✍️  FONT SIZE">
          <View style={cs.fontRow}>
            {(
              [
                { v: "sm", label: "Small", sample: "Aa", size: 13 },
                { v: "md", label: "Medium", sample: "Aa", size: 16 },
                { v: "lg", label: "Large", sample: "Aa", size: 20 },
              ] as {
                v: FontSize;
                label: string;
                sample: string;
                size: number;
              }[]
            ).map((opt) => (
              <TouchableOpacity
                key={opt.v}
                style={[
                  cs.fontOption,
                  {
                    backgroundColor:
                      T.fontSize === opt.v ? T.accentColor : T.cardColor,
                    borderColor:
                      T.fontSize === opt.v ? T.accentColor : T.borderColor,
                  },
                ]}
                onPress={() => updateField("fontSize", opt.v)}
                activeOpacity={0.85}
              >
                <Text
                  style={{
                    fontSize: opt.size,
                    fontWeight: "900",
                    color: T.fontSize === opt.v ? T.bgColor : T.textPrimary,
                  }}
                >
                  {opt.sample}
                </Text>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "700",
                    color: T.fontSize === opt.v ? T.bgColor : T.textSecondary,
                    marginTop: 4,
                  }}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        {/* ── 7. UI Colors ── */}
        <Section title="🖥️  UI BACKGROUND">
          <View style={cs.swatchRow}>
            {[
              "#0d0d0f",
              "#07090f",
              "#0a0a0a",
              "#050d0a",
              "#0a0614",
              "#130808",
              "#080808",
              "#060e16",
            ].map((c) => (
              <ColorDot
                key={c}
                color={c}
                selected={T.bgColor === c}
                onPress={() => updateField("bgColor", c)}
                size={36}
              />
            ))}
          </View>
        </Section>

        {/* Apply note */}
        <View
          style={[
            cs.noteBox,
            { backgroundColor: T.cardColor, borderColor: T.accentColor + "44" },
          ]}
        >
          <Ionicons
            name="information-circle-outline"
            size={16}
            color={T.accentColor}
          />
          <Text style={[cs.noteTxt, { color: T.textSecondary }]}>
            Changes apply live. Chat screens will reflect your background &
            bubble preferences immediately.
          </Text>
        </View>

        {/* Reset full */}
        <TouchableOpacity
          style={[cs.fullResetBtn, { borderColor: "#ff4f4f44" }]}
          onPress={() => {
            Alert.alert(
              "Reset to Default",
              "This will restore all appearance settings to the Dark Lime theme.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Reset Everything",
                  style: "destructive",
                  onPress: () => {
                    resetToDefault();
                    setBgTab("color");
                  },
                },
              ],
            );
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="refresh-circle-outline" size={18} color="#ff4f4f" />
          <Text style={cs.fullResetTxt}>Reset All to Default</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────
const cs = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 18, paddingTop: 0, paddingBottom: 40 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 56,
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 1,
    letterSpacing: 0.5,
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  resetTxt: { fontSize: 11, fontWeight: "700" },

  // Preview
  previewWrap: { marginTop: 20 },
  previewLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 8,
  },
  screenPreview: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },

  // Section
  section: { marginTop: 22 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    color: "#6b6d7a",
    marginBottom: 12,
  },

  // Presets
  presetCard: {
    width: 80,
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
  },

  // Color swatch row
  swatchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  swatchGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  // Background tabs
  tabRow: {
    flexDirection: "row",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
    borderRadius: 12,
    margin: 3,
  },
  tabTxt: { fontSize: 11, fontWeight: "700" },

  // Image bg
  imagePreviewBox: {
    borderRadius: 14,
    overflow: "hidden",
    height: 120,
    position: "relative",
  },
  imagePreview: {
    width: "100%",
    height: "100%",
  },
  removeImgBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 12,
  },
  imageDropZone: {
    height: 100,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
  },
  pickImageBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 13,
  },
  pickImageTxt: { fontSize: 14, fontWeight: "900" },

  // Bubble style
  bubbleRow: {
    flexDirection: "row",
    gap: 10,
  },
  bubbleOption: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  // Bubble colors
  colorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  colorRowLeft: { width: 90 },
  bubbleDemoMy: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-end",
  },
  bubbleDemoThem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },

  // Font
  fontRow: {
    flexDirection: "row",
    gap: 10,
  },
  fontOption: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  // Note
  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 24,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  noteTxt: { fontSize: 12, flex: 1, lineHeight: 18 },

  // Full reset
  fullResetBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
  },
  fullResetTxt: {
    color: "#ff4f4f",
    fontSize: 14,
    fontWeight: "700",
  },
});
