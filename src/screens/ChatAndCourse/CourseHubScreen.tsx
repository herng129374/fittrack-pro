// CourseHubScreen.tsx
// The "channel" for one course — Announcements / Videos / Resources /
// Members. Read-only for members (anyone with a booking for this course);
// the assigned coach (me.uid === course.coachId) additionally gets
// publish/delete controls on each tab.
//
// Reached from ChatAndCoursesScreen's CourseModal via a new
// `onOpenCourseHub` callback (that screen doesn't own its own navigation
// stack — it receives navigation callbacks as props from its parent, so
// this screen follows the same convention rather than importing
// useNavigation directly there). This screen itself is a normal stack
// screen and does use useNavigation/useRoute.
//
// Access is currently enforced client-side only (Firestore rules for
// courses/{id}/announcements etc. are still open) — see the note left in
// PlansAdminPage-era conversation. Don't treat the coach-only buttons
// here as a security boundary yet.

import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
  Linking,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { getAuth, User } from "firebase/auth";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  getDocs,
  documentId,
} from "firebase/firestore";

import {
  C,
  Course,
  Booking,
  CourseAnnouncement,
  CourseVideo,
  CourseResource,
  ResourceFileType,
  normalizeCourse,
  normalizeAnnouncement,
  normalizeCourseVideo,
  normalizeCourseResource,
  isCourseMember,
  timeLabel,
} from "./chatcoursetype";

type Tab = "announcements" | "videos" | "resources" | "members";

interface MemberInfo {
  uid: string;
  displayName: string;
  photoURL?: string;
}

const RESOURCE_TYPES: {
  value: ResourceFileType;
  label: string;
  icon: string;
}[] = [
  { value: "pdf", label: "PDF", icon: "document-text" },
  { value: "doc", label: "Document", icon: "document" },
  { value: "sheet", label: "Spreadsheet", icon: "grid" },
  { value: "image", label: "Image", icon: "image" },
  { value: "other", label: "Other link", icon: "link" },
];

function resourceIcon(type: ResourceFileType): string {
  return RESOURCE_TYPES.find((r) => r.value === type)?.icon ?? "link";
}

// Uploaded-to-our-Storage videos are direct file URLs and always play
// fine inline. Pasted links to YouTube/Vimeo/Drive are web pages, not
// direct video files — expo-av can't embed those, so those still open
// externally via the device browser/app.
function isPlayableInline(url: string): boolean {
  const lower = url.toLowerCase();
  if (
    lower.includes("youtube.com") ||
    lower.includes("youtu.be") ||
    lower.includes("vimeo.com") ||
    lower.includes("drive.google.com")
  ) {
    return false;
  }
  return true;
}

// Chunks an array into groups of `size` — Firestore's `in`/documentId()
// queries cap at 10 values per query.
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function CourseHubScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const courseId: string | undefined = route?.params?.courseId;
  const auth = getAuth();
  const db = getFirestore();

  const [me, setMe] = useState<User | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [courseLoading, setCourseLoading] = useState(true);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [tab, setTab] = useState<Tab>("announcements");

  const [announcements, setAnnouncements] = useState<CourseAnnouncement[]>([]);
  const [videos, setVideos] = useState<CourseVideo[]>([]);
  const [resources, setResources] = useState<CourseResource[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const [announceModal, setAnnounceModal] = useState(false);
  const [videoModal, setVideoModal] = useState(false);
  const [resourceModal, setResourceModal] = useState(false);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);

  useEffect(() => {
    setMe(auth.currentUser);
    return auth.onAuthStateChanged((u) => setMe(u));
  }, []);

  useEffect(() => {
    if (!courseId) return;
    return onSnapshot(
      doc(db, "courses", courseId),
      (snap) => {
        setCourse(snap.exists() ? normalizeCourse(snap.id, snap.data()) : null);
        setCourseLoading(false);
      },
      (err) => {
        console.error("Course hub snapshot error:", err);
        setCourseLoading(false);
      },
    );
  }, [courseId]);

  useEffect(() => {
    if (!me || !courseId) return;
    const q = query(
      collection(db, "bookings"),
      where("userId", "==", me.uid),
      where("courseId", "==", courseId),
    );
    return onSnapshot(q, (snap) => {
      setMyBookings(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Booking),
      );
    });
  }, [me, courseId]);

  const isCoach = !!me && !!course && me.uid === course.coachId;
  const isMember = isCoach || isCourseMember(myBookings, courseId ?? "");

  // Content subscriptions — only start once we know the visitor is allowed
  // to see this Hub, so a stranger poking a courseId doesn't even trigger
  // the reads.
  useEffect(() => {
    if (!courseId || !isMember) return;
    const unsubs = [
      onSnapshot(
        query(
          collection(db, "courses", courseId, "announcements"),
          orderBy("createdAt", "desc"),
        ),
        (snap) =>
          setAnnouncements(
            snap.docs.map((d) => normalizeAnnouncement(d.id, d.data())),
          ),
      ),
      onSnapshot(
        query(
          collection(db, "courses", courseId, "videos"),
          orderBy("createdAt", "desc"),
        ),
        (snap) =>
          setVideos(snap.docs.map((d) => normalizeCourseVideo(d.id, d.data()))),
      ),
      onSnapshot(
        query(
          collection(db, "courses", courseId, "resources"),
          orderBy("createdAt", "desc"),
        ),
        (snap) =>
          setResources(
            snap.docs.map((d) => normalizeCourseResource(d.id, d.data())),
          ),
      ),
      onSnapshot(
        query(
          collection(db, "bookings"),
          where("courseId", "==", courseId),
          where("status", "==", "confirmed"),
        ),
        (snap) => {
          const distinct = new Set(
            snap.docs.map((d) => d.data().userId as string),
          );
          setMemberCount(distinct.size);
        },
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [courseId, isMember]);

  // Full member list — only the coach sees this, and only fetched when
  // they actually open the Members tab (avoids the users/ lookups on
  // every Hub visit for a student who'll never see this tab anyway).
  useEffect(() => {
    if (!isCoach || tab !== "members" || !courseId) return;
    (async () => {
      setMembersLoading(true);
      try {
        const bookingsSnap = await getDocs(
          query(
            collection(db, "bookings"),
            where("courseId", "==", courseId),
            where("status", "==", "confirmed"),
          ),
        );
        const uids = Array.from(
          new Set(bookingsSnap.docs.map((d) => d.data().userId as string)),
        );
        const infos: MemberInfo[] = [];
        for (const group of chunk(uids, 10)) {
          if (group.length === 0) continue;
          const usersSnap = await getDocs(
            query(collection(db, "users"), where(documentId(), "in", group)),
          );
          usersSnap.docs.forEach((d) => {
            const data = d.data();
            infos.push({
              uid: d.id,
              displayName: data.displayName || data.email || "Member",
              photoURL: data.photoURL || undefined,
            });
          });
        }
        setMembers(infos);
      } catch (e) {
        console.error("Members fetch error:", e);
      } finally {
        setMembersLoading(false);
      }
    })();
  }, [isCoach, tab, courseId]);

  const openLink = (url: string) => {
    if (!url) return;
    Linking.openURL(url).catch(() =>
      Alert.alert("Couldn't open link", "That URL looks invalid."),
    );
  };

  const deleteAnnouncement = (id: string) => {
    if (!courseId) return;
    Alert.alert("Delete announcement?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          deleteDoc(doc(db, "courses", courseId, "announcements", id)),
      },
    ]);
  };

  const deleteVideo = (id: string) => {
    if (!courseId) return;
    Alert.alert("Delete video?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteDoc(doc(db, "courses", courseId, "videos", id)),
      },
    ]);
  };

  const deleteResource = (id: string) => {
    if (!courseId) return;
    Alert.alert("Delete resource?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteDoc(doc(db, "courses", courseId, "resources", id)),
      },
    ]);
  };

  if (courseLoading) {
    return (
      <View style={[s.root, s.center]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={C.lime} />
      </View>
    );
  }

  if (!course) {
    return (
      <View style={[s.root, s.center]}>
        <StatusBar barStyle="light-content" />
        <Text style={s.emptyTxt}>Course not found.</Text>
        <TouchableOpacity
          style={s.backBtnLg}
          onPress={() => navigation.goBack()}
        >
          <Text style={s.backBtnLgTxt}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!isMember) {
    return (
      <View style={[s.root, s.center, { padding: 30 }]}>
        <StatusBar barStyle="light-content" />
        <Ionicons name="lock-closed-outline" size={32} color={C.muted} />
        <Text style={[s.emptyTxt, { marginTop: 12 }]}>Members only</Text>
        <Text style={s.lockedSub}>
          Book a session of {course.title} to unlock announcements, videos and
          resources from {course.coachName}.
        </Text>
        <TouchableOpacity
          style={s.backBtnLg}
          onPress={() => navigation.goBack()}
        >
          <Text style={s.backBtnLgTxt}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: "announcements", label: "Announcements", icon: "megaphone" },
    { key: "videos", label: "Videos", icon: "play-circle" },
    { key: "resources", label: "Resources", icon: "document-text" },
    { key: "members", label: "Members", icon: "people" },
  ];

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>
            {course.emoji} {course.title}
          </Text>
          <Text style={s.headerSub}>
            Coach {course.coachName} {isCoach ? "· You" : ""}
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.tabRow}
      >
        {TABS.map((t) => {
          const isSel = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[s.tabChip, isSel && s.tabChipSel]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={t.icon as any}
                size={13}
                color={isSel ? C.bg : C.muted}
              />
              <Text style={[s.tabChipTxt, isSel && s.tabChipTxtSel]}>
                {t.label}
                {t.key === "members" ? ` · ${memberCount}` : ""}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.body}
      >
        {tab === "announcements" && (
          <>
            {isCoach && (
              <TouchableOpacity
                style={s.addBtn}
                onPress={() => setAnnounceModal(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle" size={16} color={C.bg} />
                <Text style={s.addBtnTxt}>New announcement</Text>
              </TouchableOpacity>
            )}
            {announcements.length === 0 ? (
              <EmptyState
                icon="megaphone-outline"
                text="No announcements yet"
              />
            ) : (
              announcements.map((a) => (
                <View key={a.id} style={s.card}>
                  <View style={s.cardTopRow}>
                    <View style={s.announceIconWrap}>
                      <Ionicons name="megaphone" size={14} color={C.bg} />
                    </View>
                    <Text style={[s.cardTitle, { flex: 1 }]}>{a.title}</Text>
                    {isCoach && (
                      <TouchableOpacity
                        onPress={() => deleteAnnouncement(a.id)}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={16}
                          color={C.muted}
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={s.announceBodyBox}>
                    <Text style={s.announceBodyTxt}>{a.body}</Text>
                  </View>
                  <Text style={s.cardMeta}>
                    <Text style={s.cardMetaAuthor}>{a.authorName}</Text> ·{" "}
                    {timeLabel(a.createdAt)}
                  </Text>
                </View>
              ))
            )}
          </>
        )}

        {tab === "videos" && (
          <>
            {isCoach && (
              <TouchableOpacity
                style={s.addBtn}
                onPress={() => setVideoModal(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle" size={16} color={C.bg} />
                <Text style={s.addBtnTxt}>Add video</Text>
              </TouchableOpacity>
            )}
            {videos.length === 0 ? (
              <EmptyState icon="play-circle-outline" text="No videos yet" />
            ) : (
              videos.map((v) => {
                const playable = isPlayableInline(v.videoUrl);
                const isPlaying = playingVideoId === v.id;
                return (
                  <View key={v.id} style={s.card}>
                    <View style={s.cardTopRow}>
                      <View style={s.mediaIconWrap}>
                        <Ionicons name="play" size={16} color={C.bg} />
                      </View>
                      <Text style={[s.cardTitle, { flex: 1 }]}>{v.title}</Text>
                      {isCoach && (
                        <TouchableOpacity onPress={() => deleteVideo(v.id)}>
                          <Ionicons
                            name="trash-outline"
                            size={16}
                            color={C.muted}
                          />
                        </TouchableOpacity>
                      )}
                    </View>

                    {playable ? (
                      isPlaying ? (
                        <View style={s.playerWrap}>
                          <Video
                            source={{ uri: v.videoUrl }}
                            style={s.player}
                            useNativeControls
                            resizeMode={ResizeMode.CONTAIN}
                            shouldPlay
                          />
                          <TouchableOpacity
                            style={s.collapseBtn}
                            onPress={() => setPlayingVideoId(null)}
                          >
                            <Ionicons
                              name="chevron-up"
                              size={14}
                              color={C.muted}
                            />
                            <Text style={s.collapseBtnTxt}>Collapse</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={s.playThumb}
                          onPress={() => setPlayingVideoId(v.id)}
                          activeOpacity={0.85}
                        >
                          <View style={s.playThumbCircle}>
                            <Ionicons name="play" size={20} color={C.bg} />
                          </View>
                          <Text style={s.playThumbTxt}>Tap to play</Text>
                        </TouchableOpacity>
                      )
                    ) : (
                      <View style={s.cardBtnRow}>
                        <TouchableOpacity
                          style={s.smallBtn}
                          onPress={() => openLink(v.videoUrl)}
                          activeOpacity={0.85}
                        >
                          <Ionicons
                            name="open-outline"
                            size={14}
                            color={C.bg}
                          />
                          <Text style={s.smallBtnTxt}>
                            Watch (opens externally)
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {v.downloadable && (
                      <TouchableOpacity
                        style={[s.smallBtn, s.smallBtnGhost, { marginTop: 8 }]}
                        onPress={() => openLink(v.videoUrl)}
                        activeOpacity={0.85}
                      >
                        <Ionicons
                          name="download-outline"
                          size={14}
                          color={C.white}
                        />
                        <Text style={[s.smallBtnTxt, { color: C.white }]}>
                          Download
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}

        {tab === "resources" && (
          <>
            {isCoach && (
              <TouchableOpacity
                style={s.addBtn}
                onPress={() => setResourceModal(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle" size={16} color={C.bg} />
                <Text style={s.addBtnTxt}>Add resource</Text>
              </TouchableOpacity>
            )}
            {resources.length === 0 ? (
              <EmptyState
                icon="document-text-outline"
                text="No resources yet"
              />
            ) : (
              resources.map((r) => (
                <View key={r.id} style={s.card}>
                  <View style={s.cardTopRow}>
                    <View style={s.mediaIconWrap}>
                      <Ionicons
                        name={resourceIcon(r.fileType) as any}
                        size={15}
                        color={C.bg}
                      />
                    </View>
                    <Text style={[s.cardTitle, { flex: 1 }]}>{r.title}</Text>
                    {isCoach && (
                      <TouchableOpacity onPress={() => deleteResource(r.id)}>
                        <Ionicons
                          name="trash-outline"
                          size={16}
                          color={C.muted}
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[s.smallBtn, { marginTop: 10 }]}
                    onPress={() => openLink(r.fileUrl)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="download-outline" size={14} color={C.bg} />
                    <Text style={s.smallBtnTxt}>Download</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}

        {tab === "members" && (
          <>
            {!isCoach ? (
              <View style={s.card}>
                <Text style={s.cardBody}>
                  {memberCount} member{memberCount === 1 ? "" : "s"} in this
                  course.
                </Text>
              </View>
            ) : membersLoading ? (
              <ActivityIndicator color={C.lime} style={{ marginTop: 20 }} />
            ) : members.length === 0 ? (
              <EmptyState icon="people-outline" text="No members yet" />
            ) : (
              members.map((m) => (
                <View key={m.uid} style={s.memberRow}>
                  <View style={s.memberAv}>
                    <Text style={s.memberAvTxt}>
                      {m.displayName[0]?.toUpperCase() ?? "?"}
                    </Text>
                  </View>
                  <Text style={s.memberName}>{m.displayName}</Text>
                </View>
              ))
            )}
          </>
        )}
        <View style={{ height: 60 }} />
      </ScrollView>

      <NewAnnouncementModal
        visible={announceModal}
        onClose={() => setAnnounceModal(false)}
        onSubmit={async (title, body) => {
          if (!courseId) return;
          await addDoc(collection(db, "courses", courseId, "announcements"), {
            title,
            body,
            authorName: course.coachName,
            createdAt: serverTimestamp(),
          });
          setAnnounceModal(false);
        }}
      />

      <NewVideoModal
        visible={videoModal}
        courseId={courseId}
        onClose={() => setVideoModal(false)}
        onSubmit={async (title, url, downloadable) => {
          if (!courseId) return;
          await addDoc(collection(db, "courses", courseId, "videos"), {
            title,
            videoUrl: url,
            downloadable,
            createdAt: serverTimestamp(),
          });
          setVideoModal(false);
        }}
      />

      <NewResourceModal
        visible={resourceModal}
        courseId={courseId}
        onClose={() => setResourceModal(false)}
        onSubmit={async (title, url, fileType) => {
          if (!courseId) return;
          await addDoc(collection(db, "courses", courseId, "resources"), {
            title,
            fileUrl: url,
            fileType,
            createdAt: serverTimestamp(),
          });
          setResourceModal(false);
        }}
      />
    </View>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={s.emptyBox}>
      <Ionicons name={icon as any} size={26} color={C.muted} />
      <Text style={s.emptyBoxTxt}>{text}</Text>
    </View>
  );
}

// ── Modals ──────────────────────────────────────────────────

function NewAnnouncementModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (title: string, body: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setTitle("");
      setBody("");
    }
  }, [visible]);

  const submit = async () => {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      await onSubmit(title.trim(), body.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={m.root}>
        <StatusBar barStyle="light-content" />
        <ModalHeader title="New announcement" onClose={onClose} />
        <ScrollView contentContainerStyle={m.body}>
          <Text style={m.lbl}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            style={m.input}
            placeholder="Week 2 training"
            placeholderTextColor={C.muted}
          />
          <Text style={m.lbl}>Message</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            style={[m.input, m.inputMultiline]}
            placeholder="Bring a towel, water bottle and resistance band..."
            placeholderTextColor={C.muted}
            multiline
          />
          <TouchableOpacity
            style={[
              m.submitBtn,
              (!title.trim() || !body.trim() || saving) && { opacity: 0.5 },
            ]}
            onPress={submit}
            disabled={!title.trim() || !body.trim() || saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={C.bg} />
            ) : (
              <Text style={m.submitBtnTxt}>Post announcement</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

function NewVideoModal({
  visible,
  courseId,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  courseId?: string;
  onClose: () => void;
  onSubmit: (
    title: string,
    url: string,
    downloadable: boolean,
  ) => Promise<void>;
}) {
  const [mode, setMode] = useState<"upload" | "link">("upload");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [downloadable, setDownloadable] = useState(false);
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setMode("upload");
      setTitle("");
      setUrl("");
      setDownloadable(false);
      setAsset(null);
      setProgress(0);
    }
  }, [visible]);

  const pickVideo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permission needed",
        "Allow access to your videos to pick one to upload.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 1,
    });
    if (!result.canceled && result.assets?.[0]) {
      const picked = result.assets[0];
      setAsset(picked);
      if (!title.trim()) {
        const name = picked.fileName || picked.uri.split("/").pop() || "";
        setTitle(name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const uploadAndSubmit = async () => {
    if (!title.trim() || !asset || !courseId) return;
    setUploading(true);
    setProgress(0);
    try {
      const storage = getStorage();
      const res = await fetch(asset.uri);
      const blob = await res.blob();
      const fileName = asset.fileName || `video_${Date.now()}.mp4`;
      const path = `courses/${courseId}/videos/${Date.now()}_${fileName}`;
      const task = uploadBytesResumable(storageRef(storage, path), blob);
      await new Promise<void>((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) =>
            setProgress(
              Math.round((snap.bytesTransferred / snap.totalBytes) * 100),
            ),
          reject,
          () => resolve(),
        );
      });
      const downloadUrl = await getDownloadURL(task.snapshot.ref);
      // Uploaded to our own Storage, so it's always downloadable.
      await onSubmit(title.trim(), downloadUrl, true);
    } catch (e) {
      console.error("Video upload error:", e);
      Alert.alert("Upload failed", "Could not upload this video. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const submitLink = async () => {
    if (!title.trim() || !url.trim()) return;
    setSaving(true);
    try {
      await onSubmit(title.trim(), url.trim(), downloadable);
    } finally {
      setSaving(false);
    }
  };

  const busy = uploading || saving;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={m.root}>
        <StatusBar barStyle="light-content" />
        <ModalHeader title="Add video" onClose={onClose} />
        <ScrollView contentContainerStyle={m.body}>
          <Text style={m.lbl}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            style={m.input}
            placeholder="Warm Up Routine"
            placeholderTextColor={C.muted}
          />

          {mode === "upload" ? (
            <>
              <Text style={m.lbl}>Video file</Text>
              {asset ? (
                <View style={m.pickedBox}>
                  <Ionicons name="videocam" size={18} color={C.lime} />
                  <Text style={m.pickedTxt} numberOfLines={1}>
                    {asset.fileName || "Selected video"}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setAsset(null)}
                    disabled={uploading}
                  >
                    <Ionicons name="close-circle" size={18} color={C.muted} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={m.pickBtn}
                  onPress={pickVideo}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="cloud-upload-outline"
                    size={18}
                    color={C.lime}
                  />
                  <Text style={m.pickBtnTxt}>
                    Choose a video from your device
                  </Text>
                </TouchableOpacity>
              )}

              {uploading && (
                <View style={m.progressWrap}>
                  <Text style={m.hint}>Uploading… {progress}%</Text>
                  <View style={m.progressTrack}>
                    <View style={[m.progressFill, { width: `${progress}%` }]} />
                  </View>
                </View>
              )}

              <Text style={m.hint}>
                Larger videos take longer to upload. Keep the app open until it
                finishes.
              </Text>

              <TouchableOpacity
                style={[
                  m.submitBtn,
                  (!title.trim() || !asset || busy) && { opacity: 0.5 },
                ]}
                onPress={uploadAndSubmit}
                disabled={!title.trim() || !asset || busy}
                activeOpacity={0.85}
              >
                {uploading ? (
                  <ActivityIndicator color={C.bg} />
                ) : (
                  <Text style={m.submitBtnTxt}>Upload & add video</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={m.switchModeLink}
                onPress={() => setMode("link")}
                disabled={busy}
              >
                <Text style={m.switchModeLinkTxt}>
                  Video already hosted elsewhere? Paste a link instead
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={m.lbl}>Video link</Text>
              <TextInput
                value={url}
                onChangeText={setUrl}
                style={m.input}
                placeholder="https://youtube.com/watch?v=... or Vimeo/Drive link"
                placeholderTextColor={C.muted}
                autoCapitalize="none"
                keyboardType="url"
              />
              <View style={m.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={m.switchLbl}>Allow download</Text>
                  <Text style={m.hint}>
                    Only enable this if the link actually supports downloading
                    (e.g. Vimeo with download permission on) — most YouTube
                    links won't.
                  </Text>
                </View>
                <Switch
                  value={downloadable}
                  onValueChange={setDownloadable}
                  trackColor={{ false: C.border, true: C.lime }}
                />
              </View>
              <TouchableOpacity
                style={[
                  m.submitBtn,
                  (!title.trim() || !url.trim() || busy) && { opacity: 0.5 },
                ]}
                onPress={submitLink}
                disabled={!title.trim() || !url.trim() || busy}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color={C.bg} />
                ) : (
                  <Text style={m.submitBtnTxt}>Add video</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={m.switchModeLink}
                onPress={() => setMode("upload")}
                disabled={busy}
              >
                <Text style={m.switchModeLinkTxt}>
                  Upload a video file instead
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function detectResourceType(
  mimeType?: string,
  name?: string,
): ResourceFileType {
  const ext = (name ?? "").split(".").pop()?.toLowerCase() ?? "";
  if (mimeType?.includes("pdf") || ext === "pdf") return "pdf";
  if (
    mimeType?.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(ext)
  )
    return "image";
  if (mimeType?.includes("spreadsheet") || ["xls", "xlsx", "csv"].includes(ext))
    return "sheet";
  if (mimeType?.includes("word") || ["doc", "docx"].includes(ext)) return "doc";
  return "other";
}

function NewResourceModal({
  visible,
  courseId,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  courseId?: string;
  onClose: () => void;
  onSubmit: (
    title: string,
    url: string,
    fileType: ResourceFileType,
  ) => Promise<void>;
}) {
  const [mode, setMode] = useState<"upload" | "link">("upload");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [fileType, setFileType] = useState<ResourceFileType>("pdf");
  const [asset, setAsset] = useState<DocumentPicker.DocumentPickerAsset | null>(
    null,
  );
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setMode("upload");
      setTitle("");
      setUrl("");
      setFileType("pdf");
      setAsset(null);
      setProgress(0);
    }
  }, [visible]);

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets?.[0]) {
      const picked = result.assets[0];
      setAsset(picked);
      setFileType(detectResourceType(picked.mimeType, picked.name));
      if (!title.trim()) {
        setTitle(picked.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const uploadAndSubmit = async () => {
    if (!title.trim() || !asset || !courseId) return;
    setUploading(true);
    setProgress(0);
    try {
      const storage = getStorage();
      const res = await fetch(asset.uri);
      const blob = await res.blob();
      const path = `courses/${courseId}/resources/${Date.now()}_${asset.name}`;
      const task = uploadBytesResumable(storageRef(storage, path), blob);
      await new Promise<void>((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) =>
            setProgress(
              Math.round((snap.bytesTransferred / snap.totalBytes) * 100),
            ),
          reject,
          () => resolve(),
        );
      });
      const downloadUrl = await getDownloadURL(task.snapshot.ref);
      await onSubmit(title.trim(), downloadUrl, fileType);
    } catch (e) {
      console.error("Resource upload error:", e);
      Alert.alert("Upload failed", "Could not upload this file. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const submitLink = async () => {
    if (!title.trim() || !url.trim()) return;
    setSaving(true);
    try {
      await onSubmit(title.trim(), url.trim(), fileType);
    } finally {
      setSaving(false);
    }
  };

  const busy = uploading || saving;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={m.root}>
        <StatusBar barStyle="light-content" />
        <ModalHeader title="Add resource" onClose={onClose} />
        <ScrollView contentContainerStyle={m.body}>
          <Text style={m.lbl}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            style={m.input}
            placeholder="Meal Plan Week 1"
            placeholderTextColor={C.muted}
          />

          {mode === "upload" ? (
            <>
              <Text style={m.lbl}>File</Text>
              {asset ? (
                <View style={m.pickedBox}>
                  <Ionicons
                    name={resourceIcon(fileType) as any}
                    size={18}
                    color={C.lime}
                  />
                  <Text style={m.pickedTxt} numberOfLines={1}>
                    {asset.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setAsset(null)}
                    disabled={uploading}
                  >
                    <Ionicons name="close-circle" size={18} color={C.muted} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={m.pickBtn}
                  onPress={pickFile}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="cloud-upload-outline"
                    size={18}
                    color={C.lime}
                  />
                  <Text style={m.pickBtnTxt}>
                    Choose a file from your device
                  </Text>
                </TouchableOpacity>
              )}

              {asset && (
                <>
                  <Text style={[m.lbl, { marginTop: 14 }]}>File type</Text>
                  <View style={m.typeRow}>
                    {RESOURCE_TYPES.map((t) => (
                      <TouchableOpacity
                        key={t.value}
                        style={[
                          m.typeChip,
                          fileType === t.value && m.typeChipSel,
                        ]}
                        onPress={() => setFileType(t.value)}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={t.icon as any}
                          size={13}
                          color={fileType === t.value ? C.bg : C.muted}
                        />
                        <Text
                          style={[
                            m.typeChipTxt,
                            fileType === t.value && m.typeChipTxtSel,
                          ]}
                        >
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={m.hint}>
                    Detected automatically — tap another if it's wrong.
                  </Text>
                </>
              )}

              {uploading && (
                <View style={m.progressWrap}>
                  <Text style={m.hint}>Uploading… {progress}%</Text>
                  <View style={m.progressTrack}>
                    <View style={[m.progressFill, { width: `${progress}%` }]} />
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[
                  m.submitBtn,
                  (!title.trim() || !asset || busy) && { opacity: 0.5 },
                ]}
                onPress={uploadAndSubmit}
                disabled={!title.trim() || !asset || busy}
                activeOpacity={0.85}
              >
                {uploading ? (
                  <ActivityIndicator color={C.bg} />
                ) : (
                  <Text style={m.submitBtnTxt}>Upload & add resource</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={m.switchModeLink}
                onPress={() => setMode("link")}
                disabled={busy}
              >
                <Text style={m.switchModeLinkTxt}>
                  Already hosted elsewhere? Paste a link instead
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={m.lbl}>File type</Text>
              <View style={m.typeRow}>
                {RESOURCE_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.value}
                    style={[m.typeChip, fileType === t.value && m.typeChipSel]}
                    onPress={() => setFileType(t.value)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={t.icon as any}
                      size={13}
                      color={fileType === t.value ? C.bg : C.muted}
                    />
                    <Text
                      style={[
                        m.typeChipTxt,
                        fileType === t.value && m.typeChipTxtSel,
                      ]}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={m.lbl}>File link</Text>
              <TextInput
                value={url}
                onChangeText={setUrl}
                style={m.input}
                placeholder="https://... (Drive, Dropbox, etc.)"
                placeholderTextColor={C.muted}
                autoCapitalize="none"
                keyboardType="url"
              />
              <TouchableOpacity
                style={[
                  m.submitBtn,
                  (!title.trim() || !url.trim() || busy) && { opacity: 0.5 },
                ]}
                onPress={submitLink}
                disabled={!title.trim() || !url.trim() || busy}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color={C.bg} />
                ) : (
                  <Text style={m.submitBtnTxt}>Add resource</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={m.switchModeLink}
                onPress={() => setMode("upload")}
                disabled={busy}
              >
                <Text style={m.switchModeLinkTxt}>Upload a file instead</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function ModalHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <View style={m.hdr}>
      <TouchableOpacity style={m.backBtn} onPress={onClose}>
        <Ionicons name="chevron-back" size={22} color={C.white} />
      </TouchableOpacity>
      <Text style={m.hdrTitle}>{title}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 16, fontWeight: "900", color: C.white },
  headerSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  tabRow: { gap: 8, padding: 16, paddingBottom: 8 },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tabChipSel: { backgroundColor: C.lime, borderColor: C.lime },
  tabChipTxt: { fontSize: 12, fontWeight: "700", color: C.muted },
  tabChipTxtSel: { color: C.bg },
  body: { padding: 16, paddingTop: 4, gap: 12 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.lime,
    borderRadius: 14,
    padding: 13,
    marginBottom: 4,
  },
  addBtnTxt: { fontSize: 13, fontWeight: "900", color: C.bg },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: "800", color: C.white },
  cardBody: { fontSize: 13, color: C.muted, marginTop: 6, lineHeight: 19 },
  cardMeta: { fontSize: 11, color: C.muted, marginTop: 8 },
  cardMetaAuthor: { color: C.lime, fontWeight: "700" },
  announceIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: C.pink,
    justifyContent: "center",
    alignItems: "center",
  },
  announceBodyBox: {
    backgroundColor: C.card2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginTop: 10,
  },
  announceBodyTxt: {
    fontSize: 13.5,
    color: C.white,
    lineHeight: 20,
    fontWeight: "500",
  },
  mediaIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: C.lime,
    justifyContent: "center",
    alignItems: "center",
  },
  cardBtnRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  playThumb: {
    marginTop: 10,
    height: 130,
    borderRadius: 12,
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  playThumbCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.lime,
    justifyContent: "center",
    alignItems: "center",
  },
  playThumbTxt: { fontSize: 11, fontWeight: "700", color: C.muted },
  playerWrap: { marginTop: 10 },
  player: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 12,
    backgroundColor: "#000",
  },
  collapseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
  },
  collapseBtnTxt: { fontSize: 11, fontWeight: "700", color: C.muted },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.lime,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallBtnGhost: {
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.border,
  },
  smallBtnTxt: { fontSize: 12, fontWeight: "800", color: C.bg },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  memberAv: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.card2,
    justifyContent: "center",
    alignItems: "center",
  },
  memberAvTxt: { fontSize: 14, fontWeight: "800", color: C.lime },
  memberName: { fontSize: 13, fontWeight: "600", color: C.white },
  emptyBox: {
    alignItems: "center",
    padding: 30,
    marginTop: 10,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  emptyBoxTxt: { fontSize: 12, color: C.muted },
  emptyTxt: { fontSize: 14, fontWeight: "700", color: C.white },
  lockedSub: {
    fontSize: 12,
    color: C.muted,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 18,
    maxWidth: 280,
  },
  backBtnLg: {
    marginTop: 20,
    backgroundColor: C.lime,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  backBtnLgTxt: { fontSize: 13, fontWeight: "800", color: C.bg },
});

const m = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  hdr: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
  },
  hdrTitle: { fontSize: 16, fontWeight: "800", color: C.white },
  body: { padding: 20, paddingBottom: 40, gap: 6 },
  lbl: {
    fontSize: 12,
    fontWeight: "700",
    color: C.white,
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.white,
    fontSize: 13,
    backgroundColor: C.card,
  },
  inputMultiline: { height: 100, textAlignVertical: "top" },
  hint: { fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 16 },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: C.lime,
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 16,
    backgroundColor: C.card,
  },
  pickBtnTxt: { fontSize: 13, fontWeight: "700", color: C.lime },
  pickedBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: C.card,
  },
  pickedTxt: { flex: 1, fontSize: 12.5, color: C.white, fontWeight: "600" },
  progressWrap: { marginTop: 12 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: C.card2,
    overflow: "hidden",
    marginTop: 6,
  },
  progressFill: { height: "100%", backgroundColor: C.lime },
  switchModeLink: { alignItems: "center", padding: 10, marginTop: 4 },
  switchModeLinkTxt: {
    fontSize: 11.5,
    color: C.blue,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  switchLbl: { fontSize: 13, fontWeight: "700", color: C.white },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  typeChipSel: { backgroundColor: C.lime, borderColor: C.lime },
  typeChipTxt: { fontSize: 11, fontWeight: "700", color: C.muted },
  typeChipTxtSel: { color: C.bg },
  submitBtn: {
    marginTop: 22,
    backgroundColor: C.lime,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnTxt: { fontSize: 14, fontWeight: "900", color: C.bg },
});
