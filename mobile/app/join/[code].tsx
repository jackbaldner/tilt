import { useEffect, useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { api } from "@/lib/api";
import { ENDPOINTS } from "@/constants/api";
import { Colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";

export default function JoinCircleScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [circle, setCircle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const fetchCircle = async () => {
      try {
        const data = await api.get<{ circle: any }>(ENDPOINTS.joinCircle(code!));
        setCircle(data.circle);
      } catch {
        Toast.show({ type: "error", text1: "Invalid invite code" });
      } finally {
        setLoading(false);
      }
    };
    if (code) fetchCircle();
  }, [code]);

  const joinCircle = async () => {
    setJoining(true);
    try {
      const result = await api.post<{ circle: any; joined?: boolean; alreadyMember?: boolean }>(
        ENDPOINTS.joinCircle(code!)
      );
      if (result.alreadyMember) {
        Toast.show({ type: "info", text1: "Already a member!" });
      } else {
        Toast.show({ type: "success", text1: `Joined ${result.circle.name}! 🎉` });
      }
      router.replace(`/circle/${result.circle.id}`);
    } catch {
      Toast.show({ type: "error", text1: "Failed to join circle" });
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (!circle) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
          <Ionicons name="close-circle" size={64} color={Colors.loss} />
          <Text style={{ color: Colors.text.primary, fontSize: 20, fontWeight: "800", marginTop: 16 }}>
            Invalid Invite
          </Text>
          <Text style={{ color: Colors.text.muted, marginTop: 8, textAlign: "center" }}>
            This invite link is invalid or has expired.
          </Text>
          <TouchableOpacity onPress={() => router.replace("/(tabs)")} style={{ marginTop: 24 }}>
            <Text style={{ color: Colors.primary, fontSize: 16 }}>Go Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
        <Text style={{ fontSize: 72, marginBottom: 20 }}>{circle.emoji ?? "🎯"}</Text>
        <Text
          style={{
            fontSize: 28,
            fontWeight: "900",
            color: Colors.text.primary,
            textAlign: "center",
            letterSpacing: -0.5,
          }}
        >
          {circle.name}
        </Text>
        {circle.description && (
          <Text
            style={{ color: Colors.text.secondary, marginTop: 8, textAlign: "center", fontSize: 15 }}
          >
            {circle.description}
          </Text>
        )}

        <View style={{ flexDirection: "row", gap: 24, marginTop: 24, marginBottom: 40 }}>
          <View style={{ alignItems: "center" }}>
            <Text style={{ color: Colors.primary, fontWeight: "900", fontSize: 22 }}>
              {circle.memberCount}
            </Text>
            <Text style={{ color: Colors.text.muted, fontSize: 13 }}>members</Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={{ color: Colors.gold, fontWeight: "900", fontSize: 22 }}>
              {circle.betCount}
            </Text>
            <Text style={{ color: Colors.text.muted, fontSize: 13 }}>bets</Text>
          </View>
        </View>

        <Text style={{ color: Colors.text.secondary, marginBottom: 24, fontSize: 14 }}>
          Owned by {circle.owner?.name ?? "Unknown"}
        </Text>

        <TouchableOpacity
          onPress={joinCircle}
          disabled={joining}
          style={{
            backgroundColor: Colors.primary,
            borderRadius: 16,
            paddingHorizontal: 48,
            paddingVertical: 18,
            shadowColor: Colors.primary,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.4,
            shadowRadius: 16,
          }}
        >
          {joining ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={{ color: "white", fontWeight: "900", fontSize: 18 }}>
              Join Circle 🎰
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace("/(tabs)")} style={{ marginTop: 16 }}>
          <Text style={{ color: Colors.text.muted, fontSize: 15 }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
