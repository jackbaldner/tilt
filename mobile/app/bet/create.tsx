import { useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { ENDPOINTS } from "@/constants/api";
import { useAuthStore } from "@/stores/authStore";
import { Colors, betTypeColors } from "@/constants/colors";
import Toast from "react-native-toast-message";

type BetType = "yes_no" | "over_under" | "multiple_choice" | "custom";

const BET_TYPE_CONFIG: Record<BetType, { label: string; emoji: string; defaultOptions: string[] }> = {
  yes_no: { label: "Yes / No", emoji: "🎯", defaultOptions: ["Yes", "No"] },
  over_under: { label: "Over / Under", emoji: "📈", defaultOptions: ["Over", "Under"] },
  multiple_choice: { label: "Multiple Choice", emoji: "🗳️", defaultOptions: [] },
  custom: { label: "Custom", emoji: "✍️", defaultOptions: [] },
};

const STAKE_OPTIONS = [10, 25, 50, 100, 250, 500];

export default function CreateBetScreen() {
  const { circleId } = useLocalSearchParams<{ circleId: string }>();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [betType, setBetType] = useState<BetType>("yes_no");
  const [options, setOptions] = useState<string[]>(["Yes", "No"]);
  const [newOption, setNewOption] = useState("");
  const [stake, setStake] = useState(50);
  const [aiResolvable, setAiResolvable] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isSuggestingLoading, setIsSuggestingLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const setBetTypeAndOptions = (type: BetType) => {
    setBetType(type);
    const defaults = BET_TYPE_CONFIG[type].defaultOptions;
    if (defaults.length > 0) setOptions(defaults);
    else if (type === "multiple_choice") setOptions([]);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.post(ENDPOINTS.bets, {
        circleId,
        title: title.trim(),
        description: description.trim() || undefined,
        type: betType,
        stake,
        options,
        aiResolvable,
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["circle-bets", circleId] });
      queryClient.invalidateQueries({ queryKey: ["circles"] });
      if (user) setUser({ ...user, chips: user.chips - stake });
      Toast.show({ type: "success", text1: "Bet created! 🎰" });
      router.back();
    },
    onError: (err: any) => {
      Toast.show({ type: "error", text1: err?.response?.data?.error ?? "Failed to create bet" });
    },
  });

  const polishWithAI = async () => {
    if (!title.trim()) {
      Toast.show({ type: "error", text1: "Enter a title first" });
      return;
    }
    setIsPolishing(true);
    try {
      const result = await api.post<{ title: string; description: string }>(ENDPOINTS.polishBet, {
        rawTitle: title,
        rawDescription: description,
        type: betType,
      });
      setTitle(result.title);
      if (result.description) setDescription(result.description);
      Toast.show({ type: "success", text1: "✨ AI polished your bet!" });
    } catch {
      Toast.show({ type: "error", text1: "AI polish failed" });
    } finally {
      setIsPolishing(false);
    }
  };

  const suggestBets = async () => {
    if (!circleId) return;
    setIsSuggestingLoading(true);
    try {
      const result = await api.post<{ suggestions: any[] }>(ENDPOINTS.suggestBet, {
        circleId,
      });
      setSuggestions(result.suggestions);
    } catch {
      Toast.show({ type: "error", text1: "Could not get suggestions" });
    } finally {
      setIsSuggestingLoading(false);
    }
  };

  const applySuggestion = (s: any) => {
    setTitle(s.title);
    setDescription(s.description ?? "");
    if (s.type in BET_TYPE_CONFIG) setBetTypeAndOptions(s.type);
    if (s.options?.length) setOptions(s.options);
    setSuggestions([]);
  };

  const canSubmit =
    title.trim().length > 0 &&
    options.length >= 2 &&
    stake > 0 &&
    (user?.chips ?? 0) >= stake;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 24, gap: 12 }}>
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="close" size={26} color={Colors.text.primary} />
            </TouchableOpacity>
            <Text style={{ fontSize: 22, fontWeight: "900", color: Colors.text.primary, letterSpacing: -0.5, flex: 1 }}>
              New Bet
            </Text>
            <TouchableOpacity
              onPress={() => createMutation.mutate()}
              disabled={!canSubmit || createMutation.isPending}
              style={{
                backgroundColor: canSubmit ? Colors.primary : Colors.border,
                borderRadius: 12,
                paddingHorizontal: 20,
                paddingVertical: 10,
              }}
            >
              {createMutation.isPending ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={{ color: canSubmit ? "white" : Colors.text.muted, fontWeight: "700", fontSize: 15 }}>
                  Place Bet
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* AI Suggest */}
          <TouchableOpacity
            onPress={suggestBets}
            disabled={isSuggestingLoading}
            style={{
              backgroundColor: `${Colors.accent}20`,
              borderRadius: 14,
              padding: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginBottom: 20,
              borderWidth: 1,
              borderColor: `${Colors.accent}40`,
            }}
          >
            {isSuggestingLoading ? (
              <ActivityIndicator color={Colors.accent} size="small" />
            ) : (
              <>
                <Text style={{ fontSize: 18 }}>✨</Text>
                <Text style={{ color: Colors.accent, fontWeight: "700", fontSize: 15 }}>
                  Suggest a Bet with AI
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <View style={{ marginBottom: 20 }}>
              <Text style={{ color: Colors.text.secondary, fontWeight: "700", marginBottom: 10 }}>
                AI Suggestions
              </Text>
              <View style={{ gap: 8 }}>
                {suggestions.map((s, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => applySuggestion(s)}
                    style={{
                      backgroundColor: Colors.surface,
                      borderRadius: 12,
                      padding: 14,
                      borderWidth: 1,
                      borderColor: Colors.border,
                    }}
                  >
                    <Text style={{ color: Colors.text.primary, fontWeight: "700", marginBottom: 4 }}>
                      {s.title}
                    </Text>
                    <Text style={{ color: Colors.text.muted, fontSize: 13 }} numberOfLines={2}>
                      {s.description}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={() => setSuggestions([])}>
                  <Text style={{ color: Colors.text.muted, textAlign: "center", fontSize: 13 }}>
                    Dismiss
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Bet Type */}
          <Text style={{ color: Colors.text.secondary, fontWeight: "700", marginBottom: 10 }}>
            Bet Type
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {(Object.entries(BET_TYPE_CONFIG) as [BetType, any][]).map(([type, config]) => (
              <TouchableOpacity
                key={type}
                onPress={() => setBetTypeAndOptions(type)}
                style={{
                  backgroundColor: betType === type ? `${betTypeColors[type]}20` : Colors.surface,
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderWidth: 1.5,
                  borderColor: betType === type ? betTypeColors[type] : Colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Text>{config.emoji}</Text>
                <Text
                  style={{
                    color: betType === type ? betTypeColors[type] : Colors.text.secondary,
                    fontWeight: "700",
                    fontSize: 13,
                  }}
                >
                  {config.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Title */}
          <Text style={{ color: Colors.text.secondary, fontWeight: "700", marginBottom: 8 }}>
            Bet Title
          </Text>
          <View
            style={{
              backgroundColor: Colors.surface,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: Colors.border,
              marginBottom: 8,
              flexDirection: "row",
              alignItems: "flex-end",
              paddingRight: 12,
            }}
          >
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="What are you betting on?"
              placeholderTextColor={Colors.text.muted}
              multiline
              style={{
                flex: 1,
                color: Colors.text.primary,
                fontSize: 16,
                padding: 14,
                minHeight: 52,
              }}
            />
          </View>

          {/* AI Polish button */}
          <TouchableOpacity
            onPress={polishWithAI}
            disabled={isPolishing || !title.trim()}
            style={{ alignSelf: "flex-end", marginBottom: 16 }}
          >
            {isPolishing ? (
              <ActivityIndicator color={Colors.accent} size="small" />
            ) : (
              <Text style={{ color: Colors.accent, fontSize: 13, fontWeight: "600" }}>
                ✨ Polish with AI
              </Text>
            )}
          </TouchableOpacity>

          {/* Description */}
          <Text style={{ color: Colors.text.secondary, fontWeight: "700", marginBottom: 8 }}>
            Description (optional)
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Add more context or resolution criteria..."
            placeholderTextColor={Colors.text.muted}
            multiline
            style={{
              backgroundColor: Colors.surface,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: Colors.border,
              padding: 14,
              color: Colors.text.primary,
              fontSize: 15,
              minHeight: 80,
              marginBottom: 20,
            }}
          />

          {/* Options */}
          <Text style={{ color: Colors.text.secondary, fontWeight: "700", marginBottom: 10 }}>
            Options ({options.length})
          </Text>
          <View style={{ gap: 8, marginBottom: 12 }}>
            {options.map((opt, i) => (
              <View
                key={i}
                style={{
                  backgroundColor: Colors.surface,
                  borderRadius: 12,
                  padding: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: Colors.border,
                }}
              >
                <Text style={{ color: Colors.text.primary, flex: 1, fontSize: 15 }}>{opt}</Text>
                {betType !== "yes_no" && betType !== "over_under" && (
                  <TouchableOpacity
                    onPress={() => setOptions(options.filter((_, idx) => idx !== i))}
                  >
                    <Ionicons name="close-circle" size={20} color={Colors.loss} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          {(betType === "multiple_choice" || betType === "custom") && (
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                marginBottom: 20,
              }}
            >
              <TextInput
                value={newOption}
                onChangeText={setNewOption}
                placeholder="Add option..."
                placeholderTextColor={Colors.text.muted}
                style={{
                  flex: 1,
                  backgroundColor: Colors.surface,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  padding: 12,
                  color: Colors.text.primary,
                  fontSize: 15,
                }}
              />
              <TouchableOpacity
                onPress={() => {
                  if (newOption.trim()) {
                    setOptions([...options, newOption.trim()]);
                    setNewOption("");
                  }
                }}
                style={{
                  backgroundColor: Colors.primary,
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="add" size={22} color="white" />
              </TouchableOpacity>
            </View>
          )}

          {/* Stake */}
          <Text style={{ color: Colors.text.secondary, fontWeight: "700", marginBottom: 10 }}>
            Stake per player
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {STAKE_OPTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setStake(s)}
                style={{
                  backgroundColor: stake === s ? Colors.primary : Colors.surface,
                  borderRadius: 10,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderWidth: 1,
                  borderColor: stake === s ? Colors.primary : Colors.border,
                }}
              >
                <Text
                  style={{
                    color: stake === s ? "white" : Colors.text.secondary,
                    fontWeight: "700",
                    fontSize: 14,
                  }}
                >
                  {s}🪙
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ color: Colors.text.muted, fontSize: 13, marginBottom: 20 }}>
            You have {user?.chips?.toLocaleString() ?? 0} chips
          </Text>

          {/* AI Resolvable */}
          <TouchableOpacity
            onPress={() => setAiResolvable(!aiResolvable)}
            style={{
              backgroundColor: aiResolvable ? `${Colors.accent}20` : Colors.surface,
              borderRadius: 14,
              padding: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              borderWidth: 1,
              borderColor: aiResolvable ? Colors.accent : Colors.border,
              marginBottom: 24,
            }}
          >
            <Text style={{ fontSize: 20 }}>🤖</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: Colors.text.primary, fontWeight: "700", fontSize: 15 }}>
                AI Auto-Resolution
              </Text>
              <Text style={{ color: Colors.text.muted, fontSize: 13, marginTop: 2 }}>
                Let AI resolve this bet based on verifiable data
              </Text>
            </View>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: aiResolvable ? Colors.accent : Colors.border,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {aiResolvable && <Ionicons name="checkmark" size={16} color="white" />}
            </View>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
