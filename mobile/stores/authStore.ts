import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface User {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  username?: string | null;
  chips: number;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  setAuth: (user: User, token: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  loadFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,

  setAuth: (user, token) => {
    AsyncStorage.setItem("tilt_token", token);
    AsyncStorage.setItem("tilt_user", JSON.stringify(user));
    set({ user, token, isLoading: false });
  },

  setUser: (user) => {
    AsyncStorage.setItem("tilt_user", JSON.stringify(user));
    set({ user });
  },

  logout: () => {
    AsyncStorage.multiRemove(["tilt_token", "tilt_user"]);
    set({ user: null, token: null });
  },

  loadFromStorage: async () => {
    try {
      const [token, userStr] = await AsyncStorage.multiGet(["tilt_token", "tilt_user"]);
      const tokenVal = token[1] ?? null;
      const user = userStr[1] ? JSON.parse(userStr[1]) : null;
      set({ token: tokenVal, user, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
}));
