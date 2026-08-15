import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/auth";
import { PrimaryButton } from "@/src/components/ui";
import { colors, font, radius, spacing, type } from "@/src/theme";

function Row({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={18} color={colors.onBrandTertiary} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? <Text style={styles.rowValue} numberOfLines={1}>{value}</Text> : null}
    </View>
  );
}

export default function Settings() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const doLogout = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.eyebrow}>ACCOUNT</Text>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 80, gap: spacing.xl }}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || user?.email || "?").charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name || "User"}</Text>
            <Text style={styles.email} numberOfLines={1}>{user?.email}</Text>
          </View>
        </View>

        <View style={styles.group}>
          <Text style={styles.groupTitle}>SECURITY</Text>
          <View style={styles.card}>
            <Row icon="shield-checkmark-outline" label="Encrypted transport (WSS)" value="On" />
            <View style={styles.sep} />
            <Row icon="key-outline" label="JWT session" value="Active" />
            <View style={styles.sep} />
            <Row icon="finger-print-outline" label="Token storage" value="Secure Keychain" />
          </View>
        </View>

        <View style={styles.group}>
          <Text style={styles.groupTitle}>ABOUT</Text>
          <View style={styles.card}>
            <Row icon="hardware-chip-outline" label="AnyControl Remote" value="v1.0.0" />
            <View style={styles.sep} />
            <Row icon="git-branch-outline" label="Architecture" value="Self-hosted relay" />
          </View>
        </View>

        <PrimaryButton
          testID="logout-button"
          label="Sign Out"
          variant="danger"
          onPress={doLogout}
          icon={<Ionicons name="log-out-outline" size={18} color={colors.error} />}
        />
      </ScrollView>
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
  profileCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.lg,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.lg,
  },
  avatar: {
    width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: colors.onBrandPrimary, fontFamily: font.displayBold, fontSize: 26 },
  name: { color: colors.onSurface, fontFamily: font.displayBold, fontSize: type.xl },
  email: { color: colors.onSurfaceSecondary, fontFamily: font.body, fontSize: type.base },
  group: { gap: spacing.sm },
  groupTitle: { color: colors.onSurfaceSecondary, fontFamily: font.bodySemi, fontSize: 11, letterSpacing: 2, marginLeft: spacing.xs },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  iconBox: {
    width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  rowLabel: { flex: 1, color: colors.onSurface, fontFamily: font.bodyMedium, fontSize: type.base },
  rowValue: { color: colors.onSurfaceSecondary, fontFamily: font.displayMedium, fontSize: type.base },
  sep: { height: 1, backgroundColor: colors.divider },
});
