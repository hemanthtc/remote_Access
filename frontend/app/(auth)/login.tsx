import React, { useState } from "react";
import { Pressable, Text } from "react-native";
import { router } from "expo-router";
import { AuthScreen } from "@/src/components/auth-form";
import { useAuth } from "@/src/context/auth";
import { colors, font, type } from "@/src/theme";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen
      mode="login"
      submitLabel="Sign In"
      onSubmit={submit}
      error={error}
      loading={loading}
      fields={[
        { icon: "mail-outline", placeholder: "Email", value: email, set: setEmail, keyboardType: "email-address", testID: "login-email-input" },
        { icon: "lock-closed-outline", placeholder: "Password", value: password, set: setPassword, secure: true, testID: "login-password-input" },
      ]}
      footer={
        <Pressable testID="go-to-register" onPress={() => router.push("/(auth)/register")}>
          <Text style={{ color: colors.onSurfaceSecondary, fontFamily: font.body, fontSize: type.base }}>
            No account?{" "}
            <Text style={{ color: colors.brandPrimary, fontFamily: font.bodySemi }}>Create one</Text>
          </Text>
        </Pressable>
      }
    />
  );
}
