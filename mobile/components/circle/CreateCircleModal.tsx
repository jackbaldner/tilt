import { useState } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { ENDPOINTS } from "@/constants/api";
import { Colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";

const EMOJIS = ["🎯", "🎰", "🎲", "⚽", "🏀", "🏈", "⚾", "🎾", "🏒", "🎮", "🃏", "🎳", "🏆", "🔥", "💸", "🌮", "🍕", "🍺", "🎉", "👑", "💀", "🚀", "🦁", "🐉"];

interface CreateCircleModalProps {
  visible: boolean;
  onClose: () => void;
}

export function CreateCircleModal({ visible, onClose }: CreateCircleModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("🎯");

  const createMutation = useMutation({
    mutationFn: () => api.post<{ circle: any }>(ENDPOINTS.circles, { name, description, emoji }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["circles"] });
      Toast.show({ type: "success", text1: `${emoji} ${name} created!` });
      onClose();
      setName("");
      setDescription("");
      setEmoji("🎯");
      router.push(`/circle/${data.circle.id}`);
    },
    onError: (err: any) => {
      Toast.show({ type: "error", text1: err?.response?.data?.error ?? "Failed to create" });
    },
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <View style={{ padding: 20, flex: 1 }}>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 28 }}>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={26} color={Colors.text.primary} />
              </TouchableOpacity>
              <Text
                style={{
                  flex: 1,
                  fontSize: 22,
                  fontWeight: "900",
                  color: Colors.text.primary,
                  textAlign: "center",
                  letterSpacing: -0.5,
                }}
              >
                New Circle
              </Text>
              <TouchableOpacity
                onPress={() => name.trim() && createMutation.mutate()}
                disabled={!name.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <ActivityIndicator color={Colors.primary} size="small" />
                ) : (
                  <Text
                    style={{
                      color: name.trim() ? Colors.primary : Colors.text.muted,
                      fontWeight: "700",
                      fontSize: 16,
                    }}
                  >
                    Create
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Emoji picker */}
            <Text style={{ color: Colors.text.secondary, fontWeight: "700", marginBottom: 10 }}>
              Pick an emoji
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
              {EMOJIS.map((e) => (
                <TouchableOpacity
                  key={e}
                  onPress={() => setEmoji(e)}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: emoji === e ? `${Colors.primary}25` : Colors.surface,
                    borderWidth: 1.5,
                    borderColor: emoji === e ? Colors.primary : Colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 22 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Preview */}
            <View
              style={{
                alignItems: "center",
                marginBottom: 28,
                backgroundColor: Colors.surface,
                borderRadius: 20,
                padding: 20,
              }}
            >
              <Text style={{ fontSize: 48, marginBottom: 8 }}>{emoji}</Text>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "900",
                  color: name ? Colors.text.primary : Colors.text.muted,
                }}
              >
                {name || "Circle Name"}
              </Text>
            </View>

            {/* Name input */}
            <Text style={{ color: Colors.text.secondary, fontWeight: "700", marginBottom: 8 }}>
              Circle Name
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="The Boys, Fantasy League, Work Bets..."
              placeholderTextColor={Colors.text.muted}
              maxLength={50}
              style={{
                backgroundColor: Colors.surface,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: Colors.border,
                padding: 14,
                color: Colors.text.primary,
                fontSize: 16,
                marginBottom: 16,
              }}
            />

            {/* Description */}
            <Text style={{ color: Colors.text.secondary, fontWeight: "700", marginBottom: 8 }}>
              Description (optional)
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What do you bet on?"
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
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
