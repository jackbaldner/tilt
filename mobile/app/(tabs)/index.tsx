import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { ENDPOINTS } from "@/constants/api";
import { useAuthStore } from "@/stores/authStore";
import { Colors } from "@/constants/colors";
import { CircleCard } from "@/components/circle/CircleCard";
import { CreateCircleModal } from "@/components/circle/CreateCircleModal";
import { useState } from "react";

export default function CirclesScreen() {
  const user = useAuthStore((s) => s.user);
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["circles"],
    queryFn: () => api.get<{ circles: any[] }>(ENDPOINTS.circles),
    enabled: !!user,
  });

  const circles = data?.circles ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Header */}
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
            Circles
          </Text>
          <Text style={{ color: Colors.text.muted, fontSize: 13, marginTop: 2 }}>
            {user?.chips?.toLocaleString() ?? 0} chips
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowCreate(true)}
          style={{
            backgroundColor: Colors.primary,
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Ionicons name="add" size={18} color="white" />
          <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>New</Text>
        </TouchableOpacity>
      </View>

      {circles.length === 0 && !isLoading ? (
        <EmptyCircles onCreate={() => setShowCreate(true)} />
      ) : (
        <FlatList
          data={circles}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CircleCard
              circle={item}
              onPress={() => router.push(`/circle/${item.id}`)}
            />
          )}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.primary}
            />
          }
        />
      )}

      <CreateCircleModal visible={showCreate} onClose={() => setShowCreate(false)} />
    </SafeAreaView>
  );
}

function EmptyCircles({ onCreate }: { onCreate: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
      <Text style={{ fontSize: 64, marginBottom: 20 }}>🎯</Text>
      <Text
        style={{
          fontSize: 22,
          fontWeight: "800",
          color: Colors.text.primary,
          textAlign: "center",
          marginBottom: 10,
        }}
      >
        No circles yet
      </Text>
      <Text
        style={{
          color: Colors.text.muted,
          textAlign: "center",
          fontSize: 15,
          lineHeight: 22,
          marginBottom: 32,
        }}
      >
        Create a circle and invite your friends to start betting on anything
      </Text>
      <TouchableOpacity
        onPress={onCreate}
        style={{
          backgroundColor: Colors.primary,
          borderRadius: 14,
          paddingHorizontal: 32,
          paddingVertical: 16,
        }}
      >
        <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>
          Create Your First Circle
        </Text>
      </TouchableOpacity>
    </View>
  );
}
