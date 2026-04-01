import { View, Text, TouchableOpacity } from "react-native";
import { Colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";

interface CircleCardProps {
  circle: {
    id: string;
    name: string;
    emoji: string;
    description?: string;
    members: Array<{ userId: string; chips: number; user: { id: string; name?: string } }>;
    _count?: { bets: number };
  };
  onPress: () => void;
}

export function CircleCard({ circle, onPress }: CircleCardProps) {
  const myEntry = circle.members[0]; // Already sorted by chips
  const totalChips = circle.members.reduce((sum, m) => sum + m.chips, 0);
  const memberCount = circle.members.length;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: Colors.surface,
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: Colors.border,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      }}
      activeOpacity={0.85}
    >
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            backgroundColor: Colors.card,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 26 }}>{circle.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "800",
              color: Colors.text.primary,
              letterSpacing: -0.3,
            }}
            numberOfLines={1}
          >
            {circle.name}
          </Text>
          {circle.description && (
            <Text
              style={{ color: Colors.text.muted, fontSize: 13, marginTop: 2 }}
              numberOfLines={1}
            >
              {circle.description}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.text.muted} />
      </View>

      {/* Member avatars */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 14 }}>
        {circle.members.slice(0, 5).map((m, i) => (
          <View
            key={m.userId}
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: Colors.primary,
              alignItems: "center",
              justifyContent: "center",
              marginLeft: i > 0 ? -8 : 0,
              borderWidth: 2,
              borderColor: Colors.surface,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: "white" }}>
              {m.user?.name?.[0]?.toUpperCase() ?? "?"}
            </Text>
          </View>
        ))}
        {memberCount > 5 && (
          <View
            style={{
              marginLeft: -8,
              backgroundColor: Colors.border,
              borderRadius: 14,
              width: 28,
              height: 28,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 2,
              borderColor: Colors.surface,
            }}
          >
            <Text style={{ fontSize: 10, color: Colors.text.muted, fontWeight: "700" }}>
              +{memberCount - 5}
            </Text>
          </View>
        )}
        <Text style={{ color: Colors.text.muted, fontSize: 12, marginLeft: 8 }}>
          {memberCount} {memberCount === 1 ? "member" : "members"}
        </Text>
      </View>

      {/* Stats row */}
      <View
        style={{
          flexDirection: "row",
          gap: 16,
          paddingTop: 14,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="flash" size={14} color={Colors.primary} />
          <Text style={{ color: Colors.text.secondary, fontSize: 13 }}>
            {circle._count?.bets ?? 0} bets
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="trophy" size={14} color={Colors.gold} />
          <Text style={{ color: Colors.text.secondary, fontSize: 13 }}>
            {Math.abs(totalChips).toLocaleString()} chips in play
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
