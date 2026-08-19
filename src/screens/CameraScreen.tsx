import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  Dimensions,
  Image,
  ActivityIndicator,
  ScrollView,
  PanResponder,
  Animated,
} from "react-native";
import {
  CameraView,
  CameraType,
  FlashMode,
  useCameraPermissions,
} from "expo-camera";
import * as MediaLibrary from "expo-media-library";
import { Ionicons } from "@expo/vector-icons";

const { width, height } = Dimensions.get("window");

// ── Design tokens ──────────────────────────────────────────
const C = {
  bg: "#0a0a0c",
  card: "#141418",
  lime: "#c8f135",
  pink: "#ff6b9d",
  purple: "#a78bfa",
  cyan: "#22d3ee",
  white: "#f5f5f7",
  muted: "#5a5c6a",
  border: "#1e1f28",
  danger: "#ff4f4f",
  glass: "rgba(255,255,255,0.08)",
  glassBorder: "rgba(255,255,255,0.14)",
};

// ── Filter definitions ─────────────────────────────────────
type FilterKey = "none" | "warm" | "cool" | "bw" | "fade" | "vivid";

interface FilterDef {
  key: FilterKey;
  label: string;
  emoji: string;
  overlayColor?: string;
  overlayOpacity?: number;
  saturation?: number; // CSS filter hint (for preview tiles only)
  brightness?: number;
  description: string;
  // For actual image overlay approach
  tintColor?: string;
  tintOpacity?: number;
  // CSS-like filter string for web preview strips
  cssFilter?: string;
}

const FILTERS: FilterDef[] = [
  {
    key: "none",
    label: "Original",
    emoji: "✨",
    description: "No filter",
    cssFilter: "none",
  },
  {
    key: "warm",
    label: "Golden",
    emoji: "🌅",
    description: "Warm sunset tones",
    tintColor: "#ff8c42",
    tintOpacity: 0.22,
    cssFilter: "sepia(0.4) saturate(1.3) brightness(1.05)",
  },
  {
    key: "cool",
    label: "Arctic",
    emoji: "🧊",
    description: "Cool blue tones",
    tintColor: "#4fc3f7",
    tintOpacity: 0.2,
    cssFilter: "saturate(0.85) hue-rotate(20deg) brightness(1.05)",
  },
  {
    key: "bw",
    label: "Mono",
    emoji: "🎞️",
    description: "Black & white",
    tintColor: "#888888",
    tintOpacity: 0.0,
    cssFilter: "grayscale(1) contrast(1.1)",
  },
  {
    key: "fade",
    label: "Faded",
    emoji: "🌫️",
    description: "Washed-out film",
    tintColor: "#fff8f0",
    tintOpacity: 0.28,
    cssFilter: "saturate(0.6) brightness(1.12) contrast(0.88)",
  },
  {
    key: "vivid",
    label: "Vivid",
    emoji: "🔥",
    description: "Punchy & saturated",
    tintColor: "#ff4081",
    tintOpacity: 0.1,
    cssFilter: "saturate(1.8) contrast(1.1) brightness(1.02)",
  },
];

// ── Sticker definitions ────────────────────────────────────
const STICKER_PACKS = {
  "🎭 Mood": ["😍", "🥰", "😎", "🤩", "🥳", "😜", "🤪", "😇", "🥺", "😤"],
  "🌈 Vibes": ["✨", "💫", "⭐", "🌟", "💥", "🎉", "🎊", "🔥", "💎", "👑"],
  "🌸 Nature": ["🌸", "🌺", "🌹", "🌻", "🍀", "🌿", "🦋", "🌈", "☀️", "🌙"],
  "💬 Text": ["💯", "❤️", "💔", "💕", "💖", "🫶", "👏", "🙌", "✌️", "🤙"],
};

interface PlacedSticker {
  id: string;
  emoji: string;
  x: Animated.Value;
  y: Animated.Value;
  scale: Animated.Value;
  rotation: Animated.Value;
}

// ── Draggable Sticker component ────────────────────────────
function DraggableSticker({
  sticker,
  onRemove,
  isSelected,
  onSelect,
}: {
  sticker: PlacedSticker;
  onRemove: (id: string) => void;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const lastOffset = useRef({ x: 0, y: 0 });
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        onSelect(sticker.id);
        sticker.x.stopAnimation((val) => {
          lastOffset.current.x = val;
        });
        sticker.y.stopAnimation((val) => {
          lastOffset.current.y = val;
        });
      },
      onPanResponderMove: (_, gesture) => {
        sticker.x.setValue(lastOffset.current.x + gesture.dx);
        sticker.y.setValue(lastOffset.current.y + gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        lastOffset.current.x += gesture.dx;
        lastOffset.current.y += gesture.dy;
      },
    }),
  ).current;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        ss.stickerItem,
        {
          transform: [
            { translateX: sticker.x },
            { translateY: sticker.y },
            { scale: sticker.scale },
          ],
          borderWidth: isSelected ? 1.5 : 0,
          borderColor: isSelected ? C.lime : "transparent",
          borderStyle: "dashed",
          borderRadius: 8,
        },
      ]}
    >
      <Text style={ss.stickerText}>{sticker.emoji}</Text>
      {isSelected && (
        <TouchableOpacity
          style={ss.stickerRemove}
          onPress={() => onRemove(sticker.id)}
        >
          <Ionicons name="close-circle" size={18} color={C.danger} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

// ── Main export ────────────────────────────────────────────
export default function CameraScreen({ navigation }: { navigation: any }) {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] =
    MediaLibrary.usePermissions();

  const [facing, setFacing] = useState<CameraType>("back");
  const [flash, setFlash] = useState<FlashMode>("off");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<"photo" | "video">("photo");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"photo" | "video">("photo");

  // Filter state
  const [activeFilter, setActiveFilter] = useState<FilterKey>("none");
  const [showFilters, setShowFilters] = useState(false);

  // Sticker state
  const [showStickerPanel, setShowStickerPanel] = useState(false);
  const [activeStickerPack, setActiveStickerPack] = useState("🎭 Mood");
  const [placedStickers, setPlacedStickers] = useState<PlacedSticker[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(
    null,
  );

  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Panels are mutually exclusive
  const toggleFilters = () => {
    setShowFilters((v) => !v);
    setShowStickerPanel(false);
  };
  const toggleStickers = () => {
    setShowStickerPanel((v) => !v);
    setShowFilters(false);
  };

  useEffect(() => {
    (async () => {
      if (!cameraPermission?.granted) await requestCameraPermission();
      if (!mediaPermission?.granted) await requestMediaPermission();
    })();
  }, []);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(
        () => setRecordingTime((t) => t + 1),
        1000,
      );
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordingTime(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)
      .toString()
      .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.92,
        skipProcessing: false,
      });
      if (photo?.uri) {
        setPreviewUri(photo.uri);
        setPreviewType("photo");
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const startRecording = async () => {
    if (!cameraRef.current || isRecording) return;
    setIsRecording(true);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: 60 });
      if (video?.uri) {
        setPreviewUri(video.uri);
        setPreviewType("video");
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (!cameraRef.current || !isRecording) return;
    cameraRef.current.stopRecording();
    setIsRecording(false);
  };

  const saveToGallery = async () => {
    if (!previewUri) return;
    setSaving(true);
    try {
      const asset = await MediaLibrary.createAssetAsync(previewUri);
      try {
        const album = await MediaLibrary.getAlbumAsync("FitApp");
        if (album) {
          await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        } else {
          await MediaLibrary.createAlbumAsync("FitApp", asset, false);
        }
      } catch (_) {}
      Alert.alert("✅ Saved!", "Saved to your gallery.", [
        {
          text: "Take Another",
          onPress: () => {
            setPreviewUri(null);
            setPlacedStickers([]);
          },
        },
        { text: "Done", onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert("Save failed", e.message);
    } finally {
      setSaving(false);
    }
  };

  const addSticker = (emoji: string) => {
    const newSticker: PlacedSticker = {
      id: Date.now().toString(),
      emoji,
      x: new Animated.Value(width / 2 - 30 + (Math.random() - 0.5) * 100),
      y: new Animated.Value(height / 2 - 30 + (Math.random() - 0.5) * 100),
      scale: new Animated.Value(1),
      rotation: new Animated.Value(0),
    };
    setPlacedStickers((prev) => [...prev, newSticker]);
    setSelectedStickerId(newSticker.id);
  };

  const removeSticker = (id: string) => {
    setPlacedStickers((prev) => prev.filter((s) => s.id !== id));
    setSelectedStickerId(null);
  };

  const currentFilter = FILTERS.find((f) => f.key === activeFilter)!;

  // ── Permission gates ──────────────────────────────────────
  if (!cameraPermission) {
    return (
      <View style={cs.center}>
        <ActivityIndicator color={C.lime} size="large" />
      </View>
    );
  }

  if (!cameraPermission.granted) {
    return (
      <View style={cs.center}>
        <View style={cs.permIcon}>
          <Ionicons name="camera-outline" size={36} color={C.lime} />
        </View>
        <Text style={cs.permTitle}>Camera Access Required</Text>
        <Text style={cs.permSub}>
          Allow camera access to take photos and videos
        </Text>
        <TouchableOpacity style={cs.permBtn} onPress={requestCameraPermission}>
          <Text style={cs.permBtnTxt}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={cs.permBack}
          onPress={() => navigation.goBack()}
        >
          <Text style={cs.permBackTxt}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Preview screen ─────────────────────────────────────────
  if (previewUri) {
    return (
      <View style={cs.root}>
        <StatusBar barStyle="light-content" />

        {/* Base image */}
        <Image
          source={{ uri: previewUri }}
          style={cs.preview}
          resizeMode="cover"
        />

        {/* Filter overlay */}
        {currentFilter.key === "bw" && (
          <View
            style={[
              cs.filterOverlay,
              {
                backgroundColor: "transparent",
                // RN doesn't support CSS grayscale; use a semi-transparent
                // dark overlay as approximation. Real B&W requires GL shader.
              },
            ]}
            pointerEvents="none"
          >
            {/* Greyscale approximation: white overlay with multiply-like effect */}
            <View
              style={[
                StyleSheet.absoluteFillObject,
                {
                  backgroundColor: "rgba(0,0,0,0.0)",
                  // Hint: implement with react-native-image-filter-kit for real grayscale
                },
              ]}
            />
          </View>
        )}
        {currentFilter.tintColor && currentFilter.tintOpacity! > 0 && (
          <View
            style={[
              cs.filterOverlay,
              {
                backgroundColor: currentFilter.tintColor,
                opacity: currentFilter.tintOpacity,
              },
            ]}
            pointerEvents="none"
          />
        )}

        {/* Placed stickers on preview */}
        {placedStickers.map((s) => (
          <DraggableSticker
            key={s.id}
            sticker={s}
            onRemove={removeSticker}
            isSelected={selectedStickerId === s.id}
            onSelect={setSelectedStickerId}
          />
        ))}

        {/* Filter badge */}
        {activeFilter !== "none" && (
          <View style={cs.filterBadge}>
            <Text style={cs.filterBadgeEmoji}>{currentFilter.emoji}</Text>
            <Text style={cs.filterBadgeTxt}>{currentFilter.label}</Text>
          </View>
        )}

        {/* Top bar */}
        <View style={cs.previewTop}>
          <TouchableOpacity
            style={cs.iconBtnDark}
            onPress={() => {
              setPreviewUri(null);
              setPlacedStickers([]);
            }}
          >
            <Ionicons name="close" size={22} color={C.white} />
          </TouchableOpacity>
          <Text style={cs.previewLabel}>
            {previewType === "photo" ? "📸 Preview" : "🎬 Preview"}
          </Text>
          <View style={{ width: 42 }} />
        </View>

        {/* Sticker add panel on preview too */}
        {showStickerPanel && (
          <View style={cs.stickerPanel}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
            >
              {Object.keys(STICKER_PACKS).map((pack) => (
                <TouchableOpacity
                  key={pack}
                  style={[
                    cs.packTab,
                    activeStickerPack === pack && cs.packTabActive,
                  ]}
                  onPress={() => setActiveStickerPack(pack)}
                >
                  <Text style={cs.packTabTxt}>{pack.split(" ")[0]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
              style={{ marginTop: 8 }}
            >
              {STICKER_PACKS[
                activeStickerPack as keyof typeof STICKER_PACKS
              ].map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={cs.emojiBtn}
                  onPress={() => addSticker(emoji)}
                >
                  <Text style={cs.emojiTxt}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Bottom actions */}
        <View style={cs.previewBottom}>
          <View style={cs.previewTools}>
            <TouchableOpacity
              style={[cs.toolBtn, showStickerPanel && cs.toolBtnActive]}
              onPress={toggleStickers}
            >
              <Text style={cs.toolBtnEmoji}>😊</Text>
              <Text
                style={[cs.toolBtnTxt, showStickerPanel && { color: C.lime }]}
              >
                Sticker
              </Text>
            </TouchableOpacity>
            {placedStickers.length > 0 && (
              <TouchableOpacity
                style={cs.toolBtn}
                onPress={() => {
                  setPlacedStickers([]);
                  setSelectedStickerId(null);
                }}
              >
                <Text style={cs.toolBtnEmoji}>🗑️</Text>
                <Text style={cs.toolBtnTxt}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={cs.previewActions}>
            <TouchableOpacity
              style={cs.discardBtn}
              onPress={() => {
                setPreviewUri(null);
                setPlacedStickers([]);
              }}
            >
              <Ionicons name="refresh" size={18} color={C.white} />
              <Text style={cs.discardTxt}>Retake</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[cs.saveBtn, saving && { opacity: 0.6 }]}
              onPress={saveToGallery}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={C.bg} size="small" />
              ) : (
                <>
                  <Ionicons name="download-outline" size={18} color={C.bg} />
                  <Text style={cs.saveTxt}>Save</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ── Main camera view ──────────────────────────────────────
  return (
    <View style={cs.root}>
      <StatusBar barStyle="light-content" />

      <CameraView
        ref={cameraRef}
        style={cs.camera}
        facing={facing}
        flash={flash}
        mode={mode}
      >
        {/* Filter tint overlay on live viewfinder */}
        {currentFilter.tintColor && currentFilter.tintOpacity! > 0 && (
          <View
            style={[
              cs.filterOverlay,
              {
                backgroundColor: currentFilter.tintColor,
                opacity: currentFilter.tintOpacity,
              },
            ]}
            pointerEvents="none"
          />
        )}

        {/* Placed stickers floating on camera */}
        {placedStickers.map((s) => (
          <DraggableSticker
            key={s.id}
            sticker={s}
            onRemove={removeSticker}
            isSelected={selectedStickerId === s.id}
            onSelect={setSelectedStickerId}
          />
        ))}

        {/* ── Top bar ── */}
        <View style={cs.topBar}>
          <TouchableOpacity
            style={cs.iconBtnDark}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="close" size={22} color={C.white} />
          </TouchableOpacity>

          <View style={cs.topCenter}>
            {isRecording && (
              <View style={cs.timerBadge}>
                <View style={cs.recDot} />
                <Text style={cs.timerTxt}>{formatTime(recordingTime)}</Text>
              </View>
            )}
            {!isRecording && activeFilter !== "none" && (
              <View style={cs.liveFilterBadge}>
                <Text style={cs.liveFilterEmoji}>{currentFilter.emoji}</Text>
                <Text style={cs.liveFilterTxt}>{currentFilter.label}</Text>
              </View>
            )}
          </View>

          {/* Flash toggle */}
          <TouchableOpacity
            style={cs.iconBtnDark}
            onPress={() =>
              setFlash((f) =>
                f === "off" ? "on" : f === "on" ? "auto" : "off",
              )
            }
          >
            <Ionicons
              name={flash === "off" ? "flash-off-outline" : "flash-outline"}
              size={20}
              color={flash === "off" ? C.muted : C.lime}
            />
          </TouchableOpacity>
        </View>

        {/* ── Right sidebar: tool buttons ── */}
        <View style={cs.sidebar}>
          {/* Sticker button */}
          <TouchableOpacity
            style={[cs.sideBtn, showStickerPanel && cs.sideBtnActive]}
            onPress={toggleStickers}
          >
            <Text style={cs.sideBtnEmoji}>😊</Text>
          </TouchableOpacity>

          {/* Filter button */}
          <TouchableOpacity
            style={[cs.sideBtn, showFilters && cs.sideBtnActive]}
            onPress={toggleFilters}
          >
            <Text style={cs.sideBtnEmoji}>🎨</Text>
          </TouchableOpacity>

          {/* Sticker count indicator */}
          {placedStickers.length > 0 && (
            <TouchableOpacity
              style={cs.sideBtn}
              onPress={() => {
                setPlacedStickers([]);
                setSelectedStickerId(null);
              }}
            >
              <Text style={cs.sideBtnEmoji}>🗑️</Text>
              <Text style={cs.sideBtnCount}>{placedStickers.length}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Filter strip (slides up from bottom) ── */}
        {showFilters && (
          <View style={cs.filterStrip}>
            <Text style={cs.filterStripTitle}>Filter</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            >
              {FILTERS.map((filter) => (
                <TouchableOpacity
                  key={filter.key}
                  style={[
                    cs.filterThumb,
                    activeFilter === filter.key && cs.filterThumbActive,
                  ]}
                  onPress={() => setActiveFilter(filter.key)}
                >
                  {/* Color swatch preview */}
                  <View
                    style={[
                      cs.filterSwatch,
                      filter.tintColor
                        ? {
                            backgroundColor: filter.tintColor,
                            opacity: 0.85,
                          }
                        : filter.key === "bw"
                          ? {
                              backgroundColor: "#666",
                            }
                          : {
                              backgroundColor: C.glass,
                            },
                    ]}
                  >
                    <Text style={cs.filterSwatchEmoji}>{filter.emoji}</Text>
                  </View>
                  <Text
                    style={[
                      cs.filterLabel,
                      activeFilter === filter.key && cs.filterLabelActive,
                    ]}
                  >
                    {filter.label}
                  </Text>
                  {activeFilter === filter.key && (
                    <View style={cs.filterActiveDot} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Sticker panel ── */}
        {showStickerPanel && (
          <View style={cs.stickerPanel}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
            >
              {Object.keys(STICKER_PACKS).map((pack) => (
                <TouchableOpacity
                  key={pack}
                  style={[
                    cs.packTab,
                    activeStickerPack === pack && cs.packTabActive,
                  ]}
                  onPress={() => setActiveStickerPack(pack)}
                >
                  <Text style={cs.packTabTxt}>{pack}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
              style={{ marginTop: 8 }}
            >
              {STICKER_PACKS[
                activeStickerPack as keyof typeof STICKER_PACKS
              ].map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={cs.emojiBtn}
                  onPress={() => addSticker(emoji)}
                >
                  <Text style={cs.emojiTxt}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Bottom controls ── */}
        <View
          style={[
            cs.bottomBar,
            (showFilters || showStickerPanel) && cs.bottomBarRaised,
          ]}
        >
          {/* Mode switcher */}
          <View style={cs.modeRow}>
            {(["photo", "video"] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={[cs.modeChip, mode === m && cs.modeChipActive]}
                onPress={() => {
                  if (!isRecording) setMode(m);
                }}
              >
                <Text style={[cs.modeChipTxt, mode === m && { color: C.bg }]}>
                  {m === "photo" ? "📸 Photo" : "🎬 Video"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Shutter row */}
          <View style={cs.shutterRow}>
            <View style={{ width: 52 }} />

            {mode === "photo" ? (
              <TouchableOpacity style={cs.shutter} onPress={takePhoto}>
                <View style={cs.shutterInner} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[cs.shutter, isRecording && cs.shutterRecording]}
                onPress={isRecording ? stopRecording : startRecording}
              >
                <View
                  style={[
                    cs.shutterInner,
                    isRecording && cs.shutterInnerRecording,
                  ]}
                />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={cs.flipBtn}
              onPress={() =>
                setFacing((f) => (f === "back" ? "front" : "back"))
              }
            >
              <Ionicons
                name="camera-reverse-outline"
                size={26}
                color={C.white}
              />
            </TouchableOpacity>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────
const cs = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    padding: 32,
  },
  camera: { flex: 1 },
  filterOverlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: "none",
  },

  // Permission screen
  permIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: C.card,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.glassBorder,
    marginBottom: 8,
  },
  permTitle: {
    color: C.white,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  permSub: {
    color: C.muted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 260,
  },
  permBtn: {
    backgroundColor: C.lime,
    borderRadius: 16,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginTop: 8,
  },
  permBtnTxt: {
    color: C.bg,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  permBack: { marginTop: 4 },
  permBackTxt: { color: C.muted, fontSize: 13 },

  // Top bar
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  topCenter: {
    flex: 1,
    alignItems: "center",
  },
  iconBtnDark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,80,80,0.3)",
  },
  recDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.danger,
  },
  timerTxt: { color: C.white, fontSize: 13, fontWeight: "800" },

  // Live filter badge
  liveFilterBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(200,241,53,0.3)",
  },
  liveFilterEmoji: { fontSize: 13 },
  liveFilterTxt: { color: C.lime, fontSize: 12, fontWeight: "700" },

  // Right sidebar
  sidebar: {
    position: "absolute",
    right: 16,
    top: height * 0.25,
    gap: 12,
    alignItems: "center",
  },
  sideBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.glassBorder,
    position: "relative",
  },
  sideBtnActive: {
    backgroundColor: "rgba(200,241,53,0.15)",
    borderColor: C.lime,
  },
  sideBtnEmoji: { fontSize: 22 },
  sideBtnCount: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: C.lime,
    color: C.bg,
    fontSize: 9,
    fontWeight: "900",
    width: 16,
    height: 16,
    borderRadius: 8,
    textAlign: "center",
    lineHeight: 16,
  },

  // Filter strip
  filterStrip: {
    position: "absolute",
    bottom: 180,
    left: 0,
    right: 0,
    backgroundColor: "rgba(10,10,12,0.88)",
    paddingTop: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: C.glassBorder,
  },
  filterStripTitle: {
    color: C.white,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    paddingHorizontal: 16,
    marginBottom: 10,
    opacity: 0.5,
  },
  filterThumb: {
    alignItems: "center",
    gap: 6,
    opacity: 0.65,
  },
  filterThumbActive: { opacity: 1 },
  filterSwatch: {
    width: 58,
    height: 58,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  filterSwatchEmoji: { fontSize: 26 },
  filterLabel: {
    color: C.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  filterLabelActive: { color: C.lime },
  filterActiveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.lime,
    marginTop: -2,
  },

  // Sticker panel
  stickerPanel: {
    position: "absolute",
    bottom: 180,
    left: 0,
    right: 0,
    backgroundColor: "rgba(10,10,12,0.92)",
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: C.glassBorder,
  },
  packTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
  },
  packTabActive: {
    backgroundColor: "rgba(200,241,53,0.15)",
    borderColor: C.lime,
  },
  packTabTxt: { color: C.white, fontSize: 12, fontWeight: "700" },
  emojiBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: C.glass,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.glassBorder,
  },
  emojiTxt: { fontSize: 28 },

  // Bottom bar
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 44,
    paddingHorizontal: 24,
    paddingTop: 16,
    backgroundColor: "rgba(0,0,0,0.4)",
    gap: 16,
  },
  bottomBarRaised: {
    // panels push content up slightly via absolute positioning
  },
  modeRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  modeChip: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  modeChipActive: { backgroundColor: C.lime, borderColor: C.lime },
  modeChipTxt: { color: C.white, fontSize: 13, fontWeight: "700" },

  shutterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3.5,
    borderColor: C.white,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: C.white,
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  shutterRecording: { borderColor: C.danger },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: C.white,
  },
  shutterInnerRecording: {
    width: 26,
    height: 26,
    borderRadius: 5,
    backgroundColor: C.danger,
  },
  flipBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.glassBorder,
  },

  // Placed stickers
  // Preview
  preview: { flex: 1, width: "100%", height: "100%" },
  filterBadge: {
    position: "absolute",
    top: 120,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  filterBadgeEmoji: { fontSize: 14 },
  filterBadgeTxt: { color: C.lime, fontSize: 12, fontWeight: "800" },

  previewTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  previewLabel: { color: C.white, fontSize: 15, fontWeight: "800" },
  previewBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 44,
    backgroundColor: "rgba(0,0,0,0.55)",
    gap: 12,
  },
  previewTools: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
  toolBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
  },
  toolBtnActive: {
    backgroundColor: "rgba(200,241,53,0.12)",
    borderColor: C.lime,
  },
  toolBtnEmoji: { fontSize: 16 },
  toolBtnTxt: { color: C.white, fontSize: 12, fontWeight: "700" },

  previewActions: {
    flexDirection: "row",
    gap: 12,
  },
  discardBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: C.glassBorder,
  },
  discardTxt: { color: C.white, fontSize: 14, fontWeight: "700" },
  saveBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: C.lime,
    borderRadius: 16,
    paddingVertical: 14,
  },
  saveTxt: { color: C.bg, fontSize: 14, fontWeight: "900" },
});

// ── DraggableSticker styles ────────────────────────────────
const ss = StyleSheet.create({
  stickerItem: {
    position: "absolute",
    padding: 4,
  },
  stickerText: { fontSize: 48 },
  stickerRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: C.bg,
    borderRadius: 10,
  },
});
