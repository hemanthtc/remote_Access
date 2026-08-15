import React, { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, radius, spacing, type } from "@/src/theme";
import { PrimaryButton } from "@/src/components/ui";

const HERO =
  "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzOTB8MHwxfHNlYXJjaHwxfHxkYXRhY2VudGVyJTIwc2VydmVycyUyMGFic3RyYWN0fGVufDB8fHx8MTc4NjgwMTIzNXww&ixlib=rb-4.1.0&q=85";

type Field = { icon: keyof typeof Ionicons.glyphMap; placeholder: string; value: string; set: (v: string) => void; secure?: boolean; keyboardType?: any; testID: string };

export function AuthScreen({
  mode,
  fields,
  submitLabel,
  onSubmit,
  error,
  loading,
  footer,
}: {
  mode: "login" | "register";
  fields: Field[];
  submitLabel: string;
  onSubmit: () => void;
  error?: string | null;
  loading?: boolean;
  footer: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Image source={{ uri: HERO }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <LinearGradient
            colors={["rgba(15,15,15,0.35)", "rgba(15,15,15,0.85)", colors.surface]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.heroContent, { paddingTop: insets.top + spacing.xl }]}>
            <View style={styles.logoRow}>
              <View style={styles.logoBadge}>
                <Ionicons name="hardware-chip" size={22} color={colors.brandPrimary} />
              </View>
              <Text style={styles.brandText}>ANYCONTROL</Text>
            </View>
            <Text style={styles.title}>
              {mode === "login" ? "Command your\ndesktop remotely" : "Create your\nsecure account"}
            </Text>
            <Text style={styles.subtitle}>Encrypted remote access from your pocket.</Text>
          </View>
        </View>

        <View style={styles.form}>
          {fields.map((f) => (
            <View key={f.testID} style={styles.inputWrap}>
              <Ionicons name={f.icon} size={18} color={colors.onSurfaceSecondary} />
              <TextInput
                testID={f.testID}
                style={styles.input}
                placeholder={f.placeholder}
                placeholderTextColor={colors.onSurfaceSecondary}
                value={f.value}
                onChangeText={f.set}
                secureTextEntry={f.secure}
                keyboardType={f.keyboardType}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ))}

          {error ? (
            <View style={styles.errorRow} testID="auth-error">
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <PrimaryButton
            testID="auth-submit-button"
            label={submitLabel}
            onPress={onSubmit}
            loading={loading}
            style={{ marginTop: spacing.sm }}
          />

          <View style={styles.footer}>{footer}</View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: { height: 320, justifyContent: "flex-end" },
  heroContent: { padding: spacing.xl, gap: spacing.sm },
  logoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  logoBadge: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center",
  },
  brandText: { color: colors.onSurface, fontFamily: font.displayBold, fontSize: type.xl, letterSpacing: 3 },
  title: { color: colors.onSurface, fontFamily: font.displayBold, fontSize: 34, lineHeight: 38 },
  subtitle: { color: colors.onSurfaceSecondary, fontFamily: font.body, fontSize: type.lg },
  form: { padding: spacing.xl, gap: spacing.md },
  inputWrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, height: 54,
    borderWidth: 1, borderColor: colors.border,
  },
  input: { flex: 1, color: colors.onSurface, fontFamily: font.body, fontSize: type.lg, height: "100%" },
  errorRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  errorText: { color: colors.error, fontFamily: font.bodyMedium, fontSize: type.base, flexShrink: 1 },
  footer: { marginTop: spacing.lg, alignItems: "center" },
});
