import { View, Text, TouchableOpacity } from "react-native";
import { Colors, resolutionColors, betTypeColors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { formatDistanceToNow } from "date-fns";

interface BetCardProps {
  bet: {
    id: string;
    title: string;
    description?: string;
    type: string;
    stake: number;
    totalPot: number;
    resolution: string;
    resolvedOption?: string;
    createdAt: string;
    resolveAt?: string;
    proposer?: { id: string; name?: string };
    sides?: Array<{ userId: string; option: string; user?: { name?: string } }>;
    _count?: { comments: number };
  };
  currentUserId?: string;
  onPress: () => void;
}

export function BetCard({ bet, currentUserId, onPress }: BetCardProps) {
  const statusColor = resolutionColors[bet.resolution] ?? Colors.text.muted;
  const typeColor = betTypeColors[bet.type] ?? Colors.accent;
  const participantCount = bet.sides?.length ?? 0;

  const myEntry = bet.sides?.find((s) => s.userId === currentUserId);
  const isResolved = bet.resolution === "resolved";
  const isWin = isResolved && myEntry && myEntry.option === bet.resolvedOption;
  const isLoss = isResolved && myEntry && myEntry.option !== bet.resolvedOption;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: Colors.surface,
        borderRadius: 20,
        padding: 18,
        borderWidth: 1,
        borderColor: isWin
          ? `${Colors.win}40`
          : isLoss
          ? `${Colors.loss}25`
          : Colors.border,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      }}
      activeOpacity={0.85}
    >
      {/* Status + Type badges */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <View
          style={{
            backgroundColor: `${statusColor}20`,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <Text style={{ color: statusColor, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>
            {bet.resolution}
          </Text>
        </View>
        <View
          style={{
            backgroundColor: `${typeColor}20`,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <Text style={{ color: typeColor, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>
            {bet.type.replace(/_/g, " ")}
          </Text>
        </View>
        {myEntry && (
          <View
            style={{
              backgroundColor: isWin
                ? `${Colors.win}25`
                : isLoss
                ? `${Colors.loss}20`
                : `${Colors.primary}20`,
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <Text
              style={{
                color: isWin ? Colors.win : isLoss ? Colors.loss : Colors.primary,
                fontSize: 11,
                fontWeight: "700",
              }}
            >
              {isWin ? "WON" : isLoss ? "LOST" : `YOU: ${myEntry.option}`}
            </Text>
          </View>
        )}
      </View>

      {/* Title */}
      <Text
        style={{
          fontSize: 17,
          fontWeight: "800",
          color: Colors.text.primary,
          marginBottom: 4,
          letterSpacing: -0.3,
        }}
        numberOfLines={2}
      >
        {bet.title}
      </Text>

      {bet.description && (
        <Text
          style={{ color: Colors.text.muted, fontSize: 13, marginBottom: 10 }}
          numberOfLines={1}
        >
          {bet.description}
        </Text>
      )}

      {/* Resolved option */}
      {bet.resolvedOption && (
        <View
          style={{
            backgroundColor: `${Colors.win}15`,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 6,
            marginBottom: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Text style={{ fontSize: 14 }}>🏆</Text>
          <Text style={{ color: Colors.win, fontWeight: "700", fontSize: 13 }}>
            {bet.resolvedOption}
          </Text>
        </View>
      )}

      {/* Footer */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          gap: 16,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={{ fontSize: 14 }}>🪙</Text>
          <Text style={{ color: Colors.gold, fontWeight: "700", fontSize: 13 }}>
            {bet.totalPot} pot
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="people" size={14} color={Colors.text.muted} />
          <Text style={{ color: Colors.text.muted, fontSize: 13 }}>
            {participantCount}
          </Text>
        </View>
        {(bet._count?.comments ?? 0) > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="chatbubble" size={13} color={Colors.text.muted} />
            <Text style={{ color: Colors.text.muted, fontSize: 13 }}>
              {bet._count!.comments}
            </Text>
          </View>
        )}
        <Text style={{ color: Colors.text.muted, fontSize: 12, marginLeft: "auto" }}>
          {formatDistanceToNow(new Date(bet.createdAt), { addSuffix: true })}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
