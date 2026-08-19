import React, { useState } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  Text,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Video, ResizeMode } from "expo-av";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const C = {
  bg: "#0d0d0f",
  card: "#1c1d23",
  cardAlt: "#212330",
  lime: "#c8f135",
  white: "#f2f2f4",
  muted: "#6b6d7a",
  border: "#26272f",
  danger: "#ff4f4f",
};

// ── Type for a media item ─────────────────────────────────
type MediaItem = { uri: string; type: "image" | "video" };

export default function SharingEdit({ navigation }: { navigation: any }) {
  const auth = getAuth();
  const db = getFirestore();
  const storage = getStorage();

  // ✅ media is now an array of {uri, type} objects
  const [media, setMedia] = useState<MediaItem[]>([]);
  // ✅ cover tracks the URI string of whichever item is chosen as cover
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [music, setMusic] = useState("");
  const [loading, setLoading] = useState(false);

  // ── Pick images / videos ──────────────────────────────
  const pickMedia = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        selectionLimit: 10 - media.length,
        allowsEditing: false,
        quality: 0.85,
      });

      if (!result.canceled && result.assets?.length > 0) {
        // ✅ Use asset.type from the picker — reliable, no string guessing
        const newItems: MediaItem[] = result.assets.map((a) => ({
          uri: a.uri,
          type: a.type === "video" ? "video" : "image",
        }));

        setMedia((prev) => {
          const merged = [...prev, ...newItems].slice(0, 10);
          return merged;
        });

        // ✅ Set cover to first item's URI only if no cover chosen yet
        if (!coverUri) {
          setCoverUri(result.assets[0].uri);
        }
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to pick media");
    }
  };

  const removeMedia = (idx: number) => {
    const removed = media[idx];
    const updated = media.filter((_, i) => i !== idx);
    setMedia(updated);
    // ✅ If removed item was cover, reassign cover to next first item
    if (coverUri === removed.uri) {
      setCoverUri(updated[0]?.uri ?? null);
    }
  };

  // ── Upload all media to Storage ───────────────────────
  const uploadMedia = async (): Promise<
    { url: string; type: "image" | "video" }[]
  > => {
    const results: { url: string; type: "image" | "video" }[] = [];

    for (let i = 0; i < media.length; i++) {
      const item = media[i]; // ✅ item is {uri, type}
      const response = await fetch(item.uri);
      const blob = await response.blob();

      // ✅ Correct file extension and MIME type per media type
      const ext = item.type === "video" ? "mp4" : "jpg";
      const mimeType = item.type === "video" ? "video/mp4" : "image/jpeg";

      const storageRef = ref(
        storage,
        `sharing/${auth.currentUser?.uid}/${Date.now()}_${i}.${ext}`,
      );

      // ✅ Pass contentType so Firebase stores it correctly
      await uploadBytes(storageRef, blob, { contentType: mimeType });
      const url = await getDownloadURL(storageRef);
      results.push({ url, type: item.type });
    }

    return results;
  };

  // ── Submit ────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert("Missing title", "Please add a title for your post.");
      return;
    }
    if (media.length === 0) {
      Alert.alert("No media", "Please add at least one image or video.");
      return;
    }

    setLoading(true);
    try {
      const uploaded = await uploadMedia();

      // ✅ Find which index was chosen as cover, fall back to 0
      const coverIdx = media.findIndex((m) => m.uri === coverUri);
      const safeCoverIdx = coverIdx >= 0 ? coverIdx : 0;

      // ✅ Cover must always be an image URL for grid thumbnails
      // If cover item is a video, use the first image instead
      let coverURL = uploaded[safeCoverIdx].url;
      if (uploaded[safeCoverIdx].type === "video") {
        const firstImage = uploaded.find((u) => u.type === "image");
        if (firstImage) coverURL = firstImage.url;
        // If ALL media is video, cover stays as video URL (grid will show blank —
        // you can later add expo-video-thumbnails to fix this edge case)
      }

      const userSnap = await getDoc(doc(db, "users", auth.currentUser!.uid));
      const displayName = userSnap.exists()
        ? userSnap.data().displayName || auth.currentUser?.email || ""
        : auth.currentUser?.email || "";

      const docId = `${auth.currentUser?.uid}_${Date.now()}`;

      await setDoc(doc(db, "sharingPosts", docId), {
        userId: auth.currentUser?.uid,
        displayName,
        title: title.trim(),
        description: description.trim(),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        music: music.trim(),
        // ✅ Store URLs and types separately so the player knows what to render
        media: uploaded.map((u) => u.url),
        mediaTypes: uploaded.map((u) => u.type), // e.g. ["image","video","image"]
        cover: coverURL,
        likedBy: [],
        comments: [],
        createdAt: serverTimestamp(),
      });

      setLoading(false);
      Alert.alert("Posted! 🎉", "Your post is now live.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      setLoading(false);
      Alert.alert("Upload failed", e.message || "Please try again.");
    }
  };

  // ── Render ────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.headerBtn}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>New Post</Text>
        <TouchableOpacity
          style={[s.postBtn, loading && { opacity: 0.5 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color={C.bg} />
          ) : (
            <Text style={s.postBtnText}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Media section ── */}
        <Text style={s.sectionLabel}>MEDIA ({media.length}/10)</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 16 }}
        >
          {media.length < 10 && (
            <TouchableOpacity style={s.addBtn} onPress={pickMedia}>
              <Ionicons name="add" size={30} color={C.lime} />
              <Text style={s.addBtnText}>Add</Text>
            </TouchableOpacity>
          )}

          {media.map((item, idx) => {
            const isCover = coverUri === item.uri;
            // ✅ Use item.type — correct and reliable
            const isVideo = item.type === "video";

            return (
              <View key={idx} style={s.thumb}>
                {isVideo ? (
                  // ✅ ResizeMode imported properly
                  <Video
                    source={{ uri: item.uri }}
                    style={s.thumbImg}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay={false}
                    isMuted
                  />
                ) : (
                  <Image
                    source={{ uri: item.uri }}
                    style={s.thumbImg}
                    resizeMode="cover"
                  />
                )}

                <TouchableOpacity
                  style={StyleSheet.absoluteFill}
                  onPress={() => setCoverUri(item.uri)}
                />

                {isCover && (
                  <View style={s.coverBadge}>
                    <Ionicons name="star" size={10} color={C.bg} />
                    <Text style={s.coverBadgeText}>Cover</Text>
                  </View>
                )}

                {isVideo && (
                  <View style={s.videoBadge}>
                    <Ionicons name="play" size={10} color="#fff" />
                  </View>
                )}

                <TouchableOpacity
                  style={s.removeBtn}
                  onPress={() => removeMedia(idx)}
                >
                  <Ionicons name="close-circle" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>

        {media.length === 0 && (
          <TouchableOpacity style={s.emptyMedia} onPress={pickMedia}>
            <Ionicons name="images-outline" size={42} color={C.lime} />
            <Text style={s.emptyMediaTitle}>Add Photos or Videos</Text>
            <Text style={s.emptyMediaSub}>
              Tap a photo to set it as the post thumbnail
            </Text>
          </TouchableOpacity>
        )}

        {media.length > 1 && (
          <View style={s.hintRow}>
            <Ionicons
              name="information-circle-outline"
              size={14}
              color={C.muted}
            />
            <Text style={s.hintText}>
              Tap a photo to set it as cover · ⭐ = current cover
            </Text>
          </View>
        )}

        {/* ── Title ── */}
        <Text style={s.sectionLabel}>TITLE *</Text>
        <View style={s.inputCard}>
          <Ionicons
            name="text-outline"
            size={16}
            color={C.muted}
            style={{ marginRight: 10 }}
          />
          <TextInput
            placeholder="Give your post a title"
            placeholderTextColor={C.muted}
            value={title}
            onChangeText={setTitle}
            style={s.input}
          />
        </View>

        {/* ── Description ── */}
        <Text style={s.sectionLabel}>DESCRIPTION</Text>
        <View
          style={[s.inputCard, { alignItems: "flex-start", paddingTop: 14 }]}
        >
          <Ionicons
            name="document-text-outline"
            size={16}
            color={C.muted}
            style={{ marginRight: 10, marginTop: 1 }}
          />
          <TextInput
            placeholder="Share more details..."
            placeholderTextColor={C.muted}
            value={description}
            onChangeText={setDescription}
            style={[s.input, s.textarea]}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* ── Tags ── */}
        <Text style={s.sectionLabel}>TAGS</Text>
        <View style={s.inputCard}>
          <Ionicons
            name="pricetag-outline"
            size={16}
            color={C.muted}
            style={{ marginRight: 10 }}
          />
          <TextInput
            placeholder="fitness, running, yoga (comma separated)"
            placeholderTextColor={C.muted}
            value={tags}
            onChangeText={setTags}
            style={s.input}
          />
        </View>

        {/* ── Music URL ── */}
        <Text style={s.sectionLabel}>MUSIC URL (optional)</Text>
        <View style={s.inputCard}>
          <Ionicons
            name="musical-notes-outline"
            size={16}
            color={C.muted}
            style={{ marginRight: 10 }}
          />
          <TextInput
            placeholder="Paste music URL"
            placeholderTextColor={C.muted}
            value={music}
            onChangeText={setMusic}
            style={s.input}
          />
        </View>

        {/* ── Submit ── */}
        <TouchableOpacity
          style={[s.submitBtn, loading && { opacity: 0.5 }]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={C.bg} size="small" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={20} color={C.bg} />
              <Text style={s.submitBtnText}>Publish Post</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 50 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: C.white,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  postBtn: {
    backgroundColor: C.lime,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 9,
    minWidth: 68,
    alignItems: "center",
  },
  postBtnText: { color: C.bg, fontWeight: "800", fontSize: 14 },
  scroll: { padding: 20 },
  sectionLabel: {
    color: C.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 10,
    marginTop: 20,
  },
  addBtn: {
    width: 100,
    height: 140,
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  addBtnText: { color: C.muted, fontSize: 12, fontWeight: "600", marginTop: 4 },
  thumb: {
    width: 100,
    height: 140,
    borderRadius: 14,
    overflow: "hidden",
    marginRight: 10,
    position: "relative",
    backgroundColor: C.card,
  },
  thumbImg: { width: "100%", height: "100%" },
  coverBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: C.lime,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  coverBadgeText: { color: C.bg, fontSize: 10, fontWeight: "800" },
  videoBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  removeBtn: { position: "absolute", top: 4, right: 4 },
  emptyMedia: {
    height: 160,
    borderRadius: 18,
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  emptyMediaTitle: { color: C.white, fontSize: 16, fontWeight: "700" },
  emptyMediaSub: {
    color: C.muted,
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  hintText: { color: C.muted, fontSize: 11 },
  inputCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 4,
  },
  input: {
    flex: 1,
    color: C.white,
    fontSize: 15,
    fontWeight: "500",
    padding: 0,
  },
  textarea: { minHeight: 90, paddingTop: 0 },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.lime,
    borderRadius: 16,
    paddingVertical: 17,
    marginTop: 28,
    gap: 10,
    shadowColor: C.lime,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  submitBtnText: {
    color: C.bg,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
});
