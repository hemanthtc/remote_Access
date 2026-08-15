import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api/client";
import { useToast } from "@/src/components/toast";
import { colors, font, radius, spacing, type } from "@/src/theme";

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL as string;

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
  const [data, setData] = useState<{ code: string; otp: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await api.pairNew();
      setData({ code: res.code, otp: res.otp });
    } catch (e: any) {
      toast.show(e.message || "Failed to generate code", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { generate(); }, []);

  const copy = async (value: string, label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(value);
    toast.show(`${label} copied`, "success");
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="add-device-close" onPress={() => router.back()} hitSlop={10} style={styles.close}>
          <Ionicons name="close" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Add Device</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.xl }}>
        <View style={styles.codeCard} testID="pairing-code-card">
          <Text style={styles.codeLabel}>PAIRING CODE</Text>
          {loading || !data ? (
            <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: spacing.xl }} />
          ) : (
            <>
              <Pressable onPress={() => copy(data.code, "Code")}>
                <Text style={styles.code} testID="pairing-code">{data.code}</Text>
              </Pressable>
              <View style={styles.otpRow}>
                <Text style={styles.otpLabel}>OTP</Text>
                <Pressable onPress={() => copy(data.otp, "OTP")} style={styles.otpChip}>
                  <Text style={styles.otp} testID="pairing-otp">{data.otp}</Text>
                  <Ionicons name="copy-outline" size={16} color={colors.onSurfaceSecondary} />
                </Pressable>
              </View>
              <Text style={styles.expiry}>Expires in 10 minutes</Text>
            </>
          )}
        </View>

        <Pressable testID="regenerate-code" onPress={generate} style={styles.regen}>
          <Ionicons name="refresh" size={16} color={colors.brandSecondary} />
          <Text style={styles.regenText}>Generate new code</Text>
        </Pressable>

        <View style={styles.instructions}>
          <Text style={styles.sectionTitle}>SET UP THE DESKTOP AGENT</Text>
          <Step n={1} title="Install the agent on your computer">
            <Text style={styles.stepBody}>Download the AnyControl agent and install its requirements (Windows / macOS / Linux).</Text>
          </Step>
          <Step n={2} title="Point it at your server">
            <View style={styles.serverBox}>
              <Text style={styles.serverUrl} numberOfLines={1}>{BACKEND}</Text>
              <Pressable onPress={() => copy(BACKEND, "Server URL")} hitSlop={8}>
                <Ionicons name="copy-outline" size={16} color={colors.onSurfaceSecondary} />
              </Pressable>
            </View>
          </Step>
          <Step n={3} title="Run the pairing command">
            <View style={styles.cmdBox}>
              <Text style={styles.cmd} selectable>
                python agent.py --server {BACKEND} --pair {data?.code || "<code>"} --otp {data?.otp || "<otp>"} --name "My Laptop"
              </Text>
            </View>
          </Step>
          <Step n={4} title="Done">
            <Text style={styles.stepBody}>The computer appears in My Devices as ONLINE. Tap Connect to control it.</Text>
          </Step>
        </View>

        <Pressable testID="pairing-done" onPress={() => router.back()} style={styles.doneBtn}>
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
  codeCard: {
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.xl, alignItems: "center",
  },
  codeLabel: { color: colors.brandSecondary, fontFamily: font.bodySemi, fontSize: type.sm, letterSpacing: 3 },
  code: {
    color: colors.onSurface, fontFamily: font.displayBold, fontSize: 44, letterSpacing: 4, marginTop: spacing.sm,
  },
  otpRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.lg },
  otpLabel: { color: colors.onSurfaceSecondary, fontFamily: font.bodySemi, fontSize: type.sm, letterSpacing: 2 },
  otpChip: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  otp: { color: colors.brandSecondary, fontFamily: font.displayBold, fontSize: type.xl, letterSpacing: 2 },
  expiry: { color: colors.onSurfaceSecondary, fontFamily: font.body, fontSize: type.sm, marginTop: spacing.lg },
  regen: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  regenText: { color: colors.brandSecondary, fontFamily: font.bodySemi, fontSize: type.base },
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
});
