import {
  View,
  Text,
  FlatList,
  SafeAreaView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { ENDPOINTS } from "@/constants/api";
import { useAuthStore } from "@/stores/authStore";
import { Colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { formatDistanceToNow } from "date-fns";

const ACTIVITY_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  bet_created: { icon: "flash", color: Colors.primary, label: "New bet" },
  bet_joined: { icon: "enter", color: Colors.accent, label: "Joined" },
  bet_resolved: { icon: "checkmark-circle", color: Colors.win, label: "Resolved" },
  comment: { icon: "chatbubble", color: "#6b7280", label: "Comment" },
  member_joined: { icon: "person-add", color: Colors.gold, label: "Joined circle" },
  circle_created: { icon: "people", color: Colors.primary, label: "Circle created" },
};

interface ActivityItem {
  id: string;
  circleId: string;
  type: string;
  data: Record<string, any>;
  createdAt: string;
  bet?: { id: string; title: string };
  circle?: { id: string; name: string };
}

export default function FeedScreen() {
  const user = useAuthStore((s) => s.user);

  // We'll aggregate activity from all circles
  const { data: circlesData } = useQuery({
    queryKey: ["circles"],
    queryFn: () => api.get<{ circles: any[] }>(ENDPOINTS.circles),
    enabled: !!user,
  });

  const circles = circlesData?.circles ?? [];
  const firstCircleId = circles[0]?.id;

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["activity", firstCircleId],
    queryFn: () =>
      api.get<{ activities: ActivityItem[] }>(ENDPOINTS.circleActivity(firstCircleId!), {
        limit: 50,
      }),
    enabled: !!firstCircleId,
  });

  const activities = data?.activities ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
        <Text style={{ fontSize: 28, fontWeight: "900", color: Colors.text.primary, letterSpacing: -1 }}>
          Feed
        </Text>
      </View>

      {activities.length === 0 && !isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>⚡</Text>
          <Text style={{ color: Colors.text.secondary, fontSize: 16 }}>
            No activity yet
          </Text>
          <Text style={{ color: Colors.text.muted, fontSize: 14, marginTop: 6 }}>
            Create a circle and start betting!
          </Text>
        </View>
      ) : (
        <FlatList
          data={activities}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ActivityItem item={item} />}
          contentContainerStyle={{ padding: 16, gap: 2 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

function ActivityItem({ item }: { item: ActivityItem }) {
  const meta = ACTIVITY_ICONS[item.type] ?? {
    icon: "ellipse",
    color: Colors.text.muted,
    label: item.type,
  };

  const getMessage = () => {
    const d = item.data;
    switch (item.type) {
      case "bet_created":
        return `New bet: "${d.betTitle}" — ${d.stake} chips`;
      case "bet_joined":
        return `Joined "${d.betTitle}" with ${d.option}`;
      case "bet_resolved":
        return `"${d.betTitle}" resolved → ${d.winningOption} wins! ${d.payoutPerWinner} chips each`;
      case "comment":
        return `On "${d.betTitle}": ${d.text}`;
      case "member_joined":
        return `${d.userName ?? "Someone"} joined the circle`;
      case "circle_created":
        return `Circle "${d.circleName}" created`;
      default:
        return JSON.stringify(d);
    }
  };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: `${meta.color}20`,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 2,
        }}
      >
        <Ionicons name={meta.icon as any} size={18} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: Colors.text.primary, fontSize: 14, lineHeight: 20 }}>
          {getMessage()}
        </Text>
        {item.bet && (
          <TouchableOpacity
            onPress={() => router.push(`/bet/${item.bet!.id}`)}
            style={{ marginTop: 4 }}
          >
            <Text style={{ color: Colors.primary, fontSize: 12 }}>View bet →</Text>
          </TouchableOpacity>
        )}
        <Text style={{ color: Colors.text.muted, fontSize: 12, marginTop: 4 }}>
          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
        </Text>
      </View>
    </View>
  );
}
