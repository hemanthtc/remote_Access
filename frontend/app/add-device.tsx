import React, { useEffect, useState, useRef } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, Platform } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import jsqr from "jsqr";
import { api } from "@/src/api/client";
import { useToast } from "@/src/components/toast";
import { colors, font, radius, spacing, type } from "@/src/theme";

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL as string;

// Helper to safely render standard HTML tags on web compilation
const VideoElement = "video" as any;
const CanvasElement = "canvas" as any;

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}><Text style={styles.stepNumText}>{n}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.stepTitle}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

export default function AddDevice() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  
  // Modes: "select" (choose host or scan), "host" (show QR), "scan" (camera active)
  const [mode, setMode] = useState<"select" | "host" | "scan">("select");
  const [data, setData] = useState<{ code: string; otp: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Scanner refs
  const videoRef = useRef<any>(null);
  const canvasRef = useRef<any>(null);
  const streamRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  const startHostMode = async () => {
    setMode("host");
    setLoading(true);
    try {
      const res = await api.pairNew();
      setData({ code: res.code, otp: res.otp });
    } catch (e: any) {
      toast.show(e.message || "Failed to generate pairing details", "error");
      setMode("select");
    } finally {
      setLoading(false);
    }
  };

  const startScanMode = async () => {
    setMode("scan");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          requestAnimationFrame(tick);
        }
      }, 100);
    } catch (err) {
      toast.show("Camera access denied or unavailable", "error");
      setMode("select");
    }
  };

  const stopScanner = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track: any) => track.stop());
      streamRef.current = null;
    }
  };

  const tick = () => {
    if (!streamRef.current || !videoRef.current) return;
    const video = videoRef.current;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsqr(imageData.data, imageData.width, imageData.height);
        if (code) {
          try {
            const payload = JSON.parse(code.data);
            if (payload.code && payload.otp) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              stopScanner();
              claimAgent(payload.code, payload.otp);
              return;
            }
          } catch {
            // Not a valid payload
          }
        }
      }
    }
    requestAnimationFrame(tick);
  };

  const claimAgent = async (code: string, otp: string) => {
    try {
      await api.agentClaim(code, otp);
      toast.show("Device linked successfully!", "success");
      router.replace("/(tabs)");
    } catch (e: any) {
      toast.show(e.message || "Failed to link device", "error");
      startScanMode();
    }
  };

  const copy = async (value: string, label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(value);
    toast.show(`${label} copied`, "success");
  };

  const reset = () => {
    stopScanner();
    setMode("select");
    setData(null);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        {mode !== "select" ? (
          <Pressable testID="add-device-back" onPress={reset} hitSlop={10} style={styles.close}>
            <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
          </Pressable>
        ) : (
          <Pressable
            testID="add-device-close"
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/(tabs)");
              }
            }}
            hitSlop={10}
            style={styles.close}
          >
            <Ionicons name="close" size={24} color={colors.onSurface} />
          </Pressable>
        )}
        <Text style={styles.title}>
          {mode === "select" ? "Add Device" : mode === "host" ? "Host Setup" : "Scan QR Code"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.xl }}>
        {/* MODE SELECTOR */}
        {mode === "select" && (
          <View style={styles.selectContainer}>
            <Pressable
              testID="option-host"
              onPress={startHostMode}
              style={styles.optionCard}
            >
              <View style={styles.optionIconBox}>
                <Ionicons name="desktop-outline" size={28} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text style={styles.optionTitle}>Make this device as a host</Text>
                <Text style={styles.optionDesc}>Display a QR code on this screen so another device can scan and control this computer.</Text>
              </View>
            </Pressable>

            <Pressable
              testID="option-scan"
              onPress={startScanMode}
              style={styles.optionCard}
            >
              <View style={styles.optionIconBox}>
                <Ionicons name="scan-outline" size={28} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text style={styles.optionTitle}>Scan the QR code</Text>
                <Text style={styles.optionDesc}>Open your camera to scan a host's QR code and control it remotely from this device.</Text>
              </View>
            </Pressable>
          </View>
        )}

        {/* HOST MODE (Displays QR Code) */}
        {mode === "host" && (
          <View style={styles.hostContainer}>
            <View style={styles.scannerBox}>
              <Text style={styles.scannerLabel}>SCAN THIS QR CODE ON YOUR CONTROLLER</Text>
              {loading || !data ? (
                <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: spacing.xl }} />
              ) : (
                <div style={{ marginTop: spacing.md, padding: spacing.md, backgroundColor: "#fff", borderRadius: 12 }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                      JSON.stringify({ code: data.code, otp: data.otp })
                    )}`}
                    style={{ width: 200, height: 200, display: "block" }}
                    alt="Pairing QR Code"
                  />
                </div>
              )}
              {data && (
                <View style={styles.textCodes}>
                  <Text style={styles.expiry}>Pairing Code: <Text style={{ color: colors.onSurface, fontFamily: font.displayBold }}>{data.code}</Text>  |  OTP: <Text style={{ color: colors.brandSecondary, fontFamily: font.displayBold }}>{data.otp}</Text></Text>
                </View>
              )}
              <Text style={styles.scannerSubtitle}>
                Leave this screen open and scan the QR code above with your mobile phone to pair.
              </Text>
            </View>

            <View style={[styles.instructions, { marginTop: spacing.lg }]}>
              <Text style={styles.sectionTitle}>AGENT SETUP INSTRUCTIONS</Text>
              <Step n={1} title="Run the desktop agent on this computer">
                <Text style={styles.stepBody}>Open a terminal on this computer and run the agent script pointing to your server:</Text>
                <View style={styles.cmdBox}>
                  <Text style={styles.cmd} selectable>
                    npm run dev:agent -- --server {BACKEND} --pair {data?.code || "<code>"} --otp {data?.otp || "<otp>"}
                  </Text>
                </View>
              </Step>
              <Step n={2} title="Or: Connect with account credentials">
                <Text style={styles.stepBody}>You can also login the agent directly in terminal without pairing code:</Text>
                <View style={styles.cmdBox}>
                  <Text style={styles.cmd} selectable>
                    npm run dev:agent -- --server {BACKEND} --email "your-email" --password "your-pass"
                  </Text>
                </View>
              </Step>
            </View>
          </View>
        )}

        {/* SCAN MODE (Webcam Camera Active) */}
        {mode === "scan" && (
          <View style={styles.scanContainer}>
            <View style={styles.scannerBox} testID="qr-scanner-card">
              <Text style={styles.scannerLabel}>ALIGN QR CODE IN THE BOX</Text>
              {Platform.OS === "web" ? (
                <VideoElement
                  ref={videoRef}
                  style={{ width: "100%", height: 260, borderRadius: radius.md, backgroundColor: "#000", marginTop: spacing.md }}
                  playsInline
                />
              ) : (
                <View style={styles.scannerOffline}>
                  <Ionicons name="camera-reverse-outline" size={48} color={colors.onSurfaceSecondary} />
                  <Text style={styles.scannerOfflineText}>Camera scanner inactive or blocked</Text>
                </View>
              )}
              <CanvasElement ref={canvasRef} style={{ display: "none" }} />
              <Text style={styles.scannerSubtitle}>
                Point your phone's camera at the QR code displayed on your computer (terminal or web browser host setup screen).
              </Text>
            </View>

            <View style={[styles.instructions, { marginTop: spacing.lg }]}>
              <Text style={styles.sectionTitle}>SET UP THE HOST COMPUTER</Text>
              <Step n={1} title="Start agent or host screen on your computer">
                <Text style={styles.stepBody}>Run the background desktop agent on your laptop or click "Make this device as a host" in the web application browser on your computer.</Text>
              </Step>
              <Step n={2} title="Run the command to show QR code">
                <View style={styles.cmdBox}>
                  <Text style={styles.cmd} selectable>
                    npm run dev:agent -- --server {BACKEND}
                  </Text>
                </View>
              </Step>
              <Step n={3} title="Align & Connect">
                <Text style={styles.stepBody}>Point this scanner box directly at the QR Code printed in your laptop terminal or displayed on your laptop browser screen.</Text>
              </Step>
            </View>
          </View>
        )}

        <Pressable
          testID="pairing-done"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)");
            }
          }}
          style={styles.doneBtn}
        >
          <Text style={styles.doneText}>Back to Devices</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  close: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontFamily: font.displayBold, fontSize: type.xxl },
  scannerBox: {
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.xl, alignItems: "center",
  },
  scannerLabel: { color: colors.brandSecondary, fontFamily: font.bodySemi, fontSize: type.sm, letterSpacing: 2, textAlign: "center" },
  scannerOffline: {
    width: "100%", height: 260, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border, marginTop: spacing.md,
    alignItems: "center", justifyContent: "center", gap: spacing.md,
  },
  scannerOfflineText: { color: colors.onSurfaceSecondary, fontFamily: font.body, fontSize: type.base },
  retryScanBtn: {
    paddingHorizontal: spacing.xl, height: 40, borderRadius: radius.md,
    backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center",
  },
  retryScanText: { color: colors.onBrandPrimary, fontFamily: font.bodySemi, fontSize: type.base },
  scannerSubtitle: { color: colors.onSurfaceSecondary, fontFamily: font.body, fontSize: type.sm, marginTop: spacing.lg, textAlign: "center", lineHeight: 18 },
  instructions: { gap: spacing.lg },
  sectionTitle: { color: colors.onSurfaceSecondary, fontFamily: font.bodySemi, fontSize: 11, letterSpacing: 2 },
  step: { flexDirection: "row", gap: spacing.md },
  stepNum: {
    width: 28, height: 28, borderRadius: radius.pill, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  stepNumText: { color: colors.onBrandTertiary, fontFamily: font.displayBold, fontSize: type.base },
  stepTitle: { color: colors.onSurface, fontFamily: font.bodySemi, fontSize: type.lg, marginBottom: spacing.xs },
  stepBody: { color: colors.onSurfaceSecondary, fontFamily: font.body, fontSize: type.base, lineHeight: 20 },
  stepBodyDetail: { color: colors.onSurfaceSecondary, fontFamily: font.body, fontSize: type.sm, lineHeight: 18, marginTop: spacing.xs },
  serverBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  serverUrl: { flex: 1, color: colors.onSurfaceTertiary, fontFamily: font.displayMedium, fontSize: type.base },
  cmdBox: {
    backgroundColor: "#000", borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  cmd: { color: colors.brandSecondary, fontFamily: font.displayMedium, fontSize: type.sm, lineHeight: 18 },
  doneBtn: {
    height: 52, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  doneText: { color: colors.onSurface, fontFamily: font.bodySemi, fontSize: type.lg },
  selectContainer: { gap: spacing.lg, paddingVertical: spacing.md },
  optionCard: {
    flexDirection: "row", gap: spacing.lg, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.xl,
    alignItems: "center",
  },
  optionIconBox: {
    width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  optionTitle: { color: colors.onSurface, fontFamily: font.displayBold, fontSize: type.xl },
  optionDesc: { color: colors.onSurfaceSecondary, fontFamily: font.body, fontSize: type.base, lineHeight: 22 },
  hostContainer: { gap: spacing.xl },
  scanContainer: { gap: spacing.xl },
  textCodes: { marginTop: spacing.md, alignItems: "center" },
  expiry: { color: colors.onSurfaceSecondary, fontFamily: font.body, fontSize: type.base },
});
