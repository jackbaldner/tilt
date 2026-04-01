import {
  View,
  Text,
  FlatList,
  SafeAreaView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { ENDPOINTS } from "@/constants/api";
import { useAuthStore } from "@/stores/authStore";
import { Colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, any>;
  read: boolean;
  createdAt: string;
}

export default function NotificationsScreen() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ notifications: Notification[]; unreadCount: number }>(ENDPOINTS.notifications),
    enabled: !!user,
  });

  const markAllRead = useMutation({
    mutationFn: () => api.patch(ENDPOINTS.notifications, { all: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 20,
          paddingVertical: 16,
        }}
      >
        <View>
          <Text style={{ fontSize: 28, fontWeight: "900", color: Colors.text.primary, letterSpacing: -1 }}>
            Notifications
          </Text>
          {unreadCount > 0 && (
            <Text style={{ color: Colors.primary, fontSize: 13, marginTop: 2 }}>
              {unreadCount} unread
            </Text>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={() => markAllRead.mutate()}>
            <Text style={{ color: Colors.primary, fontSize: 14, fontWeight: "600" }}>
              Mark all read
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {notifications.length === 0 && !isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔔</Text>
          <Text style={{ color: Colors.text.secondary, fontSize: 16 }}>
            No notifications yet
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <NotificationItem item={item} />}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />
          }
        />
      )}
    </SafeAreaView>
  );
}

function NotificationItem({ item }: { item: Notification }) {
  const getIcon = () => {
    switch (item.type) {
      case "bet_resolved": return { icon: "checkmark-circle", color: item.title.includes("won") ? Colors.win : Colors.text.muted };
      case "new_bet": return { icon: "flash", color: Colors.primary };
      case "bet_joined": return { icon: "enter", color: Colors.accent };
      case "dispute": return { icon: "alert-circle", color: Colors.loss };
      default: return { icon: "notifications", color: Colors.text.muted };
    }
  };

  const { icon, color } = getIcon();

  return (
    <TouchableOpacity
      onPress={() => {
        if (item.data.betId) router.push(`/bet/${item.data.betId}`);
      }}
      style={{
        backgroundColor: item.read ? Colors.surface : `${Colors.primary}10`,
        borderRadius: 14,
        padding: 16,
        flexDirection: "row",
        gap: 12,
        borderWidth: item.read ? 0 : 1,
        borderColor: item.read ? "transparent" : `${Colors.primary}30`,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: `${color}20`,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: Colors.text.primary, fontWeight: "700", fontSize: 14 }}>
          {item.title}
        </Text>
        <Text style={{ color: Colors.text.secondary, fontSize: 13, marginTop: 2 }}>
          {item.body}
        </Text>
        <Text style={{ color: Colors.text.muted, fontSize: 12, marginTop: 6 }}>
          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
        </Text>
      </View>
      {!item.read && (
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: Colors.primary,
            marginTop: 6,
          }}
        />
      )}
    </TouchableOpacity>
  );
}
