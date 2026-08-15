import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, Session } from "@/src/api/client";
import { colors, font, radius, spacing, type } from "@/src/theme";

function fmtDuration(sec: number | null) {
  if (sec == null) return "active";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function Sessions() {
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<Session[] | null>(null);

  const load = useCallback(async () => {
    try {
      setSessions(await api.sessions());
    } catch {
      setSessions([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.eyebrow}>AUDIT TRAIL</Text>
        <Text style={styles.title}>Activity</Text>
      </View>

      {sessions === null ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 80 }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => (
            <View style={styles.row} testID={`session-${item.id}`}>
              <View style={styles.leftIcon}>
                <Ionicons name="link-outline" size={16} color={colors.brandSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.deviceName} numberOfLines={1}>{item.device_name}</Text>
                <Text style={styles.date}>{fmtDate(item.started_at)}</Text>
              </View>
              <View style={styles.durationBox}>
                <Text style={[styles.duration, item.ended_at == null && { color: colors.success }]}>
                  {fmtDuration(item.duration_sec)}
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="document-text-outline" size={38} color={colors.onSurfaceSecondary} />
              </View>
              <Text style={styles.emptyTitle}>No sessions logged</Text>
              <Text style={styles.emptyText}>Your connection history will appear here.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  eyebrow: { color: colors.brandSecondary, fontFamily: font.bodySemi, fontSize: 11, letterSpacing: 2 },
  title: { color: colors.onSurface, fontFamily: font.displayBold, fontSize: 30 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  leftIcon: {
    width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  deviceName: { color: colors.onSurface, fontFamily: font.bodySemi, fontSize: type.lg },
  date: { color: colors.onSurfaceSecondary, fontFamily: font.displayMedium, fontSize: type.sm, letterSpacing: 0.5 },
  durationBox: { alignItems: "flex-end" },
  duration: { color: colors.onSurfaceTertiary, fontFamily: font.display, fontSize: type.lg },
  sep: { height: 1, backgroundColor: colors.divider },
  empty: { alignItems: "center", gap: spacing.md, paddingTop: spacing.xxxl },
  emptyIcon: {
    width: 84, height: 84, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border,
  },
  emptyTitle: { color: colors.onSurface, fontFamily: font.displayBold, fontSize: type.xl },
  emptyText: { color: colors.onSurfaceSecondary, fontFamily: font.body, fontSize: type.base },
});
