import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api";
import { ENDPOINTS } from "@/constants/api";
import { useAuthStore } from "@/stores/authStore";
import Toast from "react-native-toast-message";

type Tab = "login" | "signup";

export default function LoginScreen() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [tab, setTab] = useState<Tab>("login");
  const [isLoading, setIsLoading] = useState(false);

  // Login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup fields
  const [signupUsername, setSignupUsername] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");

  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword) {
      Toast.show({ type: "error", text1: "Enter your email and password" });
      return;
    }
    try {
      setIsLoading(true);
      const data = await api.post<{ token: string; user: any }>(ENDPOINTS.mobileToken, {
        email: loginEmail.toLowerCase().trim(),
        password: loginPassword,
      });
      setAuth(data.user, data.token);
      router.replace("/(tabs)");
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "Login failed. Check your credentials.";
      Toast.show({ type: "error", text1: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!signupUsername.trim() || !signupEmail.trim() || !signupPassword) {
      Toast.show({ type: "error", text1: "All fields are required" });
      return;
    }
    if (!signupEmail.includes("@")) {
      Toast.show({ type: "error", text1: "Enter a valid email" });
      return;
    }
    if (signupPassword.length < 6) {
      Toast.show({ type: "error", text1: "Password must be at least 6 characters" });
      return;
    }
    if (signupPassword !== signupConfirm) {
      Toast.show({ type: "error", text1: "Passwords don't match" });
      return;
    }
    try {
      setIsLoading(true);
      const data = await api.post<{ token: string; user: any }>(ENDPOINTS.signup, {
        username: signupUsername.trim(),
        email: signupEmail.toLowerCase().trim(),
        password: signupPassword,
      });
      setAuth(data.user, data.token);
      router.replace("/(tabs)");
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "Signup failed. Try again.";
      Toast.show({ type: "error", text1: msg });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <LinearGradient colors={["#0f0f0f", "#0d1a12", "#0f0f0f"]} style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 32, paddingVertical: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Logo */}
            <View style={{ alignItems: "center", marginBottom: 40 }}>
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 20,
                  backgroundColor: Colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                  shadowColor: Colors.primary,
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.4,
                  shadowRadius: 20,
                }}
              >
                <Text style={{ fontSize: 36 }}>🎰</Text>
              </View>
              <Text style={{ fontSize: 42, fontWeight: "900", color: Colors.text.primary, letterSpacing: -2 }}>
                Tilt
              </Text>
              <Text style={{ fontSize: 15, color: Colors.text.secondary, marginTop: 6, textAlign: "center" }}>
                Bet on anything with your crew
              </Text>
            </View>

            {/* Tab switcher */}
            <View
              style={{
                flexDirection: "row",
                backgroundColor: Colors.surface,
                borderRadius: 14,
                padding: 4,
                marginBottom: 28,
                borderWidth: 1,
                borderColor: Colors.border,
              }}
            >
              {(["login", "signup"] as Tab[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTab(t)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 11,
                    alignItems: "center",
                    backgroundColor: tab === t ? Colors.primary : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "700",
                      fontSize: 15,
                      color: tab === t ? "white" : Colors.text.secondary,
                    }}
                  >
                    {t === "login" ? "Log In" : "Sign Up"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {tab === "login" ? (
              <View style={{ gap: 12 }}>
                <TextInput
                  value={loginEmail}
                  onChangeText={setLoginEmail}
                  placeholder="Email"
                  placeholderTextColor={Colors.text.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  style={inputStyle}
                />
                <TextInput
                  value={loginPassword}
                  onChangeText={setLoginPassword}
                  placeholder="Password"
                  placeholderTextColor={Colors.text.muted}
                  secureTextEntry
                  autoComplete="password"
                  style={inputStyle}
                />
                <TouchableOpacity
                  onPress={handleLogin}
                  disabled={isLoading}
                  style={{
                    backgroundColor: Colors.primary,
                    borderRadius: 14,
                    paddingVertical: 16,
                    alignItems: "center",
                    marginTop: 4,
                    shadowColor: Colors.primary,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 12,
                  }}
                >
                  {isLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>Log In</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                <TextInput
                  value={signupUsername}
                  onChangeText={setSignupUsername}
                  placeholder="Username"
                  placeholderTextColor={Colors.text.muted}
                  autoCapitalize="none"
                  autoComplete="username-new"
                  style={inputStyle}
                />
                <TextInput
                  value={signupEmail}
                  onChangeText={setSignupEmail}
                  placeholder="Email"
                  placeholderTextColor={Colors.text.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  style={inputStyle}
                />
                <TextInput
                  value={signupPassword}
                  onChangeText={setSignupPassword}
                  placeholder="Password (min 6 characters)"
                  placeholderTextColor={Colors.text.muted}
                  secureTextEntry
                  autoComplete="password-new"
                  style={inputStyle}
                />
                <TextInput
                  value={signupConfirm}
                  onChangeText={setSignupConfirm}
                  placeholder="Confirm password"
                  placeholderTextColor={Colors.text.muted}
                  secureTextEntry
                  style={inputStyle}
                />
                <TouchableOpacity
                  onPress={handleSignup}
                  disabled={isLoading}
                  style={{
                    backgroundColor: Colors.primary,
                    borderRadius: 14,
                    paddingVertical: 16,
                    alignItems: "center",
                    marginTop: 4,
                    shadowColor: Colors.primary,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 12,
                  }}
                >
                  {isLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>Create Account</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            <Text style={{ color: Colors.text.muted, fontSize: 12, textAlign: "center", marginTop: 28 }}>
              By continuing, you agree to our Terms of Service
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const inputStyle = {
  backgroundColor: Colors.surface,
  borderColor: Colors.border,
  borderWidth: 1,
  borderRadius: 14,
  paddingHorizontal: 16,
  paddingVertical: 14,
  color: Colors.text.primary,
  fontSize: 16,
} as const;
