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
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api";
import { ENDPOINTS } from "@/constants/api";
import { useAuthStore } from "@/stores/authStore";
import Toast from "react-native-toast-message";

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState("");
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);

  // Demo login for testing (bypasses OAuth)
  const demoLogin = async () => {
    try {
      setIsEmailLoading(true);
      const data = await api.post<{ token: string; user: any }>(ENDPOINTS.mobileToken, {
        email: "demo@tilt.app",
        name: "Demo Player",
        image: null,
      });
      setAuth(data.user, data.token);
      router.replace("/(tabs)");
    } catch (error) {
      Alert.alert("Error", "Could not connect to server. Make sure the API is running.");
    } finally {
      setIsEmailLoading(false);
    }
  };

  const loginWithEmail = async () => {
    if (!email.trim() || !email.includes("@")) {
      Toast.show({ type: "error", text1: "Enter a valid email" });
      return;
    }
    try {
      setIsEmailLoading(true);
      const data = await api.post<{ token: string; user: any }>(ENDPOINTS.mobileToken, {
        email: email.toLowerCase().trim(),
        name: email.split("@")[0],
      });
      setAuth(data.user, data.token);
      router.replace("/(tabs)");
    } catch (error) {
      Toast.show({ type: "error", text1: "Login failed. Try again." });
    } finally {
      setIsEmailLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <LinearGradient
        colors={["#0f0f0f", "#0d1a12", "#0f0f0f"]}
        style={{ flex: 1 }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 32 }}>
            {/* Logo */}
            <View style={{ alignItems: "center", marginBottom: 64 }}>
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 24,
                  backgroundColor: Colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 20,
                  shadowColor: Colors.primary,
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.4,
                  shadowRadius: 20,
                }}
              >
                <Text style={{ fontSize: 40 }}>🎰</Text>
              </View>
              <Text
                style={{
                  fontSize: 48,
                  fontWeight: "900",
                  color: Colors.text.primary,
                  letterSpacing: -2,
                }}
              >
                Tilt
              </Text>
              <Text
                style={{
                  fontSize: 16,
                  color: Colors.text.secondary,
                  marginTop: 8,
                  textAlign: "center",
                }}
              >
                Bet on anything with your crew
              </Text>
            </View>

            {/* Features */}
            <View style={{ marginBottom: 48, gap: 12 }}>
              {[
                { icon: "people", text: "Create circles with friends" },
                { icon: "flash", text: "Bet chips on anything" },
                { icon: "sparkles", text: "AI-powered bet suggestions" },
              ].map((item) => (
                <View
                  key={item.text}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: `${Colors.primary}20`,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name={item.icon as any} size={18} color={Colors.primary} />
                  </View>
                  <Text style={{ color: Colors.text.secondary, fontSize: 15 }}>
                    {item.text}
                  </Text>
                </View>
              ))}
            </View>

            {/* Auth buttons */}
            <View style={{ gap: 12 }}>
              {showEmailInput ? (
                <View style={{ gap: 12 }}>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="your@email.com"
                    placeholderTextColor={Colors.text.muted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoFocus
                    style={{
                      backgroundColor: Colors.surface,
                      borderColor: Colors.border,
                      borderWidth: 1,
                      borderRadius: 14,
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      color: Colors.text.primary,
                      fontSize: 16,
                    }}
                  />
                  <TouchableOpacity
                    onPress={loginWithEmail}
                    disabled={isEmailLoading}
                    style={{
                      backgroundColor: Colors.primary,
                      borderRadius: 14,
                      paddingVertical: 16,
                      alignItems: "center",
                    }}
                  >
                    {isEmailLoading ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>
                        Continue with Email
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowEmailInput(false)}>
                    <Text style={{ color: Colors.text.muted, textAlign: "center", fontSize: 14 }}>
                      Back
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    onPress={() => setShowEmailInput(true)}
                    style={{
                      backgroundColor: Colors.primary,
                      borderRadius: 14,
                      paddingVertical: 16,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                      shadowColor: Colors.primary,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.3,
                      shadowRadius: 12,
                    }}
                  >
                    <Ionicons name="mail" size={20} color="white" />
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>
                      Continue with Email
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={demoLogin}
                    disabled={isEmailLoading}
                    style={{
                      backgroundColor: Colors.surface,
                      borderColor: Colors.border,
                      borderWidth: 1,
                      borderRadius: 14,
                      paddingVertical: 16,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                    }}
                  >
                    {isEmailLoading ? (
                      <ActivityIndicator color={Colors.text.secondary} />
                    ) : (
                      <>
                        <Text style={{ fontSize: 18 }}>🎮</Text>
                        <Text style={{ color: Colors.text.secondary, fontWeight: "600", fontSize: 16 }}>
                          Try Demo Account
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>

            <Text
              style={{
                color: Colors.text.muted,
                fontSize: 12,
                textAlign: "center",
                marginTop: 32,
              }}
            >
              By continuing, you agree to our Terms of Service
            </Text>
          </View>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}
