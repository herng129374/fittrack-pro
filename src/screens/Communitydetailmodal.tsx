import React, { useState, useEffect } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  Alert,
  StyleSheet,
  Text,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { User } from "firebase/auth";
import {
  getFirestore,
  setDoc,
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";

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

export interface Community {
  id: string;
  name: string;
  description: string;
  coverURL?: string;
  memberIds: string[];
  adminId: string;
  adminName: string;
  tags: string[];
  createdAt: any;
  postCount: number;
  isPrivate?: boolean;
}

export interface CommunityPost {
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

export interface CommunityComment {
  id: string;
  userId: string;
  username: string;
  text: string;
  createdAt: string;
}

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

// ── Post options bottom sheet (delete) ────────────────────
function PostOptionsSheet({
  visible,
  onClose,
  onDelete,
  isOwner,
}: {
  visible: boolean;
  onClose: () => void;
  onDelete: () => void;
  isOwner: boolean;
}) {
  if (!visible) return null;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={pos.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={pos.sheet}>
          <View style={pos.handle} />
          {isOwner && (
            <TouchableOpacity
              style={pos.option}
              onPress={() => {
                onClose();
                onDelete();
              }}
            >
              <Ionicons name="trash-outline" size={18} color={C.danger} />
              <Text style={[pos.optionTxt, { color: C.danger }]}>
                Delete Post
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={pos.option}
            onPress={() => {
              Share.share({ message: "Check out this community post!" });
              onClose();
            }}
          >
            <Ionicons name="share-social-outline" size={18} color={C.white} />
            <Text style={pos.optionTxt}>Share Post</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              pos.option,
              { borderTopWidth: 1, borderTopColor: C.border, marginTop: 4 },
            ]}
            onPress={onClose}
          >
            <Text style={[pos.optionTxt, { color: C.muted }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
const pos = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: C.border,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  optionTxt: { color: C.white, fontSize: 15, fontWeight: "600" },
});

export default function CommunityDetailModal({
  community,
  visible,
  onClose,
  currentUser,
  onJoinToggle,
  onCommunityUpdated,
}: {
  community: Community | null;
  visible: boolean;
  onClose: () => void;
  currentUser: User | null;
  onJoinToggle: (communityId: string, joined: boolean) => void;
  onCommunityUpdated?: (updated: Community) => void;
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
  const [optionsPost, setOptionsPost] = useState<CommunityPost | null>(null);
  const [localCommunity, setLocalCommunity] = useState<Community | null>(
    community,
  );
  const [joinRequested, setJoinRequested] = useState(false);

  const isMember = localCommunity
    ? localCommunity.memberIds.includes(currentUser?.uid || "")
    : false;
  const isAdmin = localCommunity
    ? localCommunity.adminId === currentUser?.uid
    : false;

  useEffect(() => {
    setLocalCommunity(community);
  }, [community]);

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

  useEffect(() => {
    if (!visible || !community?.isPrivate || !currentUser) return;
    const check = async () => {
      const reqDoc = await getDoc(
        doc(db, "joinRequests", `${community.id}_${currentUser.uid}`),
      );
      if (reqDoc.exists() && reqDoc.data().status === "pending") {
        setJoinRequested(true);
      } else {
        setJoinRequested(false);
      }
    };
    check();
  }, [visible, community, currentUser]);

  const handleJoinToggle = async () => {
    if (!currentUser || !localCommunity) return;
    const ref = doc(db, "communities", localCommunity.id);

    if (isMember) {
      // ── 退出社区 ──
      await updateDoc(ref, { memberIds: arrayRemove(currentUser.uid) });
      const updated = {
        ...localCommunity,
        memberIds: localCommunity.memberIds.filter(
          (id) => id !== currentUser.uid,
        ),
      };
      setLocalCommunity(updated);
      onJoinToggle(localCommunity.id, false);
      onCommunityUpdated?.(updated);
    } else if (localCommunity.isPrivate) {
      // ── Private：发送加入申请 ──
      if (joinRequested) {
        Alert.alert(
          "Already Requested",
          "Your join request is pending approval.",
        );
        return;
      }
      try {
        const userSnap = await getDoc(doc(db, "users", currentUser.uid));
        const requesterName = userSnap.exists()
          ? userSnap.data().displayName || currentUser.email
          : currentUser.email;
        const requesterPhotoURL = userSnap.exists()
          ? userSnap.data().photoURL || ""
          : "";

        // 存 joinRequest
        await setDoc(
          doc(db, "joinRequests", `${localCommunity.id}_${currentUser.uid}`),
          {
            communityId: localCommunity.id,
            communityName: localCommunity.name,
            userId: currentUser.uid,
            status: "pending",
            createdAt: serverTimestamp(),
          },
        );

        // 发通知给 admin
        await addDoc(collection(db, "notifications"), {
          type: "join_request",
          communityId: localCommunity.id,
          communityName: localCommunity.name,
          requesterId: currentUser.uid,
          requesterName,
          requesterPhotoURL,
          adminId: localCommunity.adminId,
          status: "pending",
          read: false,
          createdAt: serverTimestamp(),
        });

        setJoinRequested(true);
        Alert.alert("Request Sent! ✅", "The admin will review your request.");
      } catch (e: any) {
        Alert.alert("Error", e.message);
      }
    } else {
      // ── Public：直接加入 ──
      await updateDoc(ref, { memberIds: arrayUnion(currentUser.uid) });
      const updated = {
        ...localCommunity,
        memberIds: [...localCommunity.memberIds, currentUser.uid],
      };
      setLocalCommunity(updated);
      onJoinToggle(localCommunity.id, true);
      onCommunityUpdated?.(updated);
    }
  };

  const handleSubmitPost = async () => {
    if (!currentUser || !localCommunity || !postBody.trim()) return;
    setSubmitting(true);
    try {
      const snap = await getDoc(doc(db, "users", currentUser.uid));
      const displayName = snap.exists()
        ? snap.data().displayName || currentUser.email
        : currentUser.email;
      const photoURL = snap.exists() ? snap.data().photoURL : null;
      const newPost: Omit<CommunityPost, "id"> = {
        communityId: localCommunity.id,
        communityName: localCommunity.name,
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
      // Update postCount
      const newCount = (localCommunity.postCount || 0) + 1;
      await updateDoc(doc(db, "communities", localCommunity.id), {
        postCount: newCount,
      });
      const updated = { ...localCommunity, postCount: newCount };
      setLocalCommunity(updated);
      onCommunityUpdated?.(updated);
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
      setPosts((p) =>
        p.map((x) =>
          x.id === post.id ? { ...x, comments: updatedComments } : x,
        ),
      );
      setCommentText("");
      setCommentingOn(null);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  // ── DELETE own post ───────────────────────────────────────
  const handleDeletePost = (post: CommunityPost) => {
    Alert.alert(
      "Delete Post",
      "Are you sure you want to delete this post? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "communityPosts", post.id));
              setPosts((p) => p.filter((x) => x.id !== post.id));
              // Decrement postCount
              if (localCommunity) {
                const newCount = Math.max(
                  0,
                  (localCommunity.postCount || 1) - 1,
                );
                await updateDoc(doc(db, "communities", localCommunity.id), {
                  postCount: newCount,
                });
                const updated = { ...localCommunity, postCount: newCount };
                setLocalCommunity(updated);
                onCommunityUpdated?.(updated);
              }
              Alert.alert("✅ Deleted", "Your post has been removed.");
            } catch (e: any) {
              Alert.alert("Error", e.message);
            }
          },
        },
      ],
    );
  };

  if (!localCommunity) return null;

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
      <View style={s.root}>
        {/* Cover */}
        <View style={s.coverArea}>
          {localCommunity.coverURL ? (
            <Image
              source={{ uri: localCommunity.coverURL }}
              style={s.cover}
              resizeMode="cover"
            />
          ) : (
            <View style={[s.cover, s.coverFallback]}>
              <Ionicons name="people" size={48} color={C.lime + "60"} />
            </View>
          )}
          <View style={s.coverOverlay} />
          <TouchableOpacity style={s.backBtn} onPress={onClose}>
            <Ionicons name="chevron-down" size={22} color={C.white} />
          </TouchableOpacity>
        </View>

        {/* Info bar */}
        <View style={s.infoBar}>
          <View style={s.infoIconWrap}>
            <Ionicons name="people" size={22} color={C.lime} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.communityName}>{localCommunity.name}</Text>
            <Text style={s.communityMeta}>
              {localCommunity.memberIds.length} members ·{" "}
              {localCommunity.postCount || posts.length} posts
              {localCommunity.isPrivate ? " · 🔒 Private" : " · 🌐 Public"}
            </Text>
          </View>
          {!isAdmin && (
            <TouchableOpacity
              style={[
                s.joinBtn,
                isMember && s.joinBtnActive,
                joinRequested && !isMember && s.joinBtnPending,
              ]}
              onPress={handleJoinToggle}
            >
              <Text
                style={[
                  s.joinBtnTxt,
                  (isMember || joinRequested) && { color: C.muted },
                ]}
              >
                {isMember ? "Joined ✓" : joinRequested ? "⏳ Pending" : "Join"}
              </Text>
            </TouchableOpacity>
          )}
          {isAdmin && (
            <View style={s.adminBadge}>
              <Ionicons name="shield-checkmark" size={12} color={C.lime} />
              <Text style={s.adminBadgeTxt}>Admin</Text>
            </View>
          )}
        </View>

        {localCommunity.description ? (
          <Text style={s.communityDesc}>{localCommunity.description}</Text>
        ) : null}

        {localCommunity.tags?.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.tagsRow}
          >
            {localCommunity.tags.map((t, i) => (
              <View key={i} style={s.tag}>
                <Text style={s.tagTxt}>#{t}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Create post trigger */}
        {isMember || isAdmin ? (
          <TouchableOpacity
            style={s.createPostBar}
            onPress={() => setShowCreatePost(!showCreatePost)}
          >
            <View style={s.createPostAvatar}>
              <Ionicons name="person" size={14} color={C.muted} />
            </View>
            <Text style={s.createPostPlaceholder}>
              Share something with the community...
            </Text>
            <Ionicons
              name={showCreatePost ? "chevron-up" : "chevron-down"}
              size={16}
              color={C.muted}
            />
          </TouchableOpacity>
        ) : (
          <View style={s.joinPrompt}>
            <Ionicons name="lock-closed-outline" size={14} color={C.muted} />
            <Text style={s.joinPromptTxt}>
              Join this community to post and comment
            </Text>
          </View>
        )}

        {/* Create post form */}
        {showCreatePost && (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={s.createPostForm}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 7, marginBottom: 10 }}
              >
                {POST_TYPES.map((pt) => (
                  <TouchableOpacity
                    key={pt.type}
                    style={[
                      s.typeChip,
                      postType === pt.type && s.typeChipActive,
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
                        s.typeChipTxt,
                        postType === pt.type && { color: C.bg },
                      ]}
                    >
                      {pt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TextInput
                style={s.postTitleInput}
                placeholder="Title (optional)"
                placeholderTextColor={C.muted}
                value={postTitle}
                onChangeText={setPostTitle}
              />
              <TextInput
                style={s.postBodyInput}
                placeholder="What's on your mind? Ask a question, share a tip..."
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
                  style={s.cancelPostBtn}
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
                    s.submitPostBtn,
                    (!postBody.trim() || submitting) && { opacity: 0.4 },
                  ]}
                  onPress={handleSubmitPost}
                  disabled={!postBody.trim() || submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color={C.bg} />
                  ) : (
                    <Text style={s.submitPostTxt}>Post</Text>
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
            <View style={s.emptyFeed}>
              <Ionicons name="chatbubbles-outline" size={40} color={C.muted} />
              <Text style={s.emptyFeedTxt}>No posts yet</Text>
              <Text style={s.emptyFeedSub}>
                Be the first to share something!
              </Text>
            </View>
          ) : (
            posts.map((post) => {
              const liked = post.likedBy.includes(currentUser?.uid || "");
              const expanded = expandedPost === post.id;
              const isMyPost = post.userId === currentUser?.uid;

              return (
                <View key={post.id} style={s.postCard}>
                  <View style={s.postHeader}>
                    <View style={s.postAvatar}>
                      {post.authorPhotoURL ? (
                        <Image
                          source={{ uri: post.authorPhotoURL }}
                          style={{
                            width: "100%",
                            height: "100%",
                            borderRadius: 10,
                          }}
                        />
                      ) : (
                        <Text style={s.postAvatarTxt}>
                          {(post.displayName || "U")[0].toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Text style={s.postAuthor}>{post.displayName}</Text>
                        {isMyPost && (
                          <View style={s.myPostBadge}>
                            <Text style={s.myPostBadgeTxt}>You</Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.postDate}>
                        {post.createdAt?.toDate?.()?.toLocaleDateString() ??
                          "Just now"}
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <PostTypeBadge type={post.postType} />
                      {/* ⋯ menu — only show delete for own posts */}
                      {(isMyPost || isAdmin) && (
                        <TouchableOpacity
                          style={s.moreBtn}
                          onPress={() => setOptionsPost(post)}
                        >
                          <Ionicons
                            name="ellipsis-horizontal"
                            size={16}
                            color={C.muted}
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {post.title ? (
                    <Text style={s.postTitle}>{post.title}</Text>
                  ) : null}
                  <Text
                    style={s.postBody}
                    numberOfLines={expanded ? undefined : 4}
                  >
                    {post.body}
                  </Text>
                  {post.body.length > 200 && (
                    <TouchableOpacity
                      onPress={() => setExpandedPost(expanded ? null : post.id)}
                    >
                      <Text style={s.readMore}>
                        {expanded ? "Show less" : "Read more"}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <View style={s.postActions}>
                    <TouchableOpacity
                      style={s.postAction}
                      onPress={() => handleLikePost(post)}
                    >
                      <Ionicons
                        name={liked ? "heart" : "heart-outline"}
                        size={17}
                        color={liked ? C.pink : C.muted}
                      />
                      <Text
                        style={[s.postActionTxt, liked && { color: C.pink }]}
                      >
                        {post.likedBy.length}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.postAction}
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
                      <Text style={s.postActionTxt}>
                        {post.comments?.length || 0}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.postAction}
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

                  {(commentingOn === post.id ||
                    (post.comments?.length || 0) > 0) && (
                    <View style={s.commentsSection}>
                      {post.comments?.slice(-3).map((c) => (
                        <View key={c.id} style={s.commentRow}>
                          <View style={s.commentAvatar}>
                            <Text style={s.commentAvatarTxt}>
                              {(c.username || "U")[0].toUpperCase()}
                            </Text>
                          </View>
                          <View style={s.commentBubble}>
                            <Text style={s.commentUser}>@{c.username}</Text>
                            <Text style={s.commentTxt}>{c.text}</Text>
                          </View>
                        </View>
                      ))}
                      {(post.comments?.length || 0) > 3 && (
                        <TouchableOpacity
                          onPress={() => setExpandedPost(post.id)}
                        >
                          <Text style={s.viewAllComments}>
                            View all {post.comments.length} comments
                          </Text>
                        </TouchableOpacity>
                      )}
                      {(isMember || isAdmin) && commentingOn === post.id && (
                        <View style={s.commentInputRow}>
                          <TextInput
                            style={s.commentInput}
                            placeholder="Write a comment..."
                            placeholderTextColor={C.muted}
                            value={commentText}
                            onChangeText={setCommentText}
                            multiline
                          />
                          <TouchableOpacity
                            style={[
                              s.commentSendBtn,
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

      {/* Post options sheet */}
      <PostOptionsSheet
        visible={!!optionsPost}
        onClose={() => setOptionsPost(null)}
        isOwner={optionsPost?.userId === currentUser?.uid}
        onDelete={() => {
          if (optionsPost) handleDeletePost(optionsPost);
          setOptionsPost(null);
        }}
      />
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  coverArea: { height: 140, position: "relative" },
  cover: { width: "100%", height: "100%" },
  coverFallback: {
    backgroundColor: C.card,
    justifyContent: "center",
    alignItems: "center",
  },
  joinBtnPending: {
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.orange,
  },
  coverOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
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
  myPostBadge: {
    backgroundColor: C.blue + "25",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  myPostBadgeTxt: { color: C.blue, fontSize: 9, fontWeight: "800" },
  moreBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: C.cardAlt,
    justifyContent: "center",
    alignItems: "center",
  },
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
