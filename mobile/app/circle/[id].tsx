import { useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Share,
  Alert,
} from "react-native";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { ENDPOINTS } from "@/constants/api";
import { useAuthStore } from "@/stores/authStore";
import { Colors, resolutionColors } from "@/constants/colors";
import { BetCard } from "@/components/bet/BetCard";
import Toast from "react-native-toast-message";
import { formatDistanceToNow } from "date-fns";

type TabType = "bets" | "leaderboard" | "activity";

export default function CircleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabType>("bets");

  const { data: circleData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["circle", id],
    queryFn: () => api.get<{ circle: any }>(ENDPOINTS.circle(id!)),
    enabled: !!id,
  });

  const { data: betsData, refetch: refetchBets } = useQuery({
    queryKey: ["circle-bets", id],
    queryFn: () => api.get<{ bets: any[] }>(ENDPOINTS.circleBets(id!)),
    enabled: !!id,
  });

  const { data: leaderboardData } = useQuery({
    queryKey: ["leaderboard", id],
    queryFn: () => api.get<{ leaderboard: any[] }>(ENDPOINTS.circleLeaderboard(id!)),
    enabled: !!id && tab === "leaderboard",
  });

  const { data: activityData } = useQuery({
    queryKey: ["activity", id],
    queryFn: () => api.get<{ activities: any[] }>(ENDPOINTS.circleActivity(id!)),
    enabled: !!id && tab === "activity",
  });

  const circle = circleData?.circle;
  const bets = betsData?.bets ?? [];
  const leaderboard = leaderboardData?.leaderboard ?? [];
  const activities = activityData?.activities ?? [];

  const shareInvite = async () => {
    try {
      const inviteData = await api.get<{ inviteCode: string; inviteUrl: string }>(
        ENDPOINTS.circleInvite(id!)
      );
      await Share.share({
        message: `Join my Tilt circle "${circle?.name}"! Use code: ${inviteData.inviteCode}\n${inviteData.inviteUrl}`,
        url: inviteData.inviteUrl,
        title: `Join ${circle?.name} on Tilt`,
      });
    } catch (error) {
      Toast.show({ type: "error", text1: "Could not share invite" });
    }
  };

  if (!circle && !isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
        <Text style={{ color: Colors.text.primary, padding: 20 }}>Circle not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
            <Ionicons name="chevron-back" size={26} color={Colors.text.primary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 22 }}>{circle?.emoji ?? "🎯"}</Text>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "800",
                  color: Colors.text.primary,
                  letterSpacing: -0.5,
                }}
                numberOfLines={1}
              >
                {circle?.name ?? "..."}
              </Text>
            </View>
            <Text style={{ color: Colors.text.muted, fontSize: 13, marginTop: 2 }}>
              {circle?.members?.length ?? 0} members
            </Text>
          </View>
          <TouchableOpacity
            onPress={shareInvite}
            style={{
              backgroundColor: Colors.surface,
              borderRadius: 10,
              padding: 10,
              marginRight: 8,
            }}
          >
            <Ionicons name="person-add-outline" size={20} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push(`/bet/create?circleId=${id}`)}
            style={{
              backgroundColor: Colors.primary,
              borderRadius: 10,
              padding: 10,
            }}
          >
            <Ionicons name="add" size={20} color="white" />
          </TouchableOpacity>
        </View>

        {/* Tab bar */}
        <View
          style={{
            flexDirection: "row",
            backgroundColor: Colors.surface,
            borderRadius: 12,
            padding: 4,
          }}
        >
          {(["bets", "leaderboard", "activity"] as TabType[]).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: tab === t ? Colors.primary : "transparent",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: tab === t ? "white" : Colors.text.muted,
                  textTransform: "capitalize",
                }}
              >
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Content */}
      {tab === "bets" && (
        <FlatList
          data={bets}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <BetCard bet={item} onPress={() => router.push(`/bet/${item.id}`)} />
          )}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetchBets} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 40 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🎲</Text>
              <Text style={{ color: Colors.text.muted, fontSize: 15, textAlign: "center" }}>
                No bets yet. Create one!
              </Text>
            </View>
          }
        />
      )}

      {tab === "leaderboard" && (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={{ gap: 8 }}>
            {leaderboard.map((entry, index) => (
              <LeaderboardRow key={entry.userId} entry={entry} rank={index + 1} currentUserId={user?.id} />
            ))}
          </View>
        </ScrollView>
      )}

      {tab === "activity" && (
        <FlatList
          data={activities}
          keyExtractor={(item: any) => item.id}
          renderItem={({ item }) => <ActivityRow item={item} />}
          contentContainerStyle={{ padding: 16, gap: 2 }}
        />
      )}
    </SafeAreaView>
  );
}

function LeaderboardRow({
  entry,
  rank,
  currentUserId,
}: {
  entry: any;
  rank: number;
  currentUserId?: string;
}) {
  const isCurrentUser = entry.userId === currentUserId;
  const rankEmoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;

  return (
    <View
      style={{
        backgroundColor: isCurrentUser ? `${Colors.primary}15` : Colors.surface,
        borderRadius: 14,
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderWidth: isCurrentUser ? 1 : 0,
        borderColor: isCurrentUser ? `${Colors.primary}40` : "transparent",
      }}
    >
      <Text style={{ fontSize: 20, width: 32, textAlign: "center" }}>{rankEmoji}</Text>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: Colors.border,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 18 }}>
          {entry.user?.name?.[0]?.toUpperCase() ?? "?"}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: Colors.text.primary, fontWeight: "700", fontSize: 15 }}>
          {entry.user?.name ?? "Unknown"}
          {isCurrentUser && (
            <Text style={{ color: Colors.primary }}> (you)</Text>
          )}
        </Text>
        <Text style={{ color: Colors.text.muted, fontSize: 12, marginTop: 2 }}>
          {entry.user?.stats?.wonBets ?? 0}W · {entry.user?.stats?.lostBets ?? 0}L
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text
          style={{
            color: entry.chips >= 0 ? Colors.win : Colors.loss,
            fontWeight: "900",
            fontSize: 16,
            letterSpacing: -0.5,
          }}
        >
          {entry.chips >= 0 ? "+" : ""}
          {entry.chips.toLocaleString()}
        </Text>
        <Text style={{ color: Colors.text.muted, fontSize: 11 }}>chips</Text>
      </View>
    </View>
  );
}

function ActivityRow({ item }: { item: any }) {
  const ICONS: Record<string, { icon: string; color: string }> = {
    bet_created: { icon: "flash", color: Colors.primary },
    bet_joined: { icon: "enter", color: Colors.accent },
    bet_resolved: { icon: "checkmark-circle", color: Colors.win },
    comment: { icon: "chatbubble", color: "#6b7280" },
    member_joined: { icon: "person-add", color: Colors.gold },
  };

  const meta = ICONS[item.type] ?? { icon: "ellipse", color: Colors.text.muted };

  const getMessage = () => {
    const d = item.data;
    switch (item.type) {
      case "bet_created": return `New bet: "${d.betTitle}"`;
      case "bet_joined": return `Joined "${d.betTitle}" → ${d.option}`;
      case "bet_resolved": return `"${d.betTitle}" → ${d.winningOption} wins`;
      case "comment": return `On "${d.betTitle}": "${d.text}"`;
      case "member_joined": return `${d.userName ?? "Someone"} joined`;
      default: return item.type;
    }
  };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: `${meta.color}20`,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 2,
        }}
      >
        <Ionicons name={meta.icon as any} size={15} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: Colors.text.primary, fontSize: 14 }}>{getMessage()}</Text>
        <Text style={{ color: Colors.text.muted, fontSize: 11, marginTop: 3 }}>
          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
        </Text>
      </View>
      {item.bet && (
        <TouchableOpacity onPress={() => router.push(`/bet/${item.bet.id}`)}>
          <Ionicons name="chevron-forward" size={16} color={Colors.text.muted} />
        </TouchableOpacity>
      )}
    </View>
  );
}
