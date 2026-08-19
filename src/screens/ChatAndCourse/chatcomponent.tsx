// ChatComponents.tsx
// GifPicker, AttachMenu, VoiceButton, VoiceBubble, MessageBubble, ChatWindow.
// Import from chatCourseTypes for shared types + helpers.

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  Pressable,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Audio } from "expo-av";
import { User } from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { useAppearance } from "../AppearanceContext";
import {
  C,
  GIF_PACKS,
  ChatMessage,
  Conversation,
  timeLabel,
  fmtDuration,
  bytesToSize,
  uploadToStorage,
} from "./chatcoursetype";

// ─────────────────────────────────────────────────────────
// GIF Picker Modal
// ─────────────────────────────────────────────────────────
export function GifPicker({
  visible,
  onSelect,
  onClose,
}: {
  visible: boolean;
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const [pack, setPack] = useState(0);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={gp.overlay}>
        <View style={gp.sheet}>
          <View style={gp.hdr}>
            <Text style={gp.title}>GIFs & Stickers</Text>
            <TouchableOpacity onPress={onClose} style={gp.closeBtn}>
              <Ionicons name="close" size={18} color={C.white} />
            </TouchableOpacity>
          </View>
          <View style={gp.tabs}>
            {GIF_PACKS.map((p, i) => (
              <TouchableOpacity
                key={p.label}
                style={[gp.tab, pack === i && gp.tabActive]}
                onPress={() => setPack(i)}
              >
                <Text style={[gp.tabTxt, pack === i && gp.tabTxtActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={gp.grid}>
            {GIF_PACKS[pack].gifs.map((url, i) => (
              <TouchableOpacity
                key={i}
                style={gp.gifItem}
                onPress={() => {
                  onSelect(url);
                  onClose();
                }}
                activeOpacity={0.8}
              >
                <Image
                  source={{ uri: url }}
                  style={gp.gif}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────
// Attach Menu
// ─────────────────────────────────────────────────────────
export function AttachMenu({
  visible,
  onClose,
  onPickImage,
  onPickVideo,
  onPickDocument,
  onPickGif,
}: {
  visible: boolean;
  onClose: () => void;
  onPickImage: () => void;
  onPickVideo: () => void;
  onPickDocument: () => void;
  onPickGif: () => void;
}) {
  const options = [
    {
      icon: "image-outline" as const,
      label: "Photo",
      color: C.blue,
      action: onPickImage,
    },
    {
      icon: "videocam-outline" as const,
      label: "Video",
      color: C.pink,
      action: onPickVideo,
    },
    {
      icon: "document-outline" as const,
      label: "Document",
      color: C.orange,
      action: onPickDocument,
    },
    {
      icon: "happy-outline" as const,
      label: "GIF",
      color: C.lime,
      action: onPickGif,
    },
  ];
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={am.overlay} onPress={onClose}>
        <View style={am.sheet}>
          <View style={am.handle} />
          <Text style={am.title}>SHARE</Text>
          <View style={am.grid}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={am.item}
                onPress={() => {
                  opt.action();
                  onClose();
                }}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    am.iconWrap,
                    {
                      backgroundColor: opt.color + "22",
                      borderColor: opt.color + "55",
                    },
                  ]}
                >
                  <Ionicons name={opt.icon} size={26} color={opt.color} />
                </View>
                <Text style={am.itemTxt}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────
// Voice Button
// ─────────────────────────────────────────────────────────
export function VoiceButton({
  onVoiceSend,
}: {
  onVoiceSend: (uri: string, duration: number) => void;
}) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.25,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  };

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Microphone access is required.");
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      setRecording(rec);
      setIsRecording(true);
      setSecs(0);
      startPulse();
      timerRef.current = setInterval(() => setSecs((s) => s + 1), 1000);
    } catch (e: any) {
      Alert.alert("Recording error", e.message);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    clearInterval(timerRef.current!);
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    const duration = secs;
    setRecording(null);
    setIsRecording(false);
    setSecs(0);
    if (uri && duration > 0) onVoiceSend(uri, duration);
  };

  return (
    <View style={vb.wrap}>
      {isRecording && (
        <View style={vb.indicator}>
          <View style={vb.recDot} />
          <Text style={vb.recTime}>{fmtDuration(secs)}</Text>
        </View>
      )}
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <Pressable
          style={[vb.btn, isRecording && vb.btnActive]}
          onPressIn={startRecording}
          onPressOut={stopRecording}
        >
          <Ionicons
            name={isRecording ? "radio-button-on" : "mic-outline"}
            size={20}
            color={isRecording ? "#fff" : C.muted}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// Voice Bubble
// ─────────────────────────────────────────────────────────
export function VoiceBubble({
  url,
  duration,
  isMe,
}: {
  url: string;
  duration?: number;
  isMe: boolean;
}) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const total = duration ?? 0;
  const accent = isMe ? C.bg : C.lime;

  const toggle = async () => {
    if (playing) {
      await sound?.pauseAsync();
      setPlaying(false);
      return;
    }
    if (sound) {
      await sound.playAsync();
    } else {
      const { sound: s } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded) {
            setPos((status.positionMillis ?? 0) / 1000);
            if (status.didJustFinish) {
              setPlaying(false);
              setPos(0);
            }
          }
        },
      );
      setSound(s);
    }
    setPlaying(true);
  };

  useEffect(
    () => () => {
      sound?.unloadAsync();
    },
    [sound],
  );
  const pct = total > 0 ? Math.min(pos / total, 1) : 0;

  return (
    <View style={vm.row}>
      <TouchableOpacity
        style={[vm.playBtn, { borderColor: accent + "55" }]}
        onPress={toggle}
      >
        <Ionicons name={playing ? "pause" : "play"} size={15} color={accent} />
      </TouchableOpacity>
      <View style={vm.trackBg}>
        <View
          style={[
            vm.trackFill,
            { width: `${pct * 100}%` as any, backgroundColor: accent },
          ]}
        />
      </View>
      <Text style={[vm.dur, { color: isMe ? C.bg + "aa" : C.muted }]}>
        {fmtDuration(playing ? pos : total)}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// Message Bubble
// ─────────────────────────────────────────────────────────
export function MessageBubble({
  m,
  isMe,
  theme,
}: {
  m: ChatMessage;
  isMe: boolean;
  theme: any;
}) {
  const tc = (color: string) =>
    isMe ? theme.myBubbleTextColor : theme.theirBubbleTextColor;

  const renderBody = () => {
    switch (m.type) {
      case "image":
        return (
          <>
            <Image
              source={{ uri: m.mediaUrl }}
              style={mb.img}
              resizeMode="cover"
            />
            {m.text ? (
              <Text style={[mb.txt, { color: tc(""), marginTop: 4 }]}>
                {m.text}
              </Text>
            ) : null}
          </>
        );
      case "gif":
        return (
          <Image
            source={{ uri: m.mediaUrl }}
            style={mb.gif}
            resizeMode="cover"
          />
        );
      case "video":
        return (
          <View style={mb.fileRow}>
            <View style={[mb.fileIcon, { backgroundColor: C.pink + "22" }]}>
              <Ionicons name="videocam" size={20} color={C.pink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[mb.fileName, { color: tc("") }]} numberOfLines={1}>
                {m.fileName ?? "Video"}
              </Text>
              <Text style={mb.fileSz}>{m.fileSize}</Text>
            </View>
          </View>
        );
      case "document":
        return (
          <View style={mb.fileRow}>
            <View style={[mb.fileIcon, { backgroundColor: C.orange + "22" }]}>
              <Ionicons name="document-text" size={20} color={C.orange} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[mb.fileName, { color: tc("") }]} numberOfLines={2}>
                {m.fileName ?? "Document"}
              </Text>
              <Text style={mb.fileSz}>{m.fileSize}</Text>
            </View>
          </View>
        );
      case "audio":
        return (
          <View style={mb.fileRow}>
            <View style={[mb.fileIcon, { backgroundColor: C.blue + "22" }]}>
              <Ionicons name="musical-note" size={20} color={C.blue} />
            </View>
            <Text style={[mb.fileName, { color: tc("") }]} numberOfLines={1}>
              {m.fileName ?? "Audio"}
            </Text>
          </View>
        );
      case "voice":
        return (
          <VoiceBubble url={m.mediaUrl!} duration={m.duration} isMe={isMe} />
        );
      default:
        return <Text style={[mb.txt, { color: tc("") }]}>{m.text}</Text>;
    }
  };

  return (
    <View
      style={[
        mb.bubble,
        isMe
          ? { backgroundColor: theme.myBubbleColor, borderBottomRightRadius: 4 }
          : {
              backgroundColor: theme.theirBubbleColor,
              borderBottomLeftRadius: 4,
            },
      ]}
    >
      {renderBody()}
      <Text
        style={[
          mb.time,
          { color: isMe ? theme.myBubbleTextColor + "99" : C.muted },
        ]}
      >
        {timeLabel(m.createdAt)}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// Chat Window
// ─────────────────────────────────────────────────────────
export function ChatWindow({
  visible,
  conv,
  me,
  onClose,
}: {
  visible: boolean;
  conv: Conversation | null;
  me: User | null;
  onClose: () => void;
}) {
  const db = getFirestore();
  const { theme } = useAppearance();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    (async () => {
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    })();
  }, []);

  useEffect(() => {
    if (!visible || !conv) return;
    const q = query(collection(db, "conversations", conv.id, "messages"));
    return onSnapshot(
      q,
      (snap) => {
        const msgs = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as ChatMessage,
        );
        msgs.sort(
          (a, b) =>
            (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0),
        );
        setMessages(msgs);
        setTimeout(
          () => scrollRef.current?.scrollToEnd({ animated: true }),
          80,
        );
      },
      (err) => Alert.alert("Chat error", err.message),
    );
  }, [visible, conv]);

  const getSenderName = async (): Promise<string> => {
    if (!me) return "User";
    const snap = await getDoc(doc(db, "users", me.uid));
    return snap.exists()
      ? snap.data().displayName || me.email || "User"
      : "User";
  };

  const saveMessage = async (
    payload: Omit<ChatMessage, "id" | "createdAt">,
    preview: string,
  ) => {
    if (!me || !conv) return;
    await addDoc(collection(db, "conversations", conv.id, "messages"), {
      ...payload,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "conversations", conv.id), {
      lastMessage: preview,
      lastAt: serverTimestamp(),
    });
  };

  const handleSend = async () => {
    if (!text.trim() || !me || !conv) return;
    setSending(true);
    try {
      const name = await getSenderName();
      await saveMessage(
        { senderId: me.uid, senderName: name, type: "text", text: text.trim() },
        text.trim(),
      );
      setText("");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSending(false);
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploading(true);
    try {
      const name = await getSenderName();
      const url = await uploadToStorage(
        result.assets[0].uri,
        `chats/${conv!.id}/${me!.uid}_${Date.now()}_img`,
      );
      await saveMessage(
        { senderId: me!.uid, senderName: name, type: "image", mediaUrl: url },
        "📷 Photo",
      );
    } catch (e: any) {
      Alert.alert("Upload error", e.message);
    } finally {
      setUploading(false);
    }
  };

  const handlePickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.type !== "video") return;
    setUploading(true);
    try {
      const name = await getSenderName();
      const url = await uploadToStorage(
        asset.uri,
        `chats/${conv!.id}/${me!.uid}_${Date.now()}_vid`,
      );
      await saveMessage(
        {
          senderId: me!.uid,
          senderName: name,
          type: "video",
          mediaUrl: url,
          fileName: asset.fileName ?? "video.mp4",
          fileSize: asset.fileSize ? bytesToSize(asset.fileSize) : "",
        },
        "🎥 Video",
      );
    } catch (e: any) {
      Alert.alert("Upload error", e.message);
    } finally {
      setUploading(false);
    }
  };

  const handlePickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const file = result.assets?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const name = await getSenderName();
      const url = await uploadToStorage(
        file.uri,
        `chats/${conv!.id}/${me!.uid}_${Date.now()}_doc`,
      );
      await saveMessage(
        {
          senderId: me!.uid,
          senderName: name,
          type: "document",
          mediaUrl: url,
          fileName: file.name,
          fileSize: file.size ? bytesToSize(file.size) : "",
        },
        `📄 ${file.name}`,
      );
    } catch (e: any) {
      Alert.alert("Upload error", e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleGifSelect = async (url: string) => {
    if (!me || !conv) return;
    const name = await getSenderName();
    await saveMessage(
      { senderId: me.uid, senderName: name, type: "gif", mediaUrl: url },
      "🎞️ GIF",
    );
  };

  const handleVoiceSend = async (uri: string, duration: number) => {
    if (!me || !conv) return;
    setUploading(true);
    try {
      const name = await getSenderName();
      const url = await uploadToStorage(
        uri,
        `chats/${conv.id}/${me.uid}_${Date.now()}_voice.m4a`,
      );
      await saveMessage(
        {
          senderId: me.uid,
          senderName: name,
          type: "voice",
          mediaUrl: url,
          duration,
        },
        `🎙️ Voice (${fmtDuration(duration)})`,
      );
    } catch (e: any) {
      Alert.alert("Upload error", e.message);
    } finally {
      setUploading(false);
    }
  };

  if (!conv) return null;
  const other = conv.otherUser;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[cw.root, { backgroundColor: theme.bgColor }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={[
            cw.hdr,
            {
              backgroundColor: theme.bgColor,
              borderBottomColor: theme.borderColor,
            },
          ]}
        >
          <TouchableOpacity style={cw.backBtn} onPress={onClose}>
            <Ionicons name="chevron-back" size={22} color={C.white} />
          </TouchableOpacity>
          {other.photoURL ? (
            <Image source={{ uri: other.photoURL }} style={cw.av} />
          ) : (
            <View style={cw.avFallback}>
              <Text style={cw.avInitial}>
                {(other.displayName || "?")[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={cw.name}>
              {other.displayName || other.email?.split("@")[0] || "User"}
            </Text>
            <Text style={cw.status}>● Online</Text>
          </View>
          {uploading && (
            <View style={cw.uploadingBadge}>
              <ActivityIndicator size="small" color={C.bg} />
              <Text style={cw.uploadingTxt}>Uploading…</Text>
            </View>
          )}
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, backgroundColor: theme.chatBackground.color }}
          contentContainerStyle={cw.msgList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {theme.chatBackground.type === "image" &&
            theme.chatBackground.imageUri && (
              <Image
                source={{ uri: theme.chatBackground.imageUri }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
              />
            )}
          {messages.length === 0 && (
            <View style={cw.empty}>
              <Ionicons name="chatbubble-outline" size={32} color={C.muted} />
              <Text style={cw.emptyTxt}>Say hello! 👋</Text>
              <Text style={cw.emptySub}>
                Hold mic to record a voice message
              </Text>
            </View>
          )}
          {messages.map((m) => {
            const isMe = m.senderId === me?.uid;
            return (
              <View key={m.id} style={isMe ? cw.rowMe : cw.rowThem}>
                {!isMe && (
                  <View style={cw.msgAv}>
                    <Text style={cw.msgAvTxt}>
                      {(m.senderName || "?")[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                <MessageBubble m={m} isMe={isMe} theme={theme} />
              </View>
            );
          })}
          <View style={{ height: 12 }} />
        </ScrollView>

        <View
          style={[
            cw.inputBar,
            {
              borderTopColor: theme.borderColor,
              backgroundColor: theme.bgColor,
            },
          ]}
        >
          <TouchableOpacity
            style={cw.attachBtn}
            onPress={() => setShowAttach(true)}
          >
            <Ionicons name="add-circle-outline" size={26} color={C.muted} />
          </TouchableOpacity>
          <TextInput
            style={[
              cw.input,
              {
                backgroundColor: theme.cardColor,
                borderColor: theme.borderColor,
                color: theme.textPrimary,
              },
            ]}
            placeholderTextColor={theme.textSecondary}
            placeholder="Message..."
            value={text}
            onChangeText={setText}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            multiline
          />
          <TouchableOpacity style={cw.gifBtn} onPress={() => setShowGif(true)}>
            <Text style={cw.gifBtnTxt}>GIF</Text>
          </TouchableOpacity>
          {text.trim() ? (
            <TouchableOpacity
              style={[cw.sendBtn, sending && { opacity: 0.5 }]}
              onPress={handleSend}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color={C.bg} />
              ) : (
                <Ionicons name="send" size={15} color={C.bg} />
              )}
            </TouchableOpacity>
          ) : (
            <VoiceButton onVoiceSend={handleVoiceSend} />
          )}
        </View>
      </KeyboardAvoidingView>

      <AttachMenu
        visible={showAttach}
        onClose={() => setShowAttach(false)}
        onPickImage={() => {
          setShowAttach(false);
          setTimeout(() => handlePickImage(), 500);
        }}
        onPickVideo={() => {
          setShowAttach(false);
          setTimeout(() => handlePickVideo(), 500);
        }}
        onPickDocument={() => {
          setShowAttach(false);
          setTimeout(() => handlePickDocument(), 500);
        }}
        onPickGif={() => {
          setShowAttach(false);
          setShowGif(true);
        }}
      />
      <GifPicker
        visible={showGif}
        onSelect={handleGifSelect}
        onClose={() => setShowGif(false)}
      />
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────
const cw = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  hdr: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
  av: { width: 40, height: 40, borderRadius: 13 },
  avFallback: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: C.card2,
    justifyContent: "center",
    alignItems: "center",
  },
  avInitial: { fontSize: 16, fontWeight: "900", color: C.lime },
  name: { fontSize: 15, fontWeight: "800", color: C.white },
  status: { fontSize: 11, color: C.green, marginTop: 1 },
  uploadingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.lime,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  uploadingTxt: { fontSize: 11, fontWeight: "700", color: C.bg },
  msgList: { padding: 14, gap: 10, flexGrow: 1 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyTxt: { color: C.white, fontSize: 15, fontWeight: "700" },
  emptySub: { color: C.muted, fontSize: 12 },
  rowMe: { flexDirection: "row", justifyContent: "flex-end" },
  rowThem: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  msgAv: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: C.card2,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  msgAvTxt: { fontSize: 11, fontWeight: "900", color: C.lime },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  attachBtn: {
    width: 36,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 14,
    maxHeight: 100,
  },
  gifBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
  },
  gifBtnTxt: {
    color: C.lime,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.lime,
    justifyContent: "center",
    alignItems: "center",
  },
});

const mb = StyleSheet.create({
  bubble: {
    maxWidth: "75%",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    overflow: "hidden",
  },
  txt: { fontSize: 14, color: C.white, lineHeight: 20 },
  time: { fontSize: 10, color: C.muted, marginTop: 4 },
  img: { width: 200, height: 200, borderRadius: 12, marginBottom: 4 },
  gif: { width: 180, height: 160, borderRadius: 12 },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 2,
    minWidth: 180,
  },
  fileIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  fileName: { fontSize: 13, fontWeight: "700", color: C.white, flex: 1 },
  fileSz: { fontSize: 11, color: C.muted, marginTop: 1 },
});

const vm = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 160,
    paddingVertical: 2,
  },
  playBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  trackBg: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 2,
    overflow: "hidden",
  },
  trackFill: { height: "100%", borderRadius: 2 },
  dur: { fontSize: 11, minWidth: 30 },
});

const vb = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  indicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.card2,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  recDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.danger },
  recTime: { color: C.white, fontSize: 12, fontWeight: "700" },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
  },
  btnActive: { backgroundColor: C.danger, borderColor: C.danger },
});

const am = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 20,
  },
  title: {
    fontSize: 10,
    fontWeight: "700",
    color: C.muted,
    letterSpacing: 2,
    marginBottom: 20,
  },
  grid: { flexDirection: "row", justifyContent: "space-around" },
  item: { alignItems: "center", gap: 8 },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  itemTxt: { fontSize: 12, fontWeight: "600", color: C.white },
});

const gp = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "60%",
    paddingBottom: 16,
  },
  hdr: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  title: { fontSize: 15, fontWeight: "800", color: C.white },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: C.card2,
    justifyContent: "center",
    alignItems: "center",
  },
  tabs: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.border,
  },
  tabActive: { backgroundColor: C.lime, borderColor: C.lime },
  tabTxt: { fontSize: 12, fontWeight: "700", color: C.muted },
  tabTxtActive: { color: C.bg },
  grid: { flexDirection: "row", flexWrap: "wrap", padding: 12, gap: 8 },
  gifItem: { borderRadius: 12, overflow: "hidden" },
  gif: { width: 150, height: 120 },
});
