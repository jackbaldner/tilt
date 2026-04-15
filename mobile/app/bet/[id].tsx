import { useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { ENDPOINTS } from "@/constants/api";
import { useAuthStore } from "@/stores/authStore";
import { Colors, resolutionColors, betTypeColors } from "@/constants/colors";
import { formatDistanceToNow, format } from "date-fns";
import Toast from "react-native-toast-message";
import { isPrivateCircleName } from "@/lib/circleDisplay";

export default function BetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const [resolving, setResolving] = useState(false);
  const [aiResolving, setAiResolving] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["bet", id],
    queryFn: () => api.get<{ bet: any }>(ENDPOINTS.bet(id!)),
    enabled: !!id,
  });

  const bet = data?.bet;
  const options = bet?.options ?? [];
  const myEntry = bet?.sides?.find((s: any) => s.userId === user?.id);
  const canResolve = bet?.proposerId === user?.id || bet?.circle?.ownerId === user?.id;
  const is1v1 = bet ? isPrivateCircleName(bet.circle?.name) : false;
  const sidesByOption: Record<string, any> = {};
  if (bet?.sides) {
    for (const s of bet.sides) {
      sidesByOption[s.option] = s;
    }
  }

  // Join bet mutation
  const joinMutation = useMutation({
    mutationFn: (option: string) =>
      api.post(ENDPOINTS.betSides(id!), { option }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["bet", id] });
      queryClient.invalidateQueries({ queryKey: ["circles"] });
      // Update chip count
      if (user) setUser({ ...user, chips: user.chips - bet.stake });
      Toast.show({ type: "success", text1: "Bet placed! 🎉", text2: `You picked: ${data.side?.option}` });
    },
    onError: (err: any) => {
      Toast.show({ type: "error", text1: err?.response?.data?.error ?? "Failed to join" });
    },
  });

  // Comment mutation
  const commentMutation = useMutation({
    mutationFn: (text: string) => api.post(ENDPOINTS.betComments(id!), { text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bet", id] });
      setComment("");
    },
  });

  // Resolve mutation
  const resolveMutation = useMutation({
    mutationFn: ({ winningOption, note }: { winningOption: string; note?: string }) =>
      api.post(ENDPOINTS.betResolve(id!), { winningOption, resolutionNote: note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bet", id] });
      queryClient.invalidateQueries({ queryKey: ["circles"] });
      Toast.show({ type: "success", text1: "Bet resolved! Chips distributed 🏆" });
      setResolving(false);
    },
    onError: (err: any) => {
      Toast.show({ type: "error", text1: err?.response?.data?.error ?? "Resolution failed" });
    },
  });

  const handleAiResolve = async () => {
    setAiResolving(true);
    try {
      const result = await api.post<{
        canResolve: boolean;
        winningOption: string | null;
        confidence: string;
        reasoning: string;
      }>(ENDPOINTS.resolveBet, { betId: id });

      if (result.canResolve && result.winningOption) {
        Alert.alert(
          "AI Resolution",
          `AI suggests: "${result.winningOption}" (${result.confidence} confidence)\n\nReason: ${result.reasoning}\n\nAccept this resolution?`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Accept",
              onPress: () =>
                resolveMutation.mutate({
                  winningOption: result.winningOption!,
                  note: `AI resolved: ${result.reasoning}`,
                }),
            },
          ]
        );
      } else {
        Alert.alert(
          "AI Cannot Resolve",
          result.reasoning,
          [{ text: "OK" }]
        );
      }
    } catch {
      Toast.show({ type: "error", text1: "AI resolution failed" });
    } finally {
      setAiResolving(false);
    }
  };

  const pickSide = (option: string) => {
    if (myEntry) return;
    if (!user || user.chips < (bet?.stake ?? 0)) {
      Toast.show({ type: "error", text1: "Not enough chips!" });
      return;
    }
    Alert.alert(
      "Place Bet",
      `Bet ${bet?.stake} chips on "${option}"?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Place Bet 🎰", onPress: () => joinMutation.mutate(option) },
      ]
    );
  };

  const handleResolve = (option: string) => {
    Alert.alert(
      "Resolve Bet",
      `Mark "${option}" as the winner?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Resolve",
          onPress: () => resolveMutation.mutate({ winningOption: option }),
        },
      ]
    );
  };

  if (isLoading || !bet) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={Colors.primary} />
      </SafeAreaView>
    );
  }

  const statusColor = resolutionColors[bet.resolution] ?? Colors.text.muted;
  const pot = bet.totalPot ?? 0;
  const sideCounts: Record<string, number> = {};
  for (const s of bet.sides ?? []) {
    sideCounts[s.option] = (sideCounts[s.option] ?? 0) + 1;
  }
  const totalParticipants = bet.sides?.length ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Back + Circle */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20, gap: 8 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={26} color={Colors.text.primary} />
          </TouchableOpacity>
          {bet.circle && !isPrivateCircleName(bet.circle.name) && (
            <TouchableOpacity
              onPress={() => router.push(`/circle/${bet.circle.id}`)}
              style={{
                backgroundColor: Colors.surface,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text style={{ color: Colors.text.secondary, fontSize: 13 }}>
                {bet.circle.emoji} {bet.circle.name}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Bet header */}
        <View
          style={{
            backgroundColor: Colors.surface,
            borderRadius: 20,
            padding: 20,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: Colors.border,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <View
              style={{
                backgroundColor: `${statusColor}20`,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text style={{ color: statusColor, fontSize: 12, fontWeight: "700", textTransform: "uppercase" }}>
                {bet.resolution}
              </Text>
            </View>
            <View
              style={{
                backgroundColor: `${betTypeColors[bet.type] ?? Colors.accent}20`,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text
                style={{
                  color: betTypeColors[bet.type] ?? Colors.accent,
                  fontSize: 12,
                  fontWeight: "700",
                  textTransform: "uppercase",
                }}
              >
                {bet.type.replace("_", " ")}
              </Text>
            </View>
          </View>

          <Text
            style={{
              fontSize: 22,
              fontWeight: "900",
              color: Colors.text.primary,
              marginBottom: 8,
              letterSpacing: -0.5,
            }}
          >
            {bet.title}
          </Text>

          {bet.description && (
            <Text style={{ color: Colors.text.secondary, fontSize: 15, lineHeight: 22, marginBottom: 12 }}>
              {bet.description}
            </Text>
          )}

          <View style={{ flexDirection: "row", gap: 20 }}>
            <View>
              <Text style={{ color: Colors.text.muted, fontSize: 12 }}>Stake</Text>
              <Text style={{ color: Colors.primary, fontWeight: "800", fontSize: 16 }}>
                {bet.stake} chips
              </Text>
            </View>
            <View>
              <Text style={{ color: Colors.text.muted, fontSize: 12 }}>Pot</Text>
              <Text style={{ color: Colors.gold, fontWeight: "800", fontSize: 16 }}>
                {pot} chips
              </Text>
            </View>
            <View>
              <Text style={{ color: Colors.text.muted, fontSize: 12 }}>Players</Text>
              <Text style={{ color: Colors.text.primary, fontWeight: "800", fontSize: 16 }}>
                {totalParticipants}
              </Text>
            </View>
          </View>

          {bet.resolveAt && (
            <Text style={{ color: Colors.text.muted, fontSize: 13, marginTop: 12 }}>
              Resolves {format(new Date(bet.resolveAt), "MMM d, yyyy h:mma")}
            </Text>
          )}

          {bet.resolutionNote && (
            <View
              style={{
                backgroundColor: `${Colors.win}10`,
                borderRadius: 10,
                padding: 12,
                marginTop: 12,
              }}
            >
              <Text style={{ color: Colors.win, fontSize: 13 }}>
                📝 {bet.resolutionNote}
              </Text>
            </View>
          )}
        </View>

        {/* Options */}
        <Text style={{ color: Colors.text.secondary, fontSize: 14, fontWeight: "700", marginBottom: 10 }}>
          {bet.resolution === "pending" ? "Pick your side" : "Results"}
        </Text>
        <View style={{ gap: 10, marginBottom: 20 }}>
          {options.map((option: string) => {
            const count = sideCounts[option] ?? 0;
            const pct = totalParticipants > 0 ? (count / totalParticipants) * 100 : 0;
            const isWinner = bet.resolvedOption === option;
            const myChoice = myEntry?.option === option;

            const takenBySide = sidesByOption[option];
            const takenByOther = takenBySide && takenBySide.userId !== user?.id;
            const lockedInPrivate = is1v1 && !!takenByOther && !myEntry;
            const isMyAvailableSideInPrivate = is1v1 && !takenBySide && !myEntry;
            const isClickable = !myEntry && bet.resolution === "pending" && !lockedInPrivate && !joinMutation.isPending;

            return (
              <TouchableOpacity
                key={option}
                onPress={() => isClickable && pickSide(option)}
                disabled={!isClickable}
                style={{
                  backgroundColor: isWinner
                    ? `${Colors.win}20`
                    : myChoice
                    ? `${Colors.primary}20`
                    : lockedInPrivate
                    ? Colors.border
                    : Colors.surface,
                  borderRadius: 14,
                  padding: 16,
                  borderWidth: 1.5,
                  borderColor: isWinner
                    ? Colors.win
                    : myChoice
                    ? Colors.primary
                    : isMyAvailableSideInPrivate
                    ? Colors.primary
                    : Colors.border,
                  overflow: "hidden",
                  position: "relative",
                  opacity: lockedInPrivate ? 0.5 : 1,
                }}
              >
                {/* Progress bar */}
                <View
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${pct}%`,
                    backgroundColor: isWinner
                      ? `${Colors.win}10`
                      : `${Colors.primary}08`,
                    borderRadius: 14,
                  }}
                />
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {isWinner && <Text style={{ fontSize: 18 }}>🏆</Text>}
                    {myChoice && !isWinner && (
                      <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                    )}
                    <Text
                      style={{
                        color: Colors.text.primary,
                        fontWeight: "700",
                        fontSize: 16,
                      }}
                    >
                      {option}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    {lockedInPrivate ? (
                      <Text style={{ color: Colors.text.muted, fontWeight: "600", fontSize: 13 }}>
                        Taken · {takenBySide.user?.name ?? "Taken"}
                      </Text>
                    ) : isMyAvailableSideInPrivate ? (
                      <Text style={{ color: Colors.primary, fontWeight: "700", fontSize: 13 }}>
                        Your side →
                      </Text>
                    ) : (
                      <>
                        <Text style={{ color: Colors.text.secondary, fontWeight: "600" }}>
                          {count} {count === 1 ? "player" : "players"}
                        </Text>
                        <Text style={{ color: Colors.text.muted, fontSize: 12 }}>
                          {pct.toFixed(0)}%
                        </Text>
                      </>
                    )}
                  </View>
                </View>

                {/* Who picked this */}
                {!is1v1 && bet.sides?.filter((s: any) => s.option === option).length > 0 && (
                  <View style={{ flexDirection: "row", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                    {bet.sides
                      .filter((s: any) => s.option === option)
                      .map((s: any) => (
                        <View
                          key={s.id}
                          style={{
                            backgroundColor: Colors.border,
                            borderRadius: 6,
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                          }}
                        >
                          <Text style={{ color: Colors.text.secondary, fontSize: 12 }}>
                            {s.user?.name ?? "?"}
                          </Text>
                        </View>
                      ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Resolve section (for proposer) */}
        {canResolve && bet.resolution === "pending" && (
          <View
            style={{
              backgroundColor: Colors.surface,
              borderRadius: 16,
              padding: 16,
              marginBottom: 20,
              borderWidth: 1,
              borderColor: Colors.border,
            }}
          >
            <Text style={{ color: Colors.text.secondary, fontWeight: "700", marginBottom: 12 }}>
              Resolve this bet
            </Text>
            <View style={{ gap: 8 }}>
              {options.map((option: string) => (
                <TouchableOpacity
                  key={option}
                  onPress={() => handleResolve(option)}
                  disabled={resolveMutation.isPending}
                  style={{
                    backgroundColor: Colors.card,
                    borderRadius: 10,
                    padding: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ color: Colors.text.primary, fontWeight: "600" }}>
                    {option} wins
                  </Text>
                  <Ionicons name="checkmark-circle-outline" size={20} color={Colors.win} />
                </TouchableOpacity>
              ))}
              {bet.aiResolvable && (
                <TouchableOpacity
                  onPress={handleAiResolve}
                  disabled={aiResolving}
                  style={{
                    backgroundColor: `${Colors.accent}20`,
                    borderRadius: 10,
                    padding: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  {aiResolving ? (
                    <ActivityIndicator color={Colors.accent} size="small" />
                  ) : (
                    <>
                      <Text style={{ fontSize: 18 }}>✨</Text>
                      <Text style={{ color: Colors.accent, fontWeight: "700" }}>
                        Ask AI to Resolve
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Proposer info */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <Text style={{ color: Colors.text.muted, fontSize: 13 }}>
            Proposed by {bet.proposer?.name ?? "Unknown"} ·{" "}
            {formatDistanceToNow(new Date(bet.createdAt), { addSuffix: true })}
          </Text>
        </View>

        {/* Comments */}
        <Text
          style={{ color: Colors.text.secondary, fontSize: 16, fontWeight: "800", marginBottom: 12 }}
        >
          Trash Talk 💬
        </Text>
        <View style={{ gap: 10, marginBottom: 16 }}>
          {bet.comments?.map((c: any) => (
            <View
              key={c.id}
              style={{
                backgroundColor: Colors.surface,
                borderRadius: 12,
                padding: 12,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Text style={{ color: Colors.primary, fontWeight: "700", fontSize: 13 }}>
                  {c.user?.name ?? "Unknown"}
                </Text>
                <Text style={{ color: Colors.text.muted, fontSize: 11 }}>
                  · {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                </Text>
              </View>
              <Text style={{ color: Colors.text.primary, fontSize: 14 }}>{c.text}</Text>
            </View>
          ))}
        </View>

        {/* Comment input */}
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            backgroundColor: Colors.surface,
            borderRadius: 14,
            padding: 12,
            borderWidth: 1,
            borderColor: Colors.border,
          }}
        >
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Drop some trash talk..."
            placeholderTextColor={Colors.text.muted}
            multiline
            style={{ flex: 1, color: Colors.text.primary, fontSize: 14, minHeight: 40 }}
          />
          <TouchableOpacity
            onPress={() => comment.trim() && commentMutation.mutate(comment.trim())}
            disabled={!comment.trim() || commentMutation.isPending}
          >
            <Ionicons
              name="send"
              size={22}
              color={comment.trim() ? Colors.primary : Colors.text.muted}
            />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
