import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { storage } from "@/src/utils/storage";
import { TOKEN_KEY, wsControlUrl } from "@/src/api/client";
import { colors, font, radius, spacing, type } from "@/src/theme";

type Conn = "connecting" | "live" | "agent_offline" | "ended" | "error";
type Frame = { uri: string; w: number; h: number };

const SPECIAL_KEYS: { label: string; send: any }[] = [
  { label: "Esc", send: { type: "key", key: "esc" } },
  { label: "Tab", send: { type: "key", key: "tab" } },
  { label: "↑", send: { type: "key", key: "up" } },
  { label: "↓", send: { type: "key", key: "down" } },
  { label: "←", send: { type: "key", key: "left" } },
  { label: "→", send: { type: "key", key: "right" } },
  { label: "Ctrl+C", send: { type: "hotkey", keys: ["ctrl", "c"] } },
  { label: "Ctrl+V", send: { type: "hotkey", keys: ["ctrl", "v"] } },
  { label: "Ctrl+Alt+Del", send: { type: "hotkey", keys: ["ctrl", "alt", "delete"] } },
];

export default function Viewer() {
  const insets = useSafeAreaInsets();
  const { deviceId, name } = useLocalSearchParams<{ deviceId: string; name?: string }>();

  const [conn, setConn] = useState<Conn>("connecting");
  const [frame, setFrame] = useState<Frame | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [rightClick, setRightClick] = useState(false);
  const [keyboardOn, setKeyboardOn] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef({ w: 0, h: 0 });
  const frameRef = useRef({ w: 1280, h: 720 });
  const lastMove = useRef(0);
  const lastTap = useRef(0);
  const gesture = useRef({ x0: 0, y0: 0, moved: false, didLong: false, longTimer: null as any });
  const inputRef = useRef<TextInput>(null);
  const prevText = useRef("");
  const rightClickRef = useRef(false);
  rightClickRef.current = rightClick;

  const send = useCallback((obj: any) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }, []);

  const toNorm = (lx: number, ly: number) => {
    const { w: cw, h: ch } = canvasRef.current;
    const { w: fw, h: fh } = frameRef.current;
    if (!cw || !ch) return { x: 0.5, y: 0.5 };
    const scale = Math.min(cw / fw, ch / fh);
    const dw = fw * scale;
    const dh = fh * scale;
    const ox = (cw - dw) / 2;
    const oy = (ch - dh) / 2;
    const x = Math.max(0, Math.min(1, (lx - ox) / dw));
    const y = Math.max(0, Math.min(1, (ly - oy) / dh));
    return { x, y };
  };

  const connect = useCallback(async () => {
    setConn("connecting");
    const token = await storage.secureGet(TOKEN_KEY, "");
    if (!token || !deviceId) {
      setConn("error");
      return;
    }
    const ws = new WebSocket(wsControlUrl(token as string, deviceId));
    wsRef.current = ws;

    ws.onmessage = (e) => {
      let msg: any;
      try { msg = JSON.parse(e.data as string); } catch { return; }
      if (msg.type === "frame") {
        frameRef.current = { w: msg.w, h: msg.h };
        setFrame({ uri: `data:image/jpeg;base64,${msg.data}`, w: msg.w, h: msg.h });
        setConn("live");
      } else if (msg.type === "status") {
        setConn(msg.agent_online ? "connecting" : "agent_offline");
      } else if (msg.type === "agent_disconnected") {
        setConn("agent_offline");
        setFrame(null);
      } else if (msg.type === "replaced") {
        setConn("ended");
      }
    };
    ws.onerror = () => setConn("error");
    ws.onclose = () => setConn((c) => (c === "ended" ? c : "error"));
  }, [deviceId]);

  useEffect(() => {
    connect();
    return () => { wsRef.current?.close(); };
  }, [connect]);

  const disconnect = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    wsRef.current?.close();
    router.back();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        gesture.current = { x0: locationX, y0: locationY, moved: false, didLong: false, longTimer: null };
        gesture.current.longTimer = setTimeout(() => {
          const n = toNorm(locationX, locationY);
          send({ type: "click", x: n.x, y: n.y, button: "right" });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          gesture.current.didLong = true;
        }, 500);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const g = gesture.current;
        if (Math.abs(locationX - g.x0) > 6 || Math.abs(locationY - g.y0) > 6) {
          g.moved = true;
          if (g.longTimer) { clearTimeout(g.longTimer); g.longTimer = null; }
        }
        const now = Date.now();
        if (now - lastMove.current > 55) {
          lastMove.current = now;
          const n = toNorm(locationX, locationY);
          send({ type: "move", x: n.x, y: n.y });
        }
      },
      onPanResponderRelease: (evt) => {
        const g = gesture.current;
        if (g.longTimer) { clearTimeout(g.longTimer); g.longTimer = null; }
        if (g.didLong) return;
        if (g.moved) return;
        const { locationX, locationY } = evt.nativeEvent;
        const n = toNorm(locationX, locationY);
        const now = Date.now();
        const isDouble = now - lastTap.current < 300;
        lastTap.current = now;
        const button = rightClickRef.current ? "right" : "left";
        send({ type: "click", x: n.x, y: n.y, button, double: isDouble && button === "left" });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (rightClickRef.current) setRightClick(false);
      },
    })
  ).current;

  const onCanvasLayout = (e: LayoutChangeEvent) => {
    canvasRef.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
  };

  const onType = (text: string) => {
    const prev = prevText.current;
    if (text.length > prev.length) {
      send({ type: "text", text: text.slice(prev.length) });
    } else if (text.length < prev.length) {
      send({ type: "key", key: "backspace" });
    }
    prevText.current = text;
    if (text.length > 40) { prevText.current = ""; setKbBuffer(""); }
  };
  const [kbBuffer, setKbBuffer] = useState("");

  const toggleKeyboard = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !keyboardOn;
    setKeyboardOn(next);
    if (next) setTimeout(() => inputRef.current?.focus(), 50);
    else inputRef.current?.blur();
  };

  return (
    <View style={styles.root}>
      {/* Canvas */}
      <View style={styles.canvas} onLayout={onCanvasLayout} {...panResponder.panHandlers} testID="remote-canvas">
        {frame ? (
          <Image
            source={{ uri: frame.uri }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            cachePolicy="none"
            transition={0}
          />
        ) : null}
      </View>

      {/* Connecting / offline overlays */}
      {conn !== "live" && (
        <View style={styles.overlay} testID="viewer-status-overlay">
          {conn === "connecting" && (
            <>
              <ActivityIndicator color={colors.brandPrimary} size="large" />
              <Text style={styles.termText}>{"> negotiating secure session..."}</Text>
            </>
          )}
          {conn === "agent_offline" && (
            <>
              <Ionicons name="power-outline" size={48} color={colors.warning} />
              <Text style={styles.overlayTitle}>Computer offline</Text>
              <Text style={styles.termText}>Waiting for the agent to come online.</Text>
              <Pressable testID="viewer-retry" onPress={connect} style={styles.overlayBtn}>
                <Text style={styles.overlayBtnText}>Retry</Text>
              </Pressable>
            </>
          )}
          {(conn === "error" || conn === "ended") && (
            <>
              <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
              <Text style={styles.overlayTitle}>{conn === "ended" ? "Session ended" : "Connection lost"}</Text>
              <Pressable testID="viewer-reconnect" onPress={connect} style={styles.overlayBtn}>
                <Text style={styles.overlayBtnText}>Reconnect</Text>
              </Pressable>
              <Pressable testID="viewer-exit" onPress={() => router.back()} style={{ marginTop: spacing.md }}>
                <Text style={styles.exitText}>Exit</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm, pointerEvents: "box-none" }]}>
        <Pressable testID="viewer-disconnect" onPress={disconnect} style={styles.iconBtn}>
          <Ionicons name="close" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={styles.topInfo}>
          <View style={[styles.statusDot, { backgroundColor: conn === "live" ? colors.success : colors.warning }]} />
          <Text style={styles.topTitle} numberOfLines={1}>{name || "Remote"}</Text>
        </View>
        <Pressable
          testID="viewer-keyboard-toggle"
          onPress={toggleKeyboard}
          style={[styles.iconBtn, keyboardOn && styles.iconBtnActive]}
        >
          <Ionicons name="keypad-outline" size={20} color={keyboardOn ? colors.onBrandPrimary : colors.onSurface} />
        </Pressable>
      </View>

      {/* Special keys row */}
      {showKeys && (
        <View style={[styles.keysWrap, { bottom: insets.bottom + 88, pointerEvents: "box-none" }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.keysRow}
          >
            {SPECIAL_KEYS.map((k) => (
              <Pressable
                key={k.label}
                testID={`special-key-${k.label}`}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); send(k.send); }}
                style={styles.keyChip}
              >
                <Text style={styles.keyChipText}>{k.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Bottom floating toolbar */}
      <View style={[styles.toolbar, { bottom: insets.bottom + spacing.lg, pointerEvents: "box-none" }]}>
        <View style={styles.toolbarInner}>
          <ToolBtn
            testID="viewer-rightclick-toggle"
            icon="git-commit-outline"
            label="R-Click"
            active={rightClick}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setRightClick((v) => !v); }}
          />
          <ToolBtn
            testID="viewer-keys-toggle"
            icon="options-outline"
            label="Keys"
            active={showKeys}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowKeys((v) => !v); }}
          />
          <ToolBtn
            testID="viewer-keyboard-btn"
            icon="keypad-outline"
            label="Type"
            active={keyboardOn}
            onPress={toggleKeyboard}
          />
        </View>
      </View>

      {/* Hidden keyboard input */}
      <TextInput
        ref={inputRef}
        testID="viewer-hidden-input"
        value={kbBuffer}
        onChangeText={(t) => { setKbBuffer(t); onType(t); }}
        onKeyPress={(e) => {
          const key = e.nativeEvent.key;
          if (key === "Enter") send({ type: "key", key: "enter" });
        }}
        onBlur={() => setKeyboardOn(false)}
        autoCapitalize="none"
        autoCorrect={false}
        blurOnSubmit={false}
        style={styles.hiddenInput}
      />
    </View>
  );
}

function ToolBtn({ icon, label, active, onPress, testID }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; active?: boolean; onPress: () => void; testID: string;
}) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.toolBtn, active && styles.toolBtnActive]}>
      <Ionicons name={icon} size={20} color={active ? colors.onBrandPrimary : colors.onSurface} />
      <Text style={[styles.toolLabel, active && { color: colors.onBrandPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  canvas: { flex: 1, backgroundColor: "#000" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center", justifyContent: "center", gap: spacing.md,
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  overlayTitle: { color: colors.onSurface, fontFamily: font.displayBold, fontSize: type.xxl },
  termText: { color: colors.onSurfaceSecondary, fontFamily: font.displayMedium, fontSize: type.base, letterSpacing: 0.5 },
  overlayBtn: {
    backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.xxl, height: 46,
    borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginTop: spacing.sm,
  },
  overlayBtnText: { color: colors.onBrandPrimary, fontFamily: font.bodySemi, fontSize: type.lg },
  exitText: { color: colors.onSurfaceSecondary, fontFamily: font.bodyMedium, fontSize: type.base },
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
    backgroundColor: "rgba(15,15,15,0.55)",
  },
  topInfo: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1, justifyContent: "center" },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  topTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: type.lg },
  iconBtn: {
    width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  iconBtnActive: { backgroundColor: colors.brandPrimary },
  keysWrap: { position: "absolute", left: 0, right: 0 },
  keysRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  keyChip: {
    height: 40, minWidth: 52, paddingHorizontal: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.borderStrong,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  keyChipText: { color: colors.onSurface, fontFamily: font.display, fontSize: type.base },
  toolbar: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  toolbarInner: {
    flexDirection: "row", gap: spacing.sm, backgroundColor: "rgba(26,26,26,0.94)",
    borderRadius: radius.pill, padding: spacing.xs, borderWidth: 1, borderColor: colors.border,
  },
  toolBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    paddingHorizontal: spacing.lg, height: 44, borderRadius: radius.pill,
  },
  toolBtnActive: { backgroundColor: colors.brandPrimary },
  toolLabel: { color: colors.onSurface, fontFamily: font.bodySemi, fontSize: type.base },
  hiddenInput: { position: "absolute", width: 1, height: 1, opacity: 0, top: -100 },
});
