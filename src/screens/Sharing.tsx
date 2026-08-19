import React, { useState, useEffect, useCallback, useRef } from "react";
import { Video, ResizeMode } from "expo-av";
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
  Share,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { getAuth, onAuthStateChanged, User } from "firebase/auth";
import {
  getStorage,
  ref as sRef,
  deleteObject,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  getDoc,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MainStackParamList } from "../types/navigation";

const { width, height: SCREEN_H } = Dimensions.get("window");

// ── Responsive columns (matches Marketplace) ──────────────
const getNumColumns = () => {
  if (width >= 1024) return 4;
  if (width >= 768) return 3;
  return 2;
};
const NUM_COLS = getNumColumns();
const CARD_W = (width - 32 - (NUM_COLS - 1) * 10) / NUM_COLS;

const C = {
  bg: "#0d0d0f",
  card: "#1c1d23",
  cardAlt: "#212330",
  lime: "#c8f135",
  white: "#f2f2f4",
  muted: "#6b6d7a",
  border: "#26272f",
  blue: "#4e8ef7",
  danger: "#ff4f4f",
  pink: "#ff4d6d",
  orange: "#f97316",
  purple: "#a855f7",
  green: "#22c55e",
};

type MainStackNavProp = NativeStackNavigationProp<MainStackParamList>;

// ══════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════
interface Community {
  id: string;
  name: string;
  description: string;
  coverURL?: string;
  iconURL?: string;
  memberIds: string[];
  adminId: string;
  adminName: string;
  tags: string[];
  createdAt: any;
  postCount: number;
  isPrivate?: boolean;
}

interface CommunityPost {
  id: string;
  communityId: string;
  communityName: string;
  userId: string;
  displayName: string;
  authorPhotoURL?: string;
  title: string;
  body: string;
  media?: string[];
  likedBy: string[];
  comments: CommunityComment[];
  createdAt: any;
  postType: "discussion" | "question" | "photo" | "announcement";
}

interface CommunityComment {
  id: string;
  userId: string;
  username: string;
  text: string;
  createdAt: string;
}

// ══════════════════════════════════════════════════════════
// UserProfileModal
// ══════════════════════════════════════════════════════════
function UserProfileModal({
  userId,
  visible,
  onClose,
  currentUserId,
}: {
  userId: string | null;
  visible: boolean;
  onClose: () => void;
  currentUserId: string | null;
}) {
  const db = getFirestore();
  const [userData, setUserData] = useState<any>(null);
  const [userPosts, setUserPosts] = useState<any[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible || !userId || !currentUserId) return;
    setLoading(true);
    const load = async () => {
      const [uSnap, mySnap, postsSnap] = await Promise.all([
        getDoc(doc(db, "users", userId)),
        getDoc(doc(db, "users", currentUserId)),
        getDocs(
          query(collection(db, "sharingPosts"), orderBy("createdAt", "desc")),
        ),
      ]);
      if (uSnap.exists()) {
        const d = uSnap.data();
        setUserData({ id: userId, ...d });
        setFollowerCount((d.followers || []).length);
        setFollowingCount((d.following || []).length);
      }
      const myData = mySnap.exists() ? mySnap.data() : {};
      setIsFollowing((myData.following || []).includes(userId));
      const posts = postsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p: any) => p.userId === userId);
      setUserPosts(posts);
      setLoading(false);
    };
    load();
  }, [visible, userId, currentUserId]);

  const toggleFollow = async () => {
    if (!currentUserId || !userId) return;
    const myRef = doc(db, "users", currentUserId);
    const theirRef = doc(db, "users", userId);
    if (isFollowing) {
      await updateDoc(myRef, { following: arrayRemove(userId) });
      await updateDoc(theirRef, { followers: arrayRemove(currentUserId) });
      setIsFollowing(false);
      setFollowerCount((n) => Math.max(0, n - 1));
    } else {
      await updateDoc(myRef, { following: arrayUnion(userId) });
      await updateDoc(theirRef, { followers: arrayUnion(currentUserId) });
      setIsFollowing(true);
      setFollowerCount((n) => n + 1);
    }
  };

  const UGRID = (width - 36) / 2 - 4;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={up.root}>
        <View style={up.topBar}>
          <TouchableOpacity style={up.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={C.white} />
          </TouchableOpacity>
          <Text style={up.title}>Profile</Text>
          <View style={{ width: 36 }} />
        </View>

        {loading ? (
          <View style={up.loader}>
            <ActivityIndicator color={C.lime} size="large" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={up.scroll}>
            <View style={up.hero}>
              <View style={up.avatarRing}>
                {userData?.photoURL ? (
                  <Image
                    source={{ uri: userData.photoURL }}
                    style={up.avatar}
                  />
                ) : (
                  <View style={[up.avatar, up.avatarFallback]}>
                    <Text style={up.avatarInitial}>
                      {(userData?.displayName || "U")[0].toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={up.name}>{userData?.displayName || "User"}</Text>
              <Text style={up.email}>{userData?.email || ""}</Text>

              <View style={up.statsRow}>
                <View style={up.stat}>
                  <Text style={up.statVal}>{userPosts.length}</Text>
                  <Text style={up.statLbl}>Posts</Text>
                </View>
                <View style={up.statDiv} />
                <View style={up.stat}>
                  <Text style={[up.statVal, { color: C.lime }]}>
                    {followerCount}
                  </Text>
                  <Text style={up.statLbl}>Followers</Text>
                </View>
                <View style={up.statDiv} />
                <View style={up.stat}>
                  <Text style={up.statVal}>{followingCount}</Text>
                  <Text style={up.statLbl}>Following</Text>
                </View>
                <View style={up.statDiv} />
                <View style={up.stat}>
                  <Text style={[up.statVal, { color: "#ff9f43" }]}>
                    {userData?.tokens || 0}
                  </Text>
                  <Text style={up.statLbl}>Tokens</Text>
                </View>
              </View>

              {currentUserId !== userId && (
                <TouchableOpacity
                  style={[up.followBtn, isFollowing && up.followBtnActive]}
                  onPress={toggleFollow}
                >
                  <Text
                    style={[up.followBtnTxt, isFollowing && { color: C.muted }]}
                  >
                    {isFollowing ? "Following ✓" : "Follow"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={up.sectionLbl}>POSTS ({userPosts.length})</Text>
            {userPosts.length === 0 ? (
              <View style={up.empty}>
                <Ionicons name="images-outline" size={36} color={C.muted} />
                <Text style={up.emptyTxt}>No posts yet</Text>
              </View>
            ) : (
              <View style={up.grid}>
                {userPosts.map((p) => (
                  <View
                    key={p.id}
                    style={[up.gridItem, { width: UGRID, height: UGRID * 1.3 }]}
                  >
                    <Image
                      source={{ uri: p.cover || p.media?.[0] }}
                      style={up.gridImg}
                      resizeMode="cover"
                    />
                    <View style={up.gridOverlay}>
                      <Text style={up.gridTitle} numberOfLines={1}>
                        {p.title}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const up = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
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
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { paddingHorizontal: 16, paddingTop: 20 },
  hero: {
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  avatarRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: C.lime,
    marginBottom: 12,
    overflow: "hidden",
  },
  avatar: { width: 78, height: 78, borderRadius: 39 },
  avatarFallback: {
    backgroundColor: C.cardAlt,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: { color: C.lime, fontSize: 30, fontWeight: "900" },
  name: {
    color: C.white,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.4,
    marginBottom: 3,
  },
  email: { color: C.muted, fontSize: 13, marginBottom: 16 },
  statsRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  stat: { alignItems: "center", paddingHorizontal: 16 },
  statVal: { color: C.white, fontSize: 18, fontWeight: "800" },
  statLbl: { color: C.muted, fontSize: 11, marginTop: 2 },
  statDiv: { width: 1, height: 28, backgroundColor: C.border },
  followBtn: {
    backgroundColor: C.lime,
    borderRadius: 20,
    paddingHorizontal: 32,
    paddingVertical: 10,
  },
  followBtnActive: {
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  followBtnTxt: { color: C.bg, fontSize: 14, fontWeight: "800" },
  sectionLbl: {
    color: C.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  empty: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyTxt: { color: C.muted, fontSize: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  gridItem: { borderRadius: 12, overflow: "hidden" },
  gridImg: { width: "100%", height: "100%" },
  gridOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  gridTitle: { color: "#fff", fontSize: 11, fontWeight: "700" },
});

// ══════════════════════════════════════════════════════════
// POST TYPE BADGE
// ══════════════════════════════════════════════════════════
function PostTypeBadge({ type }: { type: string }) {
  const config: Record<string, { icon: any; color: string; label: string }> = {
    discussion: {
      icon: "chatbubbles-outline",
      color: C.blue,
      label: "Discussion",
    },
    question: {
      icon: "help-circle-outline",
      color: C.orange,
      label: "Question",
    },
    photo: { icon: "images-outline", color: C.purple, label: "Photo" },
    announcement: {
      icon: "megaphone-outline",
      color: C.lime,
      label: "Announcement",
    },
  };
  const cfg = config[type] || config.discussion;
  return (
    <View
      style={[
        ptb.wrap,
        { backgroundColor: cfg.color + "20", borderColor: cfg.color + "50" },
      ]}
    >
      <Ionicons name={cfg.icon} size={10} color={cfg.color} />
      <Text style={[ptb.txt, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}
const ptb = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  txt: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
});

// ══════════════════════════════════════════════════════════
// CREATE COMMUNITY MODAL
// ══════════════════════════════════════════════════════════
function CreateCommunityModal({
  visible,
  onClose,
  currentUser,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  currentUser: User | null;
  onCreated: (c: Community) => void;
}) {
  const db = getFirestore();
  const storage = getStorage();
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [iconImage, setIconImage] = useState<string | null>(null);

  const pickCoverImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled) setCoverImage(result.assets[0].uri);
  };

  const pickIconImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setIconImage(result.assets[0].uri);
  };

  const uploadImage = async (uri: string, path: string): Promise<string> => {
    const response = await fetch(uri);
    const blob = await response.blob();
    const imgRef = sRef(storage, path); // ✅ 用 sRef，不是 storageRef
    await uploadBytes(imgRef, blob, { contentType: "image/jpeg" });
    return await getDownloadURL(imgRef);
  };
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!currentUser || !name.trim()) return;
    setSubmitting(true);
    try {
      const snap = await getDoc(doc(db, "users", currentUser.uid));
      const displayName = snap.exists()
        ? snap.data().displayName || currentUser.email
        : currentUser.email;
      const tagArr = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const ts = Date.now();

      let coverURL = "";
      let iconURL = "";
      if (coverImage) {
        coverURL = await uploadImage(
          coverImage,
          `communities/${currentUser.uid}/${ts}_cover.jpg`,
        );
      }
      if (iconImage) {
        iconURL = await uploadImage(
          iconImage,
          `communities/${currentUser.uid}/${ts}_icon.jpg`,
        );
      }

      const docRef = await addDoc(collection(db, "communities"), {
        name: name.trim(),
        description: description.trim(),
        memberIds: [currentUser.uid],
        adminId: currentUser.uid,
        adminName: displayName,
        tags: tagArr,
        isPrivate,
        postCount: 0,
        coverURL,
        iconURL,
        createdAt: serverTimestamp(),
      });

      const created: Community = {
        id: docRef.id,
        name: name.trim(),
        description: description.trim(),
        memberIds: [currentUser.uid],
        adminId: currentUser.uid,
        adminName: displayName,
        tags: tagArr,
        isPrivate,
        postCount: 0,
        coverURL,
        iconURL,
        createdAt: new Date(),
      };
      onCreated(created);
      setName("");
      setDescription("");
      setTags("");
      setIsPrivate(false);
      setCoverImage(null);
      setIconImage(null);
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={ccm.root}>
          <View style={ccm.topBar}>
            <TouchableOpacity style={ccm.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={C.white} />
            </TouchableOpacity>
            <Text style={ccm.title}>Create Community</Text>
            <TouchableOpacity
              style={[
                ccm.createBtn,
                (!name.trim() || submitting) && { opacity: 0.4 },
              ]}
              onPress={handleCreate}
              disabled={!name.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={C.bg} />
              ) : (
                <Text style={ccm.createBtnTxt}>Create</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={ccm.scroll}>
            {/* ── 封面图 ── */}
            <TouchableOpacity style={ccm.coverPicker} onPress={pickCoverImage}>
              {coverImage ? (
                <Image
                  source={{ uri: coverImage }}
                  style={ccm.coverImg}
                  resizeMode="cover"
                />
              ) : (
                <View style={ccm.coverPlaceholder}>
                  <Ionicons name="image-outline" size={28} color={C.muted} />
                  <Text style={ccm.coverPlaceholderTxt}>
                    Add Cover Photo (16:9)
                  </Text>
                </View>
              )}
              <View style={ccm.coverEditBadge}>
                <Ionicons name="camera" size={12} color={C.bg} />
              </View>
            </TouchableOpacity>

            {/* ── 头像图 ── */}
            <View
              style={{
                alignItems: "flex-start",
                paddingHorizontal: 16,
                marginTop: -30,
                marginBottom: 12,
              }}
            >
              <TouchableOpacity
                style={ccm.iconPickerWrap}
                onPress={pickIconImage}
              >
                {iconImage ? (
                  <Image
                    source={{ uri: iconImage }}
                    style={ccm.iconPickerImg}
                  />
                ) : (
                  <View style={ccm.iconCircle}>
                    <Ionicons name="people" size={30} color={C.lime} />
                  </View>
                )}
                <View style={ccm.iconEditBadge}>
                  <Ionicons name="camera" size={10} color={C.bg} />
                </View>
              </TouchableOpacity>
              <Text style={ccm.iconHint}>Community Icon</Text>
            </View>

            <Text style={ccm.label}>Community Name *</Text>
            <TextInput
              style={ccm.input}
              placeholder="e.g. Morning Run Crew"
              placeholderTextColor={C.muted}
              value={name}
              onChangeText={setName}
              maxLength={50}
            />

            <Text style={ccm.label}>Description</Text>
            <TextInput
              style={[ccm.input, { height: 90, textAlignVertical: "top" }]}
              placeholder="What is this community about?"
              placeholderTextColor={C.muted}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={300}
            />

            <Text style={ccm.label}>Tags (comma separated)</Text>
            <TextInput
              style={ccm.input}
              placeholder="e.g. fitness, running, cardio"
              placeholderTextColor={C.muted}
              value={tags}
              onChangeText={setTags}
            />

            <TouchableOpacity
              style={ccm.toggleRow}
              onPress={() => setIsPrivate(!isPrivate)}
            >
              <View>
                <Text style={ccm.toggleTitle}>Private Community</Text>
                <Text style={ccm.toggleSub}>Members need approval to join</Text>
              </View>
              <View style={[ccm.toggle, isPrivate && ccm.toggleActive]}>
                {isPrivate && (
                  <Ionicons name="checkmark" size={13} color={C.bg} />
                )}
              </View>
            </TouchableOpacity>

            <View style={ccm.tipBox}>
              <Ionicons name="bulb-outline" size={14} color={C.lime} />
              <Text style={ccm.tipTxt}>
                Build your community around shared fitness goals, workout
                styles, or interests. Everyone starts as a member — invite
                friends!
              </Text>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ccm = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  topBar: {
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
  createBtn: {
    backgroundColor: C.lime,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  createBtnTxt: { color: C.bg, fontSize: 13, fontWeight: "900" },
  scroll: { padding: 16 },
  coverPicker: {
    width: "100%",
    height: 130,
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
    borderStyle: "dashed",
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    marginBottom: 0,
  },
  coverImg: { width: "100%", height: "100%" },
  coverPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  coverPlaceholderTxt: { color: C.muted, fontSize: 13 },
  coverEditBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: C.lime,
    borderRadius: 12,
    padding: 6,
  },
  iconPickerWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: C.bg,
    position: "relative",
    overflow: "hidden",
  },
  iconPickerImg: { width: "100%", height: "100%" },
  iconCircle: {
    // ✅ 重新定义 iconCircle
    width: "100%",
    height: "100%",
    backgroundColor: C.card,
    borderWidth: 2,
    borderColor: C.lime,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  iconEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: C.lime,
    borderRadius: 8,
    padding: 4,
  },
  iconHint: { color: C.muted, fontSize: 12, marginTop: 4 },
  label: {
    color: C.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    color: C.white,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  toggleTitle: { color: C.white, fontSize: 14, fontWeight: "700" },
  toggleSub: { color: C.muted, fontSize: 11, marginTop: 2 },
  toggle: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: C.cardAlt,
    borderWidth: 1.5,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
  },
  toggleActive: { backgroundColor: C.lime, borderColor: C.lime },
  tipBox: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: C.lime + "10",
    borderRadius: 12,
    padding: 12,
    marginTop: 20,
    borderWidth: 1,
    borderColor: C.lime + "30",
    alignItems: "flex-start",
  },
  tipTxt: {
    color: C.white,
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
    opacity: 0.8,
  },
});

// ══════════════════════════════════════════════════════════
// COMMUNITY DETAIL MODAL (feed + post)
// ══════════════════════════════════════════════════════════
function CommunityDetailModal({
  community,
  visible,
  onClose,
  currentUser,
  onJoinToggle,
}: {
  community: Community | null;
  visible: boolean;
  onClose: () => void;
  currentUser: User | null;
  onJoinToggle: (communityId: string, joined: boolean) => void;
}) {
  const db = getFirestore();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [postType, setPostType] =
    useState<CommunityPost["postType"]>("discussion");
  const [submitting, setSubmitting] = useState(false);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentingOn, setCommentingOn] = useState<string | null>(null);

  const isMember = community
    ? community.memberIds.includes(currentUser?.uid || "")
    : false;
  const isAdmin = community ? community.adminId === currentUser?.uid : false;

  useEffect(() => {
    if (!visible || !community) return;
    setLoading(true);
    const load = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "communityPosts"), orderBy("createdAt", "desc")),
        );
        const all = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as CommunityPost)
          .filter((p) => p.communityId === community.id);
        setPosts(all);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    load();
  }, [visible, community]);

  const handleJoinToggle = async () => {
    if (!currentUser || !community) return;
    const ref = doc(db, "communities", community.id);
    if (isMember) {
      await updateDoc(ref, { memberIds: arrayRemove(currentUser.uid) });
      onJoinToggle(community.id, false);
    } else {
      await updateDoc(ref, { memberIds: arrayUnion(currentUser.uid) });
      onJoinToggle(community.id, true);
    }
  };

  const handleSubmitPost = async () => {
    if (!currentUser || !community || !postBody.trim()) return;
    setSubmitting(true);
    try {
      const snap = await getDoc(doc(db, "users", currentUser.uid));
      const displayName = snap.exists()
        ? snap.data().displayName || currentUser.email
        : currentUser.email;
      const photoURL = snap.exists() ? snap.data().photoURL : null;
      const newPost: Omit<CommunityPost, "id"> = {
        communityId: community.id,
        communityName: community.name,
        userId: currentUser.uid,
        displayName,
        authorPhotoURL: photoURL,
        title: postTitle.trim(),
        body: postBody.trim(),
        likedBy: [],
        comments: [],
        postType,
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, "communityPosts"), newPost);
      const created = {
        id: ref.id,
        ...newPost,
        createdAt: new Date(),
      } as CommunityPost;
      setPosts((p) => [created, ...p]);
      await updateDoc(doc(db, "communities", community.id), {
        postCount: (community.postCount || 0) + 1,
      });
      setPostTitle("");
      setPostBody("");
      setShowCreatePost(false);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
    setSubmitting(false);
  };

  const handleLikePost = async (post: CommunityPost) => {
    if (!currentUser) return;
    const liked = post.likedBy.includes(currentUser.uid);
    const updated = {
      ...post,
      likedBy: liked
        ? post.likedBy.filter((id) => id !== currentUser.uid)
        : [...post.likedBy, currentUser.uid],
    };
    setPosts((p) => p.map((x) => (x.id === post.id ? updated : x)));
    await updateDoc(doc(db, "communityPosts", post.id), {
      likedBy: liked
        ? arrayRemove(currentUser.uid)
        : arrayUnion(currentUser.uid),
    });
  };

  const handleAddComment = async (post: CommunityPost) => {
    if (!currentUser || !commentText.trim()) return;
    try {
      const snap = await getDoc(doc(db, "users", currentUser.uid));
      const username = snap.exists()
        ? snap.data().displayName || currentUser.email
        : currentUser.email;
      const newC: CommunityComment = {
        id: Date.now().toString(),
        userId: currentUser.uid,
        username,
        text: commentText.trim(),
        createdAt: new Date().toISOString(),
      };
      const updatedComments = [...(post.comments || []), newC];
      await updateDoc(doc(db, "communityPosts", post.id), {
        comments: updatedComments,
      });
      const updated = { ...post, comments: updatedComments };
      setPosts((p) => p.map((x) => (x.id === post.id ? updated : x)));
      setCommentText("");
      setCommentingOn(null);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  if (!community) return null;

  const POST_TYPES: {
    type: CommunityPost["postType"];
    icon: any;
    label: string;
  }[] = [
    { type: "discussion", icon: "chatbubbles-outline", label: "Discussion" },
    { type: "question", icon: "help-circle-outline", label: "Question" },
    { type: "photo", icon: "images-outline", label: "Photo" },
    { type: "announcement", icon: "megaphone-outline", label: "Announcement" },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={cdm.root}>
        {/* Cover / Header */}
        <View style={cdm.coverArea}>
          {community.coverURL ? (
            <Image
              source={{ uri: community.coverURL }}
              style={cdm.cover}
              resizeMode="cover"
            />
          ) : (
            <View style={[cdm.cover, cdm.coverFallback]}>
              <Ionicons name="people" size={48} color={C.lime + "60"} />
            </View>
          )}
          <View style={cdm.coverOverlay} />
          <TouchableOpacity style={cdm.backBtn} onPress={onClose}>
            <Ionicons name="chevron-down" size={22} color={C.white} />
          </TouchableOpacity>
        </View>

        {/* Community info */}
        <View style={cdm.infoBar}>
          <View style={cdm.infoIconWrap}>
            <Ionicons name="people" size={22} color={C.lime} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={cdm.communityName}>{community.name}</Text>
            <Text style={cdm.communityMeta}>
              {community.memberIds.length} members · {community.postCount || 0}{" "}
              posts
              {community.isPrivate ? " · 🔒 Private" : " · 🌐 Public"}
            </Text>
          </View>
          {!isAdmin && (
            <TouchableOpacity
              style={[cdm.joinBtn, isMember && cdm.joinBtnActive]}
              onPress={handleJoinToggle}
            >
              <Text style={[cdm.joinBtnTxt, isMember && { color: C.muted }]}>
                {isMember ? "Joined ✓" : "Join"}
              </Text>
            </TouchableOpacity>
          )}
          {isAdmin && (
            <View style={cdm.adminBadge}>
              <Text style={cdm.adminBadgeTxt}>Admin</Text>
            </View>
          )}
        </View>

        {community.description ? (
          <Text style={cdm.communityDesc}>{community.description}</Text>
        ) : null}

        {community.tags.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={cdm.tagsRow}
          >
            {community.tags.map((t, i) => (
              <View key={i} style={cdm.tag}>
                <Text style={cdm.tagTxt}>#{t}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Create post button */}
        {isMember || isAdmin ? (
          <TouchableOpacity
            style={cdm.createPostBar}
            onPress={() => setShowCreatePost(!showCreatePost)}
          >
            <View style={cdm.createPostAvatar}>
              <Ionicons name="person" size={14} color={C.muted} />
            </View>
            <Text style={cdm.createPostPlaceholder}>
              Share something with the community...
            </Text>
            <Ionicons
              name={showCreatePost ? "chevron-up" : "chevron-down"}
              size={16}
              color={C.muted}
            />
          </TouchableOpacity>
        ) : (
          <View style={cdm.joinPrompt}>
            <Ionicons name="lock-closed-outline" size={14} color={C.muted} />
            <Text style={cdm.joinPromptTxt}>
              Join this community to post and comment
            </Text>
          </View>
        )}

        {/* Create post form */}
        {showCreatePost && (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={cdm.createPostForm}>
              {/* Post type selector */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 7, marginBottom: 10 }}
              >
                {POST_TYPES.map((pt) => (
                  <TouchableOpacity
                    key={pt.type}
                    style={[
                      cdm.typeChip,
                      postType === pt.type && cdm.typeChipActive,
                    ]}
                    onPress={() => setPostType(pt.type)}
                  >
                    <Ionicons
                      name={pt.icon}
                      size={12}
                      color={postType === pt.type ? C.bg : C.muted}
                    />
                    <Text
                      style={[
                        cdm.typeChipTxt,
                        postType === pt.type && { color: C.bg },
                      ]}
                    >
                      {pt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TextInput
                style={cdm.postTitleInput}
                placeholder="Title (optional)"
                placeholderTextColor={C.muted}
                value={postTitle}
                onChangeText={setPostTitle}
              />
              <TextInput
                style={cdm.postBodyInput}
                placeholder="What's on your mind? Ask a question, share a tip, or start a discussion..."
                placeholderTextColor={C.muted}
                value={postBody}
                onChangeText={setPostBody}
                multiline
              />
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  gap: 8,
                }}
              >
                <TouchableOpacity
                  style={cdm.cancelPostBtn}
                  onPress={() => setShowCreatePost(false)}
                >
                  <Text
                    style={{ color: C.muted, fontSize: 13, fontWeight: "700" }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    cdm.submitPostBtn,
                    (!postBody.trim() || submitting) && { opacity: 0.4 },
                  ]}
                  onPress={handleSubmitPost}
                  disabled={!postBody.trim() || submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color={C.bg} />
                  ) : (
                    <Text style={cdm.submitPostTxt}>Post</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        )}

        {/* Posts feed */}
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <ActivityIndicator color={C.lime} />
            </View>
          ) : posts.length === 0 ? (
            <View style={cdm.emptyFeed}>
              <Ionicons name="chatbubbles-outline" size={40} color={C.muted} />
              <Text style={cdm.emptyFeedTxt}>No posts yet</Text>
              <Text style={cdm.emptyFeedSub}>
                Be the first to share something!
              </Text>
            </View>
          ) : (
            posts.map((post) => {
              const liked = post.likedBy.includes(currentUser?.uid || "");
              const expanded = expandedPost === post.id;
              return (
                <View key={post.id} style={cdm.postCard}>
                  {/* Post header */}
                  <View style={cdm.postHeader}>
                    <View style={cdm.postAvatar}>
                      {post.authorPhotoURL ? (
                        <Image
                          source={{ uri: post.authorPhotoURL }}
                          style={{ width: "100%", height: "100%" }}
                        />
                      ) : (
                        <Text style={cdm.postAvatarTxt}>
                          {(post.displayName || "U")[0].toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={cdm.postAuthor}>{post.displayName}</Text>
                      <Text style={cdm.postDate}>
                        {post.createdAt?.toDate?.()?.toLocaleDateString() ??
                          "Just now"}
                      </Text>
                    </View>
                    <PostTypeBadge type={post.postType} />
                  </View>

                  {post.title ? (
                    <Text style={cdm.postTitle}>{post.title}</Text>
                  ) : null}
                  <Text
                    style={cdm.postBody}
                    numberOfLines={expanded ? undefined : 4}
                  >
                    {post.body}
                  </Text>
                  {post.body.length > 200 && (
                    <TouchableOpacity
                      onPress={() => setExpandedPost(expanded ? null : post.id)}
                    >
                      <Text style={cdm.readMore}>
                        {expanded ? "Show less" : "Read more"}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Actions */}
                  <View style={cdm.postActions}>
                    <TouchableOpacity
                      style={cdm.postAction}
                      onPress={() => handleLikePost(post)}
                    >
                      <Ionicons
                        name={liked ? "heart" : "heart-outline"}
                        size={17}
                        color={liked ? C.pink : C.muted}
                      />
                      <Text
                        style={[cdm.postActionTxt, liked && { color: C.pink }]}
                      >
                        {post.likedBy.length}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={cdm.postAction}
                      onPress={() =>
                        setCommentingOn(
                          commentingOn === post.id ? null : post.id,
                        )
                      }
                    >
                      <Ionicons
                        name="chatbubble-outline"
                        size={16}
                        color={C.muted}
                      />
                      <Text style={cdm.postActionTxt}>
                        {post.comments?.length || 0}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={cdm.postAction}
                      onPress={() =>
                        Share.share({
                          message: `Check out this post in ${post.communityName}!`,
                        })
                      }
                    >
                      <Ionicons
                        name="share-social-outline"
                        size={16}
                        color={C.muted}
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Comments section */}
                  {(commentingOn === post.id ||
                    (post.comments?.length || 0) > 0) && (
                    <View style={cdm.commentsSection}>
                      {post.comments?.slice(-3).map((c) => (
                        <View key={c.id} style={cdm.commentRow}>
                          <View style={cdm.commentAvatar}>
                            <Text style={cdm.commentAvatarTxt}>
                              {(c.username || "U")[0].toUpperCase()}
                            </Text>
                          </View>
                          <View style={cdm.commentBubble}>
                            <Text style={cdm.commentUser}>@{c.username}</Text>
                            <Text style={cdm.commentTxt}>{c.text}</Text>
                          </View>
                        </View>
                      ))}
                      {post.comments?.length > 3 && (
                        <TouchableOpacity
                          onPress={() => setExpandedPost(post.id)}
                        >
                          <Text style={cdm.viewAllComments}>
                            View all {post.comments.length} comments
                          </Text>
                        </TouchableOpacity>
                      )}

                      {(isMember || isAdmin) && commentingOn === post.id && (
                        <View style={cdm.commentInputRow}>
                          <TextInput
                            style={cdm.commentInput}
                            placeholder="Write a comment..."
                            placeholderTextColor={C.muted}
                            value={commentText}
                            onChangeText={setCommentText}
                            multiline
                          />
                          <TouchableOpacity
                            style={[
                              cdm.commentSendBtn,
                              !commentText.trim() && { opacity: 0.35 },
                            ]}
                            onPress={() => handleAddComment(post)}
                            disabled={!commentText.trim()}
                          >
                            <Ionicons name="send" size={13} color={C.bg} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
          <View style={{ height: 60 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const cdm = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  coverArea: { height: 140, position: "relative" },
  cover: { width: "100%", height: "100%" },
  coverFallback: {
    backgroundColor: C.card,
    justifyContent: "center",
    alignItems: "center",
  },
  coverOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(13,13,15,0.45)",
  },
  backBtn: {
    position: "absolute",
    top: 50,
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(13,13,15,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  infoBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  infoIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.lime + "50",
    justifyContent: "center",
    alignItems: "center",
  },
  communityName: {
    color: C.white,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  communityMeta: { color: C.muted, fontSize: 11, marginTop: 2 },
  joinBtn: {
    backgroundColor: C.lime,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  joinBtnActive: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  joinBtnTxt: { color: C.bg, fontSize: 13, fontWeight: "800" },
  adminBadge: {
    backgroundColor: C.lime + "20",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: C.lime + "40",
  },
  adminBadgeTxt: { color: C.lime, fontSize: 11, fontWeight: "800" },
  communityDesc: {
    color: C.white,
    fontSize: 13,
    lineHeight: 19,
    opacity: 0.75,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  tagsRow: { paddingHorizontal: 16, gap: 6, marginBottom: 10 },
  tag: {
    backgroundColor: C.lime + "18",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: C.lime + "35",
  },
  tagTxt: { color: C.lime, fontSize: 11, fontWeight: "600" },
  createPostBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 6,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  createPostAvatar: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: C.cardAlt,
    justifyContent: "center",
    alignItems: "center",
  },
  createPostPlaceholder: { flex: 1, color: C.muted, fontSize: 13 },
  joinPrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginHorizontal: 16,
    marginBottom: 6,
    padding: 10,
  },
  joinPromptTxt: { color: C.muted, fontSize: 12 },
  createPostForm: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.lime + "40",
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.cardAlt,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  typeChipActive: { backgroundColor: C.lime, borderColor: C.lime },
  typeChipTxt: { color: C.muted, fontSize: 11, fontWeight: "700" },
  postTitleInput: {
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    color: C.white,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    fontWeight: "700",
  },
  postBodyInput: {
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    color: C.white,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 90,
    textAlignVertical: "top",
    marginBottom: 10,
  },
  cancelPostBtn: { paddingHorizontal: 14, paddingVertical: 9 },
  submitPostBtn: {
    backgroundColor: C.lime,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  submitPostTxt: { color: C.bg, fontSize: 13, fontWeight: "900" },
  emptyFeed: { alignItems: "center", paddingVertical: 50, gap: 10 },
  emptyFeedTxt: { color: C.white, fontSize: 15, fontWeight: "700" },
  emptyFeedSub: { color: C.muted, fontSize: 13 },
  postCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  postAvatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.lime + "25",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  postAvatarTxt: { color: C.lime, fontSize: 14, fontWeight: "900" },
  postAuthor: { color: C.white, fontSize: 13, fontWeight: "800" },
  postDate: { color: C.muted, fontSize: 11, marginTop: 1 },
  postTitle: {
    color: C.white,
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  postBody: {
    color: C.white,
    fontSize: 13,
    lineHeight: 20,
    opacity: 0.85,
    marginBottom: 10,
  },
  readMore: {
    color: C.blue,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 10,
  },
  postActions: {
    flexDirection: "row",
    gap: 18,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 10,
  },
  postAction: { flexDirection: "row", alignItems: "center", gap: 6 },
  postActionTxt: { color: C.muted, fontSize: 13, fontWeight: "600" },
  commentsSection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 10,
    gap: 8,
  },
  commentRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  commentAvatar: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: C.blue + "25",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  commentAvatarTxt: { color: C.blue, fontSize: 10, fontWeight: "900" },
  commentBubble: {
    flex: 1,
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    padding: 8,
  },
  commentUser: {
    color: C.lime,
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 2,
  },
  commentTxt: { color: C.white, fontSize: 12, lineHeight: 17 },
  viewAllComments: { color: C.blue, fontSize: 12, fontWeight: "700" },
  commentInputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  commentInput: {
    flex: 1,
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    color: C.white,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxHeight: 70,
  },
  commentSendBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.lime,
    justifyContent: "center",
    alignItems: "center",
  },
});

// ══════════════════════════════════════════════════════════
// COMMUNITY CARD
// ══════════════════════════════════════════════════════════
function CommunityCard({
  community,
  currentUserId,
  onPress,
  onJoinToggle,
}: {
  community: Community;
  currentUserId: string | null;
  onPress: () => void;
  onJoinToggle: () => void;
}) {
  const isMember = community.memberIds.includes(currentUserId || "");
  return (
    <TouchableOpacity style={ccard.wrap} onPress={onPress} activeOpacity={0.85}>
      <View style={ccard.coverWrap}>
        {community.coverURL ? (
          <Image
            source={{ uri: community.coverURL }}
            style={ccard.cover}
            resizeMode="cover"
          />
        ) : (
          <View style={[ccard.cover, ccard.coverFallback]}>
            <Ionicons name="people" size={28} color={C.lime + "70"} />
          </View>
        )}
        {community.isPrivate && (
          <View style={ccard.privateBadge}>
            <Ionicons name="lock-closed" size={8} color={C.white} />
          </View>
        )}
      </View>
      <View style={ccard.info}>
        <Text style={ccard.name} numberOfLines={1}>
          {community.name}
        </Text>
        <Text style={ccard.meta}>{community.memberIds.length} members</Text>
        {community.tags.length > 0 && (
          <View style={ccard.tags}>
            {community.tags.slice(0, 2).map((t, i) => (
              <View key={i} style={ccard.tag}>
                <Text style={ccard.tagTxt}>#{t}</Text>
              </View>
            ))}
          </View>
        )}
        <TouchableOpacity
          style={[ccard.joinBtn, isMember && ccard.joinBtnActive]}
          onPress={(e) => {
            e.stopPropagation?.();
            onJoinToggle();
          }}
        >
          <Text style={[ccard.joinBtnTxt, isMember && { color: C.muted }]}>
            {isMember ? "Joined ✓" : "+ Join"}
          </Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const ccard = StyleSheet.create({
  wrap: {
    width: CARD_W,
    backgroundColor: C.card,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
  },
  coverWrap: { width: "100%", aspectRatio: 1.6, position: "relative" },
  cover: { width: "100%", height: "100%" },
  coverFallback: {
    backgroundColor: C.cardAlt,
    justifyContent: "center",
    alignItems: "center",
  },
  privateBadge: {
    position: "absolute",
    top: 7,
    right: 7,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 6,
    padding: 4,
  },
  info: { padding: 10 },
  name: { color: C.white, fontSize: 13, fontWeight: "800", marginBottom: 3 },
  meta: { color: C.muted, fontSize: 11, marginBottom: 6 },
  tags: { flexDirection: "row", gap: 5, marginBottom: 8, flexWrap: "wrap" },
  tag: {
    backgroundColor: C.lime + "18",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagTxt: { color: C.lime, fontSize: 9, fontWeight: "700" },
  joinBtn: {
    backgroundColor: C.lime,
    borderRadius: 8,
    paddingVertical: 7,
    alignItems: "center",
  },
  joinBtnActive: {
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  joinBtnTxt: { color: C.bg, fontSize: 12, fontWeight: "800" },
});

// ══════════════════════════════════════════════════════════
// POST CARD (Marketplace grid style)
// ══════════════════════════════════════════════════════════
function PostCard({
  post,
  currentUserId,
  onPress,
}: {
  post: any;
  currentUserId: string | null;
  onPress: () => void;
}) {
  const liked = post.likedBy?.includes(currentUserId);
  const isOwner = post.userId === currentUserId;
  return (
    <TouchableOpacity style={pcard.wrap} onPress={onPress} activeOpacity={0.88}>
      <View style={pcard.imgWrap}>
        <Image
          source={{ uri: post.cover || post.media?.[0] }}
          style={pcard.img}
          resizeMode="cover"
        />
        {post.media?.length > 1 && (
          <View style={pcard.multiImg}>
            <Ionicons name="images-outline" size={10} color={C.white} />
          </View>
        )}
        {isOwner && (
          <View style={pcard.ownerDot}>
            <Ionicons name="person" size={8} color={C.bg} />
          </View>
        )}
      </View>
      <View style={pcard.info}>
        <Text style={pcard.title} numberOfLines={2}>
          {post.title}
        </Text>
        <View style={pcard.metaRow}>
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={11}
            color={liked ? C.pink : C.muted}
          />
          <Text style={pcard.likeCount}>{post.likedBy?.length || 0}</Text>
          <Ionicons
            name="chatbubble-outline"
            size={10}
            color={C.muted}
            style={{ marginLeft: 6 }}
          />
          <Text style={pcard.likeCount}>{post.comments?.length || 0}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const pcard = StyleSheet.create({
  wrap: {
    width: CARD_W,
    backgroundColor: C.card,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
  },
  imgWrap: { width: "100%", aspectRatio: 1, position: "relative" },
  img: { width: "100%", height: "100%" },
  multiImg: {
    position: "absolute",
    top: 7,
    right: 7,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 4,
    borderRadius: 5,
  },
  ownerDot: {
    position: "absolute",
    top: 7,
    left: 7,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.lime,
    justifyContent: "center",
    alignItems: "center",
  },
  info: { padding: 9 },
  title: {
    color: C.white,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 5,
    lineHeight: 16,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  likeCount: { color: C.muted, fontSize: 10 },
});

// ══════════════════════════════════════════════════════════
// MAIN SharingPage
// ══════════════════════════════════════════════════════════
export default function SharingPage() {
  const auth = getAuth();
  const db = getFirestore();
  const storage = getStorage();
  const navigation = useNavigation<MainStackNavProp>();

  const [me, setMe] = useState<User | null>(null);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setMe(u));
    return unsub;
  }, []);

  // Tab state
  type Tab = "posts" | "communities";
  const [activeTab, setActiveTab] = useState<Tab>("posts");

  // Posts state
  const [posts, setPosts] = useState<any[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Community state
  const [communities, setCommunities] = useState<Community[]>([]);
  const [communitiesLoading, setCommunitiesLoading] = useState(true);
  const [communitySearch, setCommunitySearch] = useState("");
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(
    null,
  );
  const [communityDetailVisible, setCommunityDetailVisible] = useState(false);
  const [createCommunityVisible, setCreateCommunityVisible] = useState(false);

  // Profile modal
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileVisible, setProfileVisible] = useState(false);

  // ── Fetch posts ───────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!me) return;
    try {
      const mySnap = await getDoc(doc(db, "users", me.uid));
      const myData = mySnap.exists() ? mySnap.data() : {};
      const followingIds: string[] = myData.following || [];

      const usersSnap = await getDocs(collection(db, "users"));
      const allUsers = usersSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u: any) => u.id !== me.uid);

      setFollowing(allUsers.filter((u: any) => followingIds.includes(u.id)));
      setSuggestions(
        allUsers.filter((u: any) => !followingIds.includes(u.id)).slice(0, 8),
      );

      const postsSnap = await getDocs(
        query(collection(db, "sharingPosts"), orderBy("createdAt", "desc")),
      );
      const all = postsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPosts(all);
      setFilteredPosts(all);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [me]);

  // ── Fetch communities ─────────────────────────────────────
  const fetchCommunities = useCallback(async () => {
    setCommunitiesLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, "communities"), orderBy("createdAt", "desc")),
      );
      const all = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Community,
      );
      setCommunities(all);
    } catch (e) {
      console.error(e);
    }
    setCommunitiesLoading(false);
  }, []);

  useEffect(() => {
    if (me) {
      fetchData();
      fetchCommunities();
    }
  }, [me, fetchData, fetchCommunities]);

  useEffect(() => {
    const unsub = navigation.addListener("focus", () => {
      if (!loading && me) {
        fetchData();
        fetchCommunities();
      }
    });
    return unsub;
  }, [navigation, loading, me]);

  // ── Search posts ──────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredPosts(posts);
      return;
    }
    const q = searchQuery.toLowerCase();
    setFilteredPosts(
      posts.filter(
        (p) =>
          p.title?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.tags?.some((t: string) => t.toLowerCase().includes(q)),
      ),
    );
  }, [searchQuery, posts]);

  const filteredCommunities = communitySearch.trim()
    ? communities.filter(
        (c) =>
          c.name.toLowerCase().includes(communitySearch.toLowerCase()) ||
          c.tags?.some((t) =>
            t.toLowerCase().includes(communitySearch.toLowerCase()),
          ),
      )
    : communities;

  // ── Follow ────────────────────────────────────────────────
  const handleFollow = async (target: any) => {
    if (!me) return;
    const already = following.some((u) => u.id === target.id);
    try {
      if (already) {
        await updateDoc(doc(db, "users", me.uid), {
          following: arrayRemove(target.id),
        });
        await updateDoc(doc(db, "users", target.id), {
          followers: arrayRemove(me.uid),
        });
        setFollowing((p) => p.filter((u) => u.id !== target.id));
        setSuggestions((p) => [target, ...p].slice(0, 8));
      } else {
        await updateDoc(doc(db, "users", me.uid), {
          following: arrayUnion(target.id),
        });
        await updateDoc(doc(db, "users", target.id), {
          followers: arrayUnion(me.uid),
        });
        setFollowing((p) => [...p, target]);
        setSuggestions((p) => p.filter((u) => u.id !== target.id));
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  // ── Like ──────────────────────────────────────────────────
  const handleLike = async (post: any) => {
    if (!me) return;
    const liked = post.likedBy?.includes(me.uid);
    const updated = {
      ...post,
      likedBy: liked
        ? post.likedBy.filter((id: string) => id !== me.uid)
        : [...(post.likedBy || []), me.uid],
    };
    setPosts((p) => p.map((x) => (x.id === post.id ? updated : x)));
    setSelectedPost((p: any) => (p?.id === post.id ? updated : p));
    await updateDoc(doc(db, "sharingPosts", post.id), {
      likedBy: liked ? arrayRemove(me.uid) : arrayUnion(me.uid),
    });
  };

  // ── Comment ───────────────────────────────────────────────
  const handleComment = async () => {
    if (!me || !comment.trim() || !selectedPost) return;
    setSubmitting(true);
    try {
      const snap = await getDoc(doc(db, "users", me.uid));
      const username = snap.exists()
        ? snap.data().displayName || me.email
        : me.email;
      const newC = {
        id: Date.now().toString(),
        userId: me.uid,
        username,
        text: comment.trim(),
        createdAt: new Date().toISOString(),
      };
      const updatedComments = [...(selectedPost.comments || []), newC];
      await updateDoc(doc(db, "sharingPosts", selectedPost.id), {
        comments: updatedComments,
      });
      const updated = { ...selectedPost, comments: updatedComments };
      setSelectedPost(updated);
      setPosts((p) => p.map((x) => (x.id === selectedPost.id ? updated : x)));
      setComment("");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = (commentId: string) => {
    if (!me || !selectedPost) return;
    Alert.alert("Delete Comment", "Remove this comment?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const updatedComments = selectedPost.comments.filter(
            (c: any) => c.id !== commentId,
          );
          await updateDoc(doc(db, "sharingPosts", selectedPost.id), {
            comments: updatedComments,
          });
          const updated = { ...selectedPost, comments: updatedComments };
          setSelectedPost(updated);
          setPosts((p) =>
            p.map((x) => (x.id === selectedPost.id ? updated : x)),
          );
        },
      },
    ]);
  };

  const handleDeletePost = (post: any) => {
    if (!me) return;
    if (!post.userId || post.userId !== me.uid) {
      Alert.alert("Permission denied", "You can only delete your own posts.");
      return;
    }
    Alert.alert("Delete Post", "This will permanently delete your post.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const urls: string[] = [...(post.media || [])];
            if (post.cover && !urls.includes(post.cover)) urls.push(post.cover);
            await Promise.allSettled(
              urls.map(async (url) => {
                const match =
                  url.match(/\/o\/(.+?)\?/) || url.match(/\/o%2F(.+?)\?/);
                if (match) {
                  try {
                    await deleteObject(
                      sRef(storage, decodeURIComponent(match[1])),
                    );
                  } catch (_) {}
                }
              }),
            );
            await deleteDoc(doc(db, "sharingPosts", post.id));
            setPosts((p) => p.filter((x) => x.id !== post.id));
            setFilteredPosts((p) => p.filter((x) => x.id !== post.id));
            setModalVisible(false);
            Alert.alert("✅ Deleted", "Your post has been removed.");
          } catch (e: any) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  };

  // ── Community join toggle ─────────────────────────────────
  const handleCommunityJoinToggle = async (
    communityId: string,
    joined: boolean,
  ) => {
    if (!me) return;
    setCommunities((prev) =>
      prev.map((c) =>
        c.id === communityId
          ? {
              ...c,
              memberIds: joined
                ? [...c.memberIds, me.uid]
                : c.memberIds.filter((id) => id !== me.uid),
            }
          : c,
      ),
    );
    if (selectedCommunity?.id === communityId) {
      setSelectedCommunity((prev) =>
        prev
          ? {
              ...prev,
              memberIds: joined
                ? [...prev.memberIds, me.uid]
                : prev.memberIds.filter((id) => id !== me.uid),
            }
          : prev,
      );
    }
  };

  const openPost = (post: any) => {
    setGalleryIndex(0);
    setSelectedPost(post);
    setModalVisible(true);
  };
  const openProfile = (userId: string) => {
    setProfileUserId(userId);
    setProfileVisible(true);
  };
  const visibleSuggestions = suggestions.filter((u) => !dismissed.has(u.id));

  // Grid rows helper
  const makeRows = (arr: any[]) => {
    const rows: any[][] = [];
    for (let i = 0; i < arr.length; i += NUM_COLS)
      rows.push(arr.slice(i, i + NUM_COLS));
    return rows;
  };

  if (loading)
    return (
      <View
        style={[s.root, { justifyContent: "center", alignItems: "center" }]}
      >
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={C.lime} size="large" />
      </View>
    );

  const LEFT_W = Math.round((width * 9) / 16);
  const RIGHT_W = width - LEFT_W;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Discover</Text>
        <View style={s.headerRight}>
          <TouchableOpacity
            style={s.headerBtn}
            onPress={() =>
              navigation.getParent()?.navigate("CameraScreen" as any)
            }
          >
            <Ionicons name="videocam-outline" size={19} color={C.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Tab Bar ── */}
      <View style={s.tabBar}>
        <TouchableOpacity
          style={[s.tab, activeTab === "posts" && s.tabActive]}
          onPress={() => setActiveTab("posts")}
        >
          <Ionicons
            name="images-outline"
            size={15}
            color={activeTab === "posts" ? C.lime : C.muted}
          />
          <Text style={[s.tabTxt, activeTab === "posts" && s.tabTxtActive]}>
            Posts
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, activeTab === "communities" && s.tabActive]}
          onPress={() => setActiveTab("communities")}
        >
          <Ionicons
            name="people-outline"
            size={15}
            color={activeTab === "communities" ? C.lime : C.muted}
          />
          <Text
            style={[s.tabTxt, activeTab === "communities" && s.tabTxtActive]}
          >
            Communities
          </Text>
          {communities.length > 0 && (
            <View style={s.tabBadge}>
              <Text style={s.tabBadgeTxt}>{communities.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ══ POSTS TAB ══ */}
      {activeTab === "posts" && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchData();
              }}
              tintColor={C.lime}
            />
          }
        >
          {/* Search */}
          <View style={[s.searchBar, searchFocused && { borderColor: C.lime }]}>
            <Ionicons
              name="search"
              size={16}
              color={searchFocused ? C.lime : C.muted}
              style={{ marginRight: 8 }}
            />
            <TextInput
              placeholder="Search posts, tags..."
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
          </View>

          {/* Following stories */}
          <Text style={s.sectionLbl}>FOLLOWING</Text>
          {following.length === 0 ? (
            <View style={s.noFollowBox}>
              <Ionicons name="people-outline" size={28} color={C.muted} />
              <Text style={s.noFollowTxt}>You're not following anyone yet</Text>
              <Text style={s.noFollowSub}>
                Check suggestions below to get started
              </Text>
            </View>
          ) : (
            <FlatList
              data={following}
              keyExtractor={(u) => u.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingBottom: 4,
              }}
              renderItem={({ item: u }) => (
                <TouchableOpacity
                  style={s.storyItem}
                  onPress={() => openProfile(u.id)}
                >
                  <View style={s.storyRing}>
                    {u.photoURL ? (
                      <Image
                        source={{ uri: u.photoURL }}
                        style={s.storyAvatar}
                      />
                    ) : (
                      <View style={[s.storyAvatar, s.storyFallback]}>
                        <Text style={s.storyInitial}>
                          {(u.displayName || u.email || "?")[0].toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.storyName} numberOfLines={1}>
                    {u.displayName || u.email?.split("@")[0] || "User"}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}

          {/* Suggestions */}
          {visibleSuggestions.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text style={s.sectionLbl}>SUGGESTED</Text>
              <FlatList
                data={visibleSuggestions}
                keyExtractor={(u) => u.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
                renderItem={({ item: u }) => (
                  <View style={s.sugCard}>
                    <TouchableOpacity
                      style={s.sugDismiss}
                      onPress={() => setDismissed((p) => new Set([...p, u.id]))}
                    >
                      <Ionicons name="close" size={11} color={C.muted} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openProfile(u.id)}>
                      {u.photoURL ? (
                        <Image
                          source={{ uri: u.photoURL }}
                          style={s.sugAvatar}
                        />
                      ) : (
                        <View style={[s.sugAvatar, s.sugFallback]}>
                          <Text style={s.sugInitial}>
                            {(u.displayName || "?")[0].toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <Text style={s.sugName} numberOfLines={1}>
                      {u.displayName || u.email?.split("@")[0] || "User"}
                    </Text>
                    <TouchableOpacity
                      style={s.followBtn}
                      onPress={() => handleFollow(u)}
                    >
                      <Text style={s.followBtnTxt}>Follow</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            </View>
          )}

          {/* Posts grid — marketplace style */}
          <Text style={s.sectionLbl}>
            {searchQuery
              ? `RESULTS (${filteredPosts.length})`
              : `POSTS (${filteredPosts.length})`}
          </Text>

          {filteredPosts.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="images-outline" size={44} color={C.muted} />
              <Text style={s.emptyTxt}>
                {searchQuery ? "No posts found" : "No posts yet"}
              </Text>
            </View>
          ) : (
            <View style={s.grid}>
              {makeRows(filteredPosts).map((row, ri) => (
                <View key={ri} style={s.row}>
                  {row.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      currentUserId={me?.uid || null}
                      onPress={() => openPost(post)}
                    />
                  ))}
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
      )}

      {/* ══ COMMUNITIES TAB ══ */}
      {activeTab === "communities" && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={communitiesLoading}
              onRefresh={fetchCommunities}
              tintColor={C.lime}
            />
          }
        >
          {/* Search communities */}
          <View style={[s.searchBar, { marginBottom: 4 }]}>
            <Ionicons
              name="search"
              size={16}
              color={C.muted}
              style={{ marginRight: 8 }}
            />
            <TextInput
              placeholder="Search communities..."
              placeholderTextColor={C.muted}
              value={communitySearch}
              onChangeText={setCommunitySearch}
              style={s.searchInput}
            />
            {!!communitySearch && (
              <TouchableOpacity onPress={() => setCommunitySearch("")}>
                <Ionicons name="close-circle" size={16} color={C.muted} />
              </TouchableOpacity>
            )}
          </View>

          {/* My communities */}
          {me && (
            <>
              <Text style={s.sectionLbl}>MY COMMUNITIES</Text>
              {communities.filter((c) => c.memberIds.includes(me.uid))
                .length === 0 ? (
                <View style={s.noFollowBox}>
                  <Ionicons name="people-outline" size={28} color={C.muted} />
                  <Text style={s.noFollowTxt}>
                    You haven't joined any communities yet
                  </Text>
                  <Text style={s.noFollowSub}>Browse below and join one!</Text>
                </View>
              ) : (
                <FlatList
                  data={communities.filter((c) => c.memberIds.includes(me.uid))}
                  keyExtractor={(c) => c.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{
                    paddingHorizontal: 16,
                    gap: 10,
                    paddingBottom: 4,
                  }}
                  renderItem={({ item: c }) => (
                    <TouchableOpacity
                      style={s.myCommunityChip}
                      onPress={() => {
                        setSelectedCommunity(c);
                        setCommunityDetailVisible(true);
                      }}
                    >
                      <View style={s.myCommunityIcon}>
                        <Ionicons name="people" size={14} color={C.lime} />
                      </View>
                      <Text style={s.myCommunityName} numberOfLines={1}>
                        {c.name}
                      </Text>
                      <Text style={s.myCommunityMeta}>
                        {c.memberIds.length} members
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              )}
            </>
          )}

          {/* All communities grid */}
          <Text style={s.sectionLbl}>
            {communitySearch
              ? `RESULTS (${filteredCommunities.length})`
              : `ALL COMMUNITIES (${filteredCommunities.length})`}
          </Text>

          {communitiesLoading ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <ActivityIndicator color={C.lime} />
            </View>
          ) : filteredCommunities.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="people-outline" size={44} color={C.muted} />
              <Text style={s.emptyTxt}>
                {communitySearch
                  ? "No communities found"
                  : "No communities yet"}
              </Text>
              <Text style={s.emptySubTxt}>Create the first one!</Text>
            </View>
          ) : (
            <View style={s.grid}>
              {makeRows(filteredCommunities).map((row, ri) => (
                <View key={ri} style={s.row}>
                  {row.map((c) => (
                    <CommunityCard
                      key={c.id}
                      community={c}
                      currentUserId={me?.uid || null}
                      onPress={() => {
                        setSelectedCommunity(c);
                        setCommunityDetailVisible(true);
                      }}
                      onJoinToggle={async () => {
                        if (!me) return;
                        const isMember = c.memberIds.includes(me.uid);
                        const ref = doc(db, "communities", c.id);
                        if (isMember) {
                          await updateDoc(ref, {
                            memberIds: arrayRemove(me.uid),
                          });
                          handleCommunityJoinToggle(c.id, false);
                        } else {
                          await updateDoc(ref, {
                            memberIds: arrayUnion(me.uid),
                          });
                          handleCommunityJoinToggle(c.id, true);
                        }
                      }}
                    />
                  ))}
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
      )}

      {/* ── FAB ── */}
      {activeTab === "posts" && (
        <TouchableOpacity
          style={s.fab}
          onPress={() => navigation.getParent()?.navigate("SharingEdit" as any)}
        >
          <Ionicons name="add" size={28} color={C.bg} />
        </TouchableOpacity>
      )}
      {activeTab === "communities" && (
        <TouchableOpacity
          style={s.fab}
          onPress={() => setCreateCommunityVisible(true)}
        >
          <Ionicons name="people" size={22} color={C.bg} />
        </TouchableOpacity>
      )}

      {/* ── User Profile Modal ── */}
      <UserProfileModal
        userId={profileUserId}
        visible={profileVisible}
        onClose={() => setProfileVisible(false)}
        currentUserId={me?.uid || null}
      />

      {/* ── Create Community Modal ── */}
      <CreateCommunityModal
        visible={createCommunityVisible}
        onClose={() => setCreateCommunityVisible(false)}
        currentUser={me}
        onCreated={(c) => {
          setCommunities((p) => [c, ...p]);
        }}
      />

      {/* ── Community Detail Modal ── */}
      <CommunityDetailModal
        community={selectedCommunity}
        visible={communityDetailVisible}
        onClose={() => setCommunityDetailVisible(false)}
        currentUser={me}
        onJoinToggle={handleCommunityJoinToggle}
      />

      {/* ══════════════════════════════════════════
          POST DETAIL MODAL — 16:9 landscape
      ══════════════════════════════════════════ */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setModalVisible(false)}
      >
        {selectedPost &&
          (() => {
            const isOwner = me?.uid ? selectedPost.userId === me.uid : false;
            const liked = me?.uid
              ? selectedPost.likedBy?.includes(me.uid)
              : false;
            const isFollowingAuthor = following.some(
              (u) => u.id === selectedPost.userId,
            );

            return (
              <View style={m.root}>
                <View style={m.topBar}>
                  <TouchableOpacity
                    style={m.topBtn}
                    onPress={() => setModalVisible(false)}
                  >
                    <Ionicons name="chevron-down" size={22} color={C.white} />
                  </TouchableOpacity>
                  <Text style={m.topTitle} numberOfLines={1}>
                    {selectedPost.title}
                  </Text>
                  {isOwner ? (
                    <TouchableOpacity
                      style={[m.topBtn, m.topBtnDanger]}
                      onPress={() => handleDeletePost(selectedPost)}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color={C.danger}
                      />
                    </TouchableOpacity>
                  ) : (
                    <View style={{ width: 40 }} />
                  )}
                </View>

                <View style={m.body}>
                  {/* Left: media */}
                  <View style={[m.leftPanel, { width: LEFT_W }]}>
                    <ScrollView
                      horizontal
                      pagingEnabled
                      showsHorizontalScrollIndicator={false}
                      style={{
                        width: LEFT_W,
                        height: "100%",
                        position: "absolute",
                      }}
                      onScroll={(e: any) => {
                        const idx = Math.round(
                          e.nativeEvent.contentOffset.x / LEFT_W,
                        );
                        setGalleryIndex(idx);
                      }}
                      scrollEventThrottle={16}
                    >
                      {(selectedPost.media?.length > 0
                        ? selectedPost.media
                        : [selectedPost.cover]
                      )
                        .filter(Boolean)
                        .map((uri: string, idx: number) => {
                          const isVideo =
                            selectedPost.mediaTypes?.[idx] === "video";
                          return isVideo ? (
                            <Video
                              key={idx}
                              source={{ uri }}
                              style={{ width: LEFT_W, height: "100%" }}
                              resizeMode={ResizeMode.COVER}
                              useNativeControls
                              shouldPlay={false}
                              isMuted={false}
                            />
                          ) : (
                            <Image
                              key={idx}
                              source={{ uri }}
                              style={{ width: LEFT_W, height: "100%" }}
                              resizeMode="cover"
                            />
                          );
                        })}
                    </ScrollView>

                    {(selectedPost.media?.length ?? 0) > 1 && (
                      <View style={m.photoBadge}>
                        <Ionicons
                          name="images-outline"
                          size={12}
                          color={C.white}
                        />
                        <Text style={m.photoBadgeText}>
                          {galleryIndex + 1}/{selectedPost.media.length}
                        </Text>
                      </View>
                    )}
                    {(selectedPost.media?.length ?? 0) > 1 && (
                      <View style={m.dotRow}>
                        {selectedPost.media.map((_: any, i: number) => (
                          <View
                            key={i}
                            style={[m.dot, i === galleryIndex && m.dotActive]}
                          />
                        ))}
                      </View>
                    )}

                    <View style={m.overlay}>
                      <View style={m.authorRow}>
                        <TouchableOpacity
                          onPress={() => openProfile(selectedPost.userId)}
                          style={m.authorAvatarWrap}
                        >
                          {selectedPost.authorPhotoURL ? (
                            <Image
                              source={{ uri: selectedPost.authorPhotoURL }}
                              style={m.authorAvatar}
                            />
                          ) : (
                            <View style={[m.authorAvatar, m.authorFallback]}>
                              <Text style={m.authorInitial}>
                                {(selectedPost.displayName ||
                                  "U")[0].toUpperCase()}
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                          <Text style={m.authorName}>
                            {selectedPost.displayName || "User"}
                          </Text>
                          <Text style={m.authorDate}>
                            {selectedPost.createdAt
                              ?.toDate?.()
                              ?.toLocaleDateString() ?? ""}
                          </Text>
                        </View>
                        {!isOwner && (
                          <TouchableOpacity
                            style={[
                              m.followBtn,
                              isFollowingAuthor && m.followBtnActive,
                            ]}
                            onPress={() =>
                              handleFollow({
                                id: selectedPost.userId,
                                displayName: selectedPost.displayName,
                              })
                            }
                          >
                            <Text
                              style={[
                                m.followBtnTxt,
                                isFollowingAuthor && { color: C.muted },
                              ]}
                            >
                              {isFollowingAuthor ? "Following" : "Follow"}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {selectedPost.description ? (
                        <Text style={m.desc} numberOfLines={2}>
                          {selectedPost.description}
                        </Text>
                      ) : null}

                      {selectedPost.tags?.length > 0 && (
                        <View style={m.tagsRow}>
                          {selectedPost.tags
                            .slice(0, 5)
                            .map((t: string, i: number) => (
                              <View key={i} style={m.tag}>
                                <Text style={m.tagTxt}>#{t}</Text>
                              </View>
                            ))}
                        </View>
                      )}

                      <View style={m.actions}>
                        <TouchableOpacity
                          style={m.actionBtn}
                          onPress={() => handleLike(selectedPost)}
                        >
                          <Ionicons
                            name={liked ? "heart" : "heart-outline"}
                            size={22}
                            color={liked ? C.pink : C.white}
                          />
                          <Text
                            style={[m.actionCount, liked && { color: C.pink }]}
                          >
                            {selectedPost.likedBy?.length || 0}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={m.actionBtn}>
                          <Ionicons
                            name="chatbubble-outline"
                            size={20}
                            color={C.white}
                          />
                          <Text style={m.actionCount}>
                            {selectedPost.comments?.length || 0}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={m.actionBtn}
                          onPress={() =>
                            Share.share({
                              message: `Check out "${selectedPost.title}" on FitApp! 💪`,
                            })
                          }
                        >
                          <Ionicons
                            name="share-social-outline"
                            size={20}
                            color={C.white}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* Right: comments */}
                  <KeyboardAvoidingView
                    style={[m.rightPanel, { width: RIGHT_W }]}
                    behavior={Platform.OS === "ios" ? "padding" : undefined}
                    keyboardVerticalOffset={0}
                  >
                    <Text style={m.commentsHdr}>COMMENTS</Text>
                    <ScrollView
                      style={{ flex: 1 }}
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                    >
                      {!selectedPost.comments ||
                      selectedPost.comments.length === 0 ? (
                        <View style={m.noComments}>
                          <Ionicons
                            name="chatbubble-outline"
                            size={26}
                            color={C.muted}
                          />
                          <Text style={m.noCommentsTxt}>No comments yet</Text>
                        </View>
                      ) : (
                        selectedPost.comments.map((c: any) => {
                          const mine = me?.uid === c.userId;
                          return (
                            <View key={c.id} style={m.commentItem}>
                              <TouchableOpacity
                                onPress={() => openProfile(c.userId)}
                              >
                                <View style={m.commentAvatar}>
                                  <Text style={m.commentAvatarTxt}>
                                    {(c.username || "U")[0].toUpperCase()}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                              <View style={{ flex: 1 }}>
                                <Text style={m.commentUser}>@{c.username}</Text>
                                <Text style={m.commentTxt}>{c.text}</Text>
                              </View>
                              {mine && (
                                <TouchableOpacity
                                  onPress={() => handleDeleteComment(c.id)}
                                  style={{ padding: 4 }}
                                >
                                  <Ionicons
                                    name="trash-outline"
                                    size={12}
                                    color={C.danger}
                                  />
                                </TouchableOpacity>
                              )}
                            </View>
                          );
                        })
                      )}
                      <View style={{ height: 12 }} />
                    </ScrollView>

                    <View style={m.inputRow}>
                      <TextInput
                        placeholder="Comment..."
                        placeholderTextColor={C.muted}
                        value={comment}
                        onChangeText={setComment}
                        style={m.input}
                        returnKeyType="send"
                        onSubmitEditing={handleComment}
                        multiline
                      />
                      <TouchableOpacity
                        style={[
                          m.sendBtn,
                          (!comment.trim() || submitting) && { opacity: 0.35 },
                        ]}
                        onPress={handleComment}
                        disabled={!comment.trim() || submitting}
                      >
                        {submitting ? (
                          <ActivityIndicator size="small" color={C.bg} />
                        ) : (
                          <Ionicons name="send" size={14} color={C.bg} />
                        )}
                      </TouchableOpacity>
                    </View>
                  </KeyboardAvoidingView>
                </View>
              </View>
            );
          })()}
      </Modal>
    </View>
  );
}

// ── Main screen styles ────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    color: C.white,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  headerRight: { flexDirection: "row", gap: 8 },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
  },
  // Tab bar
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  tabActive: { borderBottomWidth: 2, borderBottomColor: C.lime },
  tabTxt: { color: C.muted, fontSize: 13, fontWeight: "700" },
  tabTxtActive: { color: C.lime },
  tabBadge: {
    backgroundColor: C.lime,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tabBadgeTxt: { color: C.bg, fontSize: 9, fontWeight: "900" },
  // Search
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: C.card,
    borderColor: C.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.white, padding: 0 },
  sectionLbl: {
    color: C.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    paddingHorizontal: 16,
    marginBottom: 10,
    marginTop: 8,
  },
  // Following
  noFollowBox: {
    alignItems: "center",
    padding: 18,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  noFollowTxt: { color: C.white, fontSize: 13, fontWeight: "700" },
  noFollowSub: { color: C.muted, fontSize: 12, textAlign: "center" },
  storyItem: { marginRight: 14, alignItems: "center", width: 64 },
  storyRing: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 2.5,
    borderColor: C.lime,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 5,
  },
  storyAvatar: { width: 58, height: 58, borderRadius: 29 },
  storyFallback: {
    backgroundColor: C.cardAlt,
    justifyContent: "center",
    alignItems: "center",
  },
  storyInitial: { color: C.lime, fontSize: 20, fontWeight: "900" },
  storyName: {
    color: C.white,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  // Suggestions
  sugCard: {
    width: 108,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    alignItems: "center",
    position: "relative",
  },
  sugDismiss: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.cardAlt,
    justifyContent: "center",
    alignItems: "center",
  },
  sugAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginBottom: 8,
    marginTop: 4,
  },
  sugFallback: {
    backgroundColor: C.cardAlt,
    justifyContent: "center",
    alignItems: "center",
  },
  sugInitial: { color: C.lime, fontSize: 18, fontWeight: "900" },
  sugName: {
    color: C.white,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  followBtn: {
    backgroundColor: C.lime,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  followBtnTxt: { color: C.bg, fontSize: 11, fontWeight: "800" },
  // Grid
  grid: { paddingHorizontal: 16 },
  row: { flexDirection: "row", gap: 10, marginBottom: 0 },
  // Empty
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyTxt: { color: C.white, fontSize: 15, fontWeight: "700" },
  emptySubTxt: { color: C.muted, fontSize: 13 },
  // FAB
  fab: {
    position: "absolute",
    bottom: 32,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.lime,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: C.lime,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  // My community chips
  myCommunityChip: {
    width: 120,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: C.lime + "40",
    alignItems: "center",
    gap: 5,
  },
  myCommunityIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.lime + "18",
    justifyContent: "center",
    alignItems: "center",
  },
  myCommunityName: {
    color: C.white,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  myCommunityMeta: { color: C.muted, fontSize: 10 },
});

// ── Modal styles ──────────────────────────────────────────
const m = StyleSheet.create({
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
  topBtnDanger: {
    borderColor: C.danger + "55",
    backgroundColor: C.danger + "15",
  },
  topTitle: {
    flex: 1,
    color: C.white,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
    marginHorizontal: 10,
  },
  body: { flex: 1, flexDirection: "row" },
  leftPanel: { height: "100%" },
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingBottom: 16,
    paddingTop: 30,
    backgroundColor: "rgba(0,0,0,0.52)",
  },
  photoBadge: {
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
  photoBadgeText: { color: C.white, fontSize: 11, fontWeight: "700" },
  dotRow: {
    position: "absolute",
    bottom: 110,
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
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  dotActive: { backgroundColor: C.lime, width: 16 },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 9,
  },
  authorAvatarWrap: {},
  authorAvatar: { width: 36, height: 36, borderRadius: 10 },
  authorFallback: {
    backgroundColor: C.lime + "25",
    borderWidth: 1.5,
    borderColor: C.lime + "55",
    justifyContent: "center",
    alignItems: "center",
  },
  authorInitial: { color: C.lime, fontSize: 15, fontWeight: "900" },
  authorName: { color: C.white, fontSize: 13, fontWeight: "700" },
  authorDate: { color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 1 },
  followBtn: {
    backgroundColor: C.lime,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  followBtnActive: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  followBtnTxt: { color: C.bg, fontSize: 11, fontWeight: "800" },
  desc: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 7,
  },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: 8 },
  tag: {
    backgroundColor: "rgba(200,241,53,0.18)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  tagTxt: { color: C.lime, fontSize: 10, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 16, marginTop: 4 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionCount: { color: C.white, fontSize: 13, fontWeight: "600" },
  rightPanel: {
    backgroundColor: C.card,
    borderLeftWidth: 1,
    borderLeftColor: C.border,
    paddingTop: 12,
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  commentsHdr: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  noComments: { alignItems: "center", paddingVertical: 30, gap: 8 },
  noCommentsTxt: { color: C.muted, fontSize: 13 },
  commentItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
    gap: 7,
  },
  commentAvatar: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: C.lime + "20",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  commentAvatarTxt: { color: C.lime, fontSize: 11, fontWeight: "900" },
  commentUser: {
    color: C.lime,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 2,
  },
  commentTxt: { color: C.white, fontSize: 12, lineHeight: 16 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: C.cardAlt,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 6,
    gap: 7,
  },
  input: { flex: 1, fontSize: 12, color: C.white, padding: 0, maxHeight: 68 },
  sendBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.lime,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
});
