import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { ENDPOINTS } from "@/constants/api";
import { useAuthStore } from "@/stores/authStore";
import { Colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";

interface UserStats {
  totalBets: number;
  wonBets: number;
  lostBets: number;
  totalChipsWon: number;
  totalChipsLost: number;
  biggestWin: number;
  currentStreak: number;
  longestStreak: number;
}

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();

  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<{ user: any }>(ENDPOINTS.me),
    enabled: !!user,
  });

  const stats: UserStats = data?.user?.stats ?? {
    totalBets: 0,
    wonBets: 0,
    lostBets: 0,
    totalChipsWon: 0,
    totalChipsLost: 0,
    biggestWin: 0,
    currentStreak: 0,
    longestStreak: 0,
  };

  const winRate =
    stats.totalBets > 0 ? Math.round((stats.wonBets / stats.totalBets) * 100) : 0;

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: () => {
          logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* Header */}
        <View style={{ alignItems: "center", marginBottom: 32 }}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: Colors.surface,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 12,
              borderWidth: 2,
              borderColor: Colors.primary,
              overflow: "hidden",
            }}
          >
            {user?.image ? (
              <Image source={{ uri: user.image }} style={{ width: 80, height: 80 }} />
            ) : (
              <Text style={{ fontSize: 32 }}>
                {user?.name?.[0]?.toUpperCase() ?? "?"}
              </Text>
            )}
          </View>
          <Text style={{ fontSize: 22, fontWeight: "800", color: Colors.text.primary }}>
            {user?.name ?? "Player"}
          </Text>
          <Text style={{ color: Colors.text.muted, fontSize: 14, marginTop: 4 }}>
            {user?.email}
          </Text>

          {/* Chip balance */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginTop: 16,
              backgroundColor: `${Colors.primary}20`,
              borderRadius: 20,
              paddingHorizontal: 20,
              paddingVertical: 10,
            }}
          >
            <Text style={{ fontSize: 20 }}>🪙</Text>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "900",
                color: Colors.primary,
                letterSpacing: -0.5,
              }}
            >
              {(user?.chips ?? 0).toLocaleString()} chips
            </Text>
          </View>
        </View>

        {/* Stats grid */}
        <View style={{ marginBottom: 24 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "800",
              color: Colors.text.primary,
              marginBottom: 14,
              letterSpacing: -0.5,
            }}
          >
            Your Stats
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <StatCard label="Win Rate" value={`${winRate}%`} color={Colors.win} />
            <StatCard label="Total Bets" value={stats.totalBets.toString()} color={Colors.primary} />
            <StatCard label="Won" value={stats.wonBets.toString()} color={Colors.win} />
            <StatCard label="Lost" value={stats.lostBets.toString()} color={Colors.loss} />
            <StatCard
              label="Chips Won"
              value={stats.totalChipsWon.toLocaleString()}
              color={Colors.win}
            />
            <StatCard
              label="Biggest Win"
              value={stats.biggestWin.toLocaleString()}
              color={Colors.gold}
            />
            <StatCard
              label="Current Streak"
              value={`${stats.currentStreak}🔥`}
              color={Colors.gold}
            />
            <StatCard
              label="Longest Streak"
              value={stats.longestStreak.toString()}
              color={Colors.accent}
            />
          </View>
        </View>

        {/* Actions */}
        <View style={{ gap: 10 }}>
          <TouchableOpacity
            style={{
              backgroundColor: Colors.surface,
              borderRadius: 14,
              padding: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Ionicons name="person-outline" size={20} color={Colors.text.secondary} />
            <Text style={{ color: Colors.text.primary, fontSize: 15, fontWeight: "600", flex: 1 }}>
              Edit Profile
            </Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.text.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleLogout}
            style={{
              backgroundColor: `${Colors.loss}15`,
              borderRadius: 14,
              padding: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Ionicons name="log-out-outline" size={20} color={Colors.loss} />
            <Text style={{ color: Colors.loss, fontSize: 15, fontWeight: "600" }}>
              Log Out
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View
      style={{
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 14,
        width: "47%",
        borderWidth: 1,
        borderColor: Colors.border,
      }}
    >
      <Text style={{ color, fontSize: 22, fontWeight: "900", letterSpacing: -0.5 }}>
        {value}
      </Text>
      <Text style={{ color: Colors.text.muted, fontSize: 12, marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}
