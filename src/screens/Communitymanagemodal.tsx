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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { User } from "firebase/auth";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";
import { Community } from "./Communitydetailmodal";

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
  orange: "#f97316",
  green: "#22c55e",
};

// ── Confirm Delete Sheet ───────────────────────────────────
function ConfirmDeleteSheet({
  visible,
  communityName,
  onCancel,
  onConfirm,
  loading,
}: {
  visible: boolean;
  communityName: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={cd.backdrop}>
        <View style={cd.sheet}>
          <View style={cd.iconWrap}>
            <Ionicons name="trash" size={28} color={C.danger} />
          </View>
          <Text style={cd.title}>Delete Community</Text>
          <Text style={cd.body}>
            Are you sure you want to delete{" "}
            <Text style={{ color: C.white, fontWeight: "800" }}>
              "{communityName}"
            </Text>
            ? This will permanently remove the community and all its posts. This
            cannot be undone.
          </Text>
          <View style={cd.btnRow}>
            <TouchableOpacity style={cd.cancelBtn} onPress={onCancel}>
              <Text style={cd.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[cd.deleteBtn, loading && { opacity: 0.5 }]}
              onPress={onConfirm}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={cd.deleteTxt}>Delete</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const cd = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sheet: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.danger + "18",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  title: { color: C.white, fontSize: 18, fontWeight: "900", marginBottom: 10 },
  body: {
    color: C.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 20,
  },
  btnRow: { flexDirection: "row", gap: 10, width: "100%" },
  cancelBtn: {
    flex: 1,
    backgroundColor: C.cardAlt,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  cancelTxt: { color: C.white, fontSize: 14, fontWeight: "700" },
  deleteBtn: {
    flex: 1,
    backgroundColor: C.danger,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  deleteTxt: { color: "#fff", fontSize: 14, fontWeight: "900" },
});

// ── Edit Community Sheet ───────────────────────────────────
// ✅ 只保留 Edit 相关的 state，不包含 requests 逻辑
function EditCommunitySheet({
  visible,
  community,
  onClose,
  onSaved,
}: {
  visible: boolean;
  community: Community | null;
  onClose: () => void;
  onSaved: (updated: Community) => void;
}) {
  const db = getFirestore();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (community) {
      setName(community.name);
      setDescription(community.description || "");
      setTags(community.tags?.join(", ") || "");
      setIsPrivate(community.isPrivate || false);
    }
  }, [community]);

  const handleSave = async () => {
    if (!community || !name.trim()) return;
    setSaving(true);
    try {
      const tagArr = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await updateDoc(doc(db, "communities", community.id), {
        name: name.trim(),
        description: description.trim(),
        tags: tagArr,
        isPrivate,
      });
      onSaved({
        ...community,
        name: name.trim(),
        description: description.trim(),
        tags: tagArr,
        isPrivate,
      });
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
    setSaving(false);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={es.backdrop}>
        <View style={es.sheet}>
          <View style={es.topRow}>
            <Text style={es.title}>Edit Community</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={20} color={C.muted} />
            </TouchableOpacity>
          </View>

          <Text style={es.label}>Name *</Text>
          <TextInput
            style={es.input}
            value={name}
            onChangeText={setName}
            placeholderTextColor={C.muted}
            placeholder="Community name"
            maxLength={50}
          />

          <Text style={es.label}>Description</Text>
          <TextInput
            style={[es.input, { height: 80, textAlignVertical: "top" }]}
            value={description}
            onChangeText={setDescription}
            placeholderTextColor={C.muted}
            placeholder="Description"
            multiline
            maxLength={300}
          />

          <Text style={es.label}>Tags</Text>
          <TextInput
            style={es.input}
            value={tags}
            onChangeText={setTags}
            placeholderTextColor={C.muted}
            placeholder="e.g. fitness, running"
          />

          <TouchableOpacity
            style={es.toggleRow}
            onPress={() => setIsPrivate(!isPrivate)}
          >
            <Text style={es.toggleTxt}>Private Community</Text>
            <View style={[es.toggle, isPrivate && es.toggleActive]}>
              {isPrivate && (
                <Ionicons name="checkmark" size={13} color={C.bg} />
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[es.saveBtn, (!name.trim() || saving) && { opacity: 0.4 }]}
            onPress={handleSave}
            disabled={!name.trim() || saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={C.bg} />
            ) : (
              <Text style={es.saveTxt}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const es = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderColor: C.border,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  title: { color: C.white, fontSize: 17, fontWeight: "900" },
  label: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    color: C.white,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingVertical: 10,
  },
  toggleTxt: { color: C.white, fontSize: 14, fontWeight: "600" },
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
  saveBtn: {
    backgroundColor: C.lime,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 18,
  },
  saveTxt: { color: C.bg, fontSize: 14, fontWeight: "900" },
});

// ── Member Row ────────────────────────────────────────────
function MemberRow({ userId, adminId }: { userId: string; adminId: string }) {
  const db = getFirestore();
  const [userData, setUserData] = useState<any>(null);

  useEffect(() => {
    getDoc(doc(db, "users", userId)).then((snap) => {
      if (snap.exists()) setUserData(snap.data());
    });
  }, [userId]);

  return (
    <View style={mr.row}>
      <View style={mr.avatar}>
        {userData?.photoURL ? (
          <Image
            source={{ uri: userData.photoURL }}
            style={{ width: "100%", height: "100%", borderRadius: 20 }}
          />
        ) : (
          <Text style={mr.initial}>
            {(userData?.displayName || "U")[0].toUpperCase()}
          </Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={mr.name}>
          {userData?.displayName || userData?.email || "Member"}
        </Text>
        <Text style={mr.sub}>{userData?.email || ""}</Text>
      </View>
      {userId === adminId && (
        <View style={mr.adminBadge}>
          <Ionicons name="shield-checkmark" size={10} color={C.lime} />
          <Text style={mr.adminTxt}>Admin</Text>
        </View>
      )}
    </View>
  );
}

const mr = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.lime + "20",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  initial: { color: C.lime, fontSize: 16, fontWeight: "900" },
  name: { color: C.white, fontSize: 13, fontWeight: "700" },
  sub: { color: C.muted, fontSize: 11, marginTop: 1 },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.lime + "20",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  adminTxt: { color: C.lime, fontSize: 10, fontWeight: "800" },
});

// ══════════════════════════════════════════════════════════
// MAIN: CommunityManageModal
// ══════════════════════════════════════════════════════════
export default function CommunityManageModal({
  visible,
  onClose,
  currentUser,
  communities,
  onCommunityDeleted,
  onCommunityUpdated,
}: {
  visible: boolean;
  onClose: () => void;
  currentUser: User | null;
  communities: Community[];
  onCommunityDeleted: (id: string) => void;
  onCommunityUpdated: (updated: Community) => void;
}) {
  const db = getFirestore();

  // ✅ activeTab 现在包含 "requests"
  const [activeTab, setActiveTab] = useState<"admin" | "joined" | "requests">(
    "admin",
  );
  const [deleteTarget, setDeleteTarget] = useState<Community | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<Community | null>(null);
  const [expandedCommunity, setExpandedCommunity] = useState<string | null>(
    null,
  );

  // ✅ requests state 在 CommunityManageModal 里
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  const adminCommunities = communities.filter(
    (c) => c.adminId === currentUser?.uid,
  );
  const joinedCommunities = communities.filter(
    (c) =>
      c.memberIds.includes(currentUser?.uid || "") &&
      c.adminId !== currentUser?.uid,
  );

  // ✅ loadRequests 在 CommunityManageModal 里
  useEffect(() => {
    if (!visible || !currentUser) return;
    const loadRequests = async () => {
      setRequestsLoading(true);
      try {
        const snap = await getDocs(
          query(
            collection(db, "notifications"),
            where("adminId", "==", currentUser.uid),
            where("status", "==", "pending"),
            where("type", "==", "join_request"),
          ),
        );
        setPendingRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
      }
      setRequestsLoading(false);
    };
    loadRequests();
  }, [visible, currentUser]);

  // ✅ handleApprove 在 CommunityManageModal 里，可以访问 communities 和 onCommunityUpdated
  const handleApprove = async (request: any) => {
    try {
      const community = communities.find((c) => c.id === request.communityId);
      if (!community) return;

      await updateDoc(doc(db, "communities", request.communityId), {
        memberIds: arrayUnion(request.requesterId),
      });
      await updateDoc(doc(db, "notifications", request.id), {
        status: "approved",
      });

      // 通知申请者
      await addDoc(collection(db, "notifications"), {
        type: "join_approved",
        communityId: request.communityId,
        communityName: request.communityName,
        requesterId: request.requesterId,
        adminId: request.adminId,
        status: "approved",
        read: false,
        createdAt: serverTimestamp(),
      });

      setPendingRequests((p) => p.filter((r) => r.id !== request.id));
      onCommunityUpdated({
        ...community,
        memberIds: [...community.memberIds, request.requesterId],
      });
      Alert.alert("✅ Approved", `${request.requesterName} has joined!`);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  // ✅ handleReject 在 CommunityManageModal 里
  const handleReject = async (request: any) => {
    try {
      await updateDoc(doc(db, "notifications", request.id), {
        status: "rejected",
      });
      setPendingRequests((p) => p.filter((r) => r.id !== request.id));
      Alert.alert("Rejected", "Request has been declined.");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !currentUser) return;
    setDeleting(true);
    try {
      const postsSnap = await getDocs(
        query(
          collection(db, "communityPosts"),
          where("communityId", "==", deleteTarget.id),
        ),
      );
      await Promise.all(postsSnap.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(doc(db, "communities", deleteTarget.id));
      onCommunityDeleted(deleteTarget.id);
      setDeleteTarget(null);
      Alert.alert(
        "✅ Deleted",
        `"${deleteTarget.name}" has been permanently deleted.`,
      );
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
    setDeleting(false);
  };

  const handleLeave = async (community: Community) => {
    if (!currentUser) return;
    Alert.alert("Leave Community", `Leave "${community.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          try {
            await updateDoc(doc(db, "communities", community.id), {
              memberIds: community.memberIds.filter(
                (id) => id !== currentUser.uid,
              ),
            });
            onCommunityUpdated({
              ...community,
              memberIds: community.memberIds.filter(
                (id) => id !== currentUser.uid,
              ),
            });
            Alert.alert("Left", `You've left "${community.name}".`);
          } catch (e: any) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  };

  const renderCommunityCard = (community: Community, isAdmin: boolean) => {
    const expanded = expandedCommunity === community.id;
    return (
      <View key={community.id} style={m.communityCard}>
        <TouchableOpacity
          style={m.cardHeader}
          onPress={() => setExpandedCommunity(expanded ? null : community.id)}
        >
          <View style={m.cardIcon}>
            <Ionicons name="people" size={18} color={C.lime} />
          </View>
          <View style={{ flex: 1 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 7 }}
            >
              <Text style={m.cardName}>{community.name}</Text>
              {community.isPrivate && (
                <Ionicons name="lock-closed" size={11} color={C.muted} />
              )}
            </View>
            <Text style={m.cardMeta}>
              {community.memberIds.length} members · {community.postCount || 0}{" "}
              posts
            </Text>
          </View>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={C.muted}
          />
        </TouchableOpacity>

        {community.tags?.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={m.tagsRow}
          >
            {community.tags.map((t, i) => (
              <View key={i} style={m.tag}>
                <Text style={m.tagTxt}>#{t}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {expanded && (
          <View style={m.membersSection}>
            <Text style={m.sectionLbl}>
              MEMBERS ({community.memberIds.length})
            </Text>
            {community.memberIds.slice(0, 5).map((uid) => (
              <MemberRow key={uid} userId={uid} adminId={community.adminId} />
            ))}
            {community.memberIds.length > 5 && (
              <Text style={m.moreMembersTxt}>
                +{community.memberIds.length - 5} more members
              </Text>
            )}
          </View>
        )}

        <View style={m.cardActions}>
          {isAdmin ? (
            <>
              <TouchableOpacity
                style={m.editBtn}
                onPress={() => setEditTarget(community)}
              >
                <Ionicons name="pencil-outline" size={14} color={C.blue} />
                <Text style={m.editBtnTxt}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={m.deleteBtn}
                onPress={() => setDeleteTarget(community)}
              >
                <Ionicons name="trash-outline" size={14} color={C.danger} />
                <Text style={m.deleteBtnTxt}>Delete</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={m.leaveBtn}
              onPress={() => handleLeave(community)}
            >
              <Ionicons name="exit-outline" size={14} color={C.orange} />
              <Text style={m.leaveBtnTxt}>Leave</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={m.root}>
        <View style={m.topBar}>
          <TouchableOpacity style={m.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={C.white} />
          </TouchableOpacity>
          <Text style={m.title}>Manage Communities</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={m.tabBar}>
          <TouchableOpacity
            style={[m.tab, activeTab === "admin" && m.tabActive]}
            onPress={() => setActiveTab("admin")}
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={13}
              color={activeTab === "admin" ? C.lime : C.muted}
            />
            <Text style={[m.tabTxt, activeTab === "admin" && m.tabTxtActive]}>
              Mine ({adminCommunities.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[m.tab, activeTab === "joined" && m.tabActive]}
            onPress={() => setActiveTab("joined")}
          >
            <Ionicons
              name="people-outline"
              size={13}
              color={activeTab === "joined" ? C.lime : C.muted}
            />
            <Text style={[m.tabTxt, activeTab === "joined" && m.tabTxtActive]}>
              Joined ({joinedCommunities.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[m.tab, activeTab === "requests" && m.tabActive]}
            onPress={() => setActiveTab("requests")}
          >
            <Ionicons
              name="person-add-outline"
              size={13}
              color={activeTab === "requests" ? C.lime : C.muted}
            />
            <Text
              style={[m.tabTxt, activeTab === "requests" && m.tabTxtActive]}
            >
              Requests
            </Text>
            {pendingRequests.length > 0 && (
              <View style={m.reqBadge}>
                <Text style={m.reqBadgeTxt}>{pendingRequests.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={m.scroll}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === "admin" && (
            <>
              {adminCommunities.length === 0 ? (
                <View style={m.empty}>
                  <Ionicons name="people-outline" size={44} color={C.muted} />
                  <Text style={m.emptyTxt}>
                    You haven't created any communities yet
                  </Text>
                  <Text style={m.emptySub}>
                    Go back and tap the + button to create one!
                  </Text>
                </View>
              ) : (
                adminCommunities.map((c) => renderCommunityCard(c, true))
              )}
            </>
          )}

          {activeTab === "joined" && (
            <>
              {joinedCommunities.length === 0 ? (
                <View style={m.empty}>
                  <Ionicons name="people-outline" size={44} color={C.muted} />
                  <Text style={m.emptyTxt}>
                    You haven't joined any communities
                  </Text>
                  <Text style={m.emptySub}>
                    Browse and join communities to see them here!
                  </Text>
                </View>
              ) : (
                joinedCommunities.map((c) => renderCommunityCard(c, false))
              )}
            </>
          )}

          {activeTab === "requests" && (
            <>
              {requestsLoading ? (
                <ActivityIndicator color={C.lime} style={{ marginTop: 40 }} />
              ) : pendingRequests.length === 0 ? (
                <View style={m.empty}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={44}
                    color={C.muted}
                  />
                  <Text style={m.emptyTxt}>No pending requests</Text>
                  <Text style={m.emptySub}>
                    All join requests have been handled!
                  </Text>
                </View>
              ) : (
                pendingRequests.map((req) => (
                  <View key={req.id} style={m.reqCard}>
                    <View style={m.reqAvatar}>
                      {req.requesterPhotoURL ? (
                        <Image
                          source={{ uri: req.requesterPhotoURL }}
                          style={{
                            width: "100%",
                            height: "100%",
                            borderRadius: 22,
                          }}
                        />
                      ) : (
                        <Text style={m.reqAvatarTxt}>
                          {(req.requesterName || "U")[0].toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={m.reqName}>{req.requesterName}</Text>
                      <Text style={m.reqCommunity}>
                        wants to join "{req.communityName}"
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={m.approveBtn}
                      onPress={() => handleApprove(req)}
                    >
                      <Ionicons name="checkmark" size={18} color={C.bg} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={m.rejectBtn}
                      onPress={() => handleReject(req)}
                    >
                      <Ionicons name="close" size={18} color={C.danger} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>

      <ConfirmDeleteSheet
        visible={!!deleteTarget}
        communityName={deleteTarget?.name || ""}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        loading={deleting}
      />

      <EditCommunitySheet
        visible={!!editTarget}
        community={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={(updated) => {
          onCommunityUpdated(updated);
          setEditTarget(null);
        }}
      />
    </Modal>
  );
}

const m = StyleSheet.create({
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
    gap: 4,
    paddingVertical: 12,
  },
  tabActive: { borderBottomWidth: 2, borderBottomColor: C.lime },
  tabTxt: { color: C.muted, fontSize: 11, fontWeight: "700" },
  tabTxtActive: { color: C.lime },
  scroll: { padding: 16, gap: 12 },
  communityCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: C.lime + "18",
    justifyContent: "center",
    alignItems: "center",
  },
  cardName: { color: C.white, fontSize: 14, fontWeight: "800" },
  cardMeta: { color: C.muted, fontSize: 11, marginTop: 2 },
  tagsRow: { paddingHorizontal: 14, paddingBottom: 10, gap: 6 },
  tag: {
    backgroundColor: C.lime + "18",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagTxt: { color: C.lime, fontSize: 10, fontWeight: "700" },
  membersSection: { paddingHorizontal: 14, paddingBottom: 10 },
  sectionLbl: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  moreMembersTxt: { color: C.muted, fontSize: 12, marginTop: 8 },
  cardActions: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.cardAlt,
  },
  editBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: C.blue + "18",
    borderRadius: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: C.blue + "40",
  },
  editBtnTxt: { color: C.blue, fontSize: 13, fontWeight: "800" },
  deleteBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: C.danger + "18",
    borderRadius: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: C.danger + "40",
  },
  deleteBtnTxt: { color: C.danger, fontSize: 13, fontWeight: "800" },
  leaveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: C.orange + "18",
    borderRadius: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: C.orange + "40",
  },
  leaveBtnTxt: { color: C.orange, fontSize: 13, fontWeight: "800" },
  empty: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyTxt: {
    color: C.white,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySub: { color: C.muted, fontSize: 13, textAlign: "center" },
  // ✅ Requests styles
  reqBadge: {
    backgroundColor: C.danger,
    borderRadius: 9,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 3,
  },
  reqBadgeTxt: { color: "#fff", fontSize: 9, fontWeight: "900" },
  reqCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 8,
  },
  reqAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.lime + "20",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  reqAvatarTxt: { color: C.lime, fontSize: 16, fontWeight: "900" },
  reqName: { color: C.white, fontSize: 13, fontWeight: "700" },
  reqCommunity: { color: C.muted, fontSize: 11, marginTop: 2 },
  approveBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.lime,
    justifyContent: "center",
    alignItems: "center",
  },
  rejectBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.danger + "20",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.danger + "40",
  },
});
