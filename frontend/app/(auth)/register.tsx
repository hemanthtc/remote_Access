import React, { useState } from "react";
import { Pressable, Text } from "react-native";
import { router } from "expo-router";
import { AuthScreen } from "@/src/components/auth-form";
import { useAuth } from "@/src/context/auth";
import { colors, font, type } from "@/src/theme";

export default function Register() {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      await register(email.trim(), password, name.trim() || undefined);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen
      mode="register"
      submitLabel="Create Account"
      onSubmit={submit}
      error={error}
      loading={loading}
      fields={[
        { icon: "person-outline", placeholder: "Name (optional)", value: name, set: setName, testID: "register-name-input" },
        { icon: "mail-outline", placeholder: "Email", value: email, set: setEmail, keyboardType: "email-address", testID: "register-email-input" },
        { icon: "lock-closed-outline", placeholder: "Password", value: password, set: setPassword, secure: true, testID: "register-password-input" },
      ]}
      footer={
        <Pressable testID="go-to-login" onPress={() => router.replace("/(auth)/login")}>
          <Text style={{ color: colors.onSurfaceSecondary, fontFamily: font.body, fontSize: type.base }}>
            Already have an account?{" "}
            <Text style={{ color: colors.brandPrimary, fontFamily: font.bodySemi }}>Sign in</Text>
          </Text>
        </Pressable>
      }
    />
  );
}
