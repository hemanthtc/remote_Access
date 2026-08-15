import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api, Device } from "@/src/api/client";
import { useToast } from "@/src/components/toast";
import { colors, font, radius, spacing, type } from "@/src/theme";

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Devices() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const list = await api.devices();
      setDevices(list);
    } catch (e: any) {
      if (!silent) setError(e.message || "Failed to load devices");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(() => load(true), 5000);
      return () => clearInterval(t);
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const remove = async (d: Device) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.deleteDevice(d.id);
      toast.show("Device removed", "success");
      load();
    } catch (e: any) {
      toast.show(e.message || "Failed to remove", "error");
    }
  };

  const connect = (d: Device) => {
    if (!d.online) {
      toast.show("This computer is offline", "error");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.push(`/viewer/${d.id}?name=${encodeURIComponent(d.name)}`);
  };

  const renderCard = ({ item }: { item: Device }) => (
    <View style={styles.card} testID={`device-card-${item.id}`}>
      <View style={styles.cardTop}>
        <View style={styles.iconBox}>
          <Ionicons name="desktop-outline" size={22} color={colors.brandSecondary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.deviceName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: item.online ? colors.success : colors.info }]} />
            <Text style={[styles.statusText, { color: item.online ? colors.success : colors.onSurfaceSecondary }]}>
              {item.online ? "ONLINE" : "OFFLINE"}
            </Text>
            <Text style={styles.meta}>· {timeAgo(item.last_seen)}</Text>
          </View>
        </View>
        <Pressable testID={`device-remove-${item.id}`} onPress={() => remove(item)} hitSlop={10} style={styles.trash}>
          <Ionicons name="trash-outline" size={18} color={colors.onSurfaceSecondary} />
        </Pressable>
      </View>
      <Text style={styles.deviceId}>ID · {item.id.slice(0, 12).toUpperCase()}</Text>
      <Pressable
        testID={`device-connect-${item.id}`}
        onPress={() => connect(item)}
        style={({ pressed }) => [
          styles.connectBtn,
          { backgroundColor: item.online ? colors.brandPrimary : colors.surfaceTertiary, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Ionicons
          name={item.online ? "flash" : "flash-off-outline"}
          size={18}
          color={item.online ? colors.onBrandPrimary : colors.onSurfaceSecondary}
        />
        <Text style={[styles.connectText, { color: item.online ? colors.onBrandPrimary : colors.onSurfaceSecondary }]}>
          {item.online ? "Connect" : "Unavailable"}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View>
          <Text style={styles.eyebrow}>CONTROL CENTER</Text>
          <Text style={styles.title}>My Devices</Text>
        </View>
        <Pressable testID="add-device-button" onPress={() => router.push("/add-device")} style={styles.addBtn}>
          <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
        </Pressable>
      </View>

      {devices === null && !error ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={44} color={colors.onSurfaceSecondary} />
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable testID="devices-retry" onPress={() => load()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry Connection</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(d) => d.id}
          renderItem={renderCard}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 80, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="server-outline" size={40} color={colors.onSurfaceSecondary} />
              </View>
              <Text style={styles.emptyTitle}>No computers linked</Text>
              <Text style={styles.emptyText}>Add a device to start controlling it from here.</Text>
              <Pressable testID="empty-add-device" onPress={() => router.push("/add-device")} style={styles.retryBtn}>
                <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
                <Text style={styles.retryText}>Add Device</Text>
              </Pressable>
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
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  eyebrow: { color: colors.brandSecondary, fontFamily: font.bodySemi, fontSize: 11, letterSpacing: 2 },
  title: { color: colors.onSurface, fontFamily: font.displayBold, fontSize: 30 },
  addBtn: {
    width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconBox: {
    width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  deviceName: { color: colors.onSurface, fontFamily: font.displayBold, fontSize: type.xl },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontFamily: font.bodySemi, fontSize: 11, letterSpacing: 1 },
  meta: { color: colors.onSurfaceSecondary, fontFamily: font.body, fontSize: type.sm },
  trash: { padding: spacing.xs },
  deviceId: { color: colors.onSurfaceSecondary, fontFamily: font.displayMedium, fontSize: type.base, letterSpacing: 1 },
  connectBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    height: 46, borderRadius: radius.md,
  },
  connectText: { fontFamily: font.bodySemi, fontSize: type.lg },
  empty: { alignItems: "center", gap: spacing.md, paddingTop: spacing.xxxl },
  emptyIcon: {
    width: 84, height: 84, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border,
  },
  emptyTitle: { color: colors.onSurface, fontFamily: font.displayBold, fontSize: type.xl },
  emptyText: { color: colors.onSurfaceSecondary, fontFamily: font.body, fontSize: type.base, textAlign: "center" },
  retryBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm,
    backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.xl, height: 46, borderRadius: radius.md,
    justifyContent: "center",
  },
  retryText: { color: colors.onBrandPrimary, fontFamily: font.bodySemi, fontSize: type.lg },
});
