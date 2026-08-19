
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Types ──────────────────────────────────────────────────
export type AccentColor =
  | "#c8f135" // lime  (default)
  | "#4e8ef7" // blue
  | "#ff6b9d" // pink
  | "#f97316" // orange
  | "#22d3ee" // cyan
  | "#a78bfa" // purple
  | "#22c55e" // green
  | "#ff4f4f"; // red

export type FontSize = "sm" | "md" | "lg";
export type BubbleStyle = "rounded" | "sharp" | "pill";

export interface ChatBackground {
  type: "color" | "gradient" | "image";
  /** solid hex or gradient start (type=color / gradient) */
  color: string;
  /** gradient end color (type=gradient only) */
  color2?: string;
  /** local file URI or remote URL (type=image only) */
  imageUri?: string;
}

export interface AppearanceTheme {
  // Global
  accentColor: AccentColor;
  bgColor: string;         // main screen background
  cardColor: string;       // card/surface background
  textPrimary: string;     // primary text
  textSecondary: string;   // muted / secondary text
  borderColor: string;     // subtle borders
  fontSize: FontSize;

  // Chat specific
  chatBackground: ChatBackground;
  bubbleStyle: BubbleStyle;
  myBubbleColor: string;
  theirBubbleColor: string;
  myBubbleTextColor: string;
  theirBubbleTextColor: string;

  // Preset name (for UI highlight)
  presetName: string;
}

// ── Presets ────────────────────────────────────────────────
export const PRESETS: Record<string, AppearanceTheme> = {
  "Dark Lime": {
    accentColor: "#c8f135",
    bgColor: "#0d0d0f",
    cardColor: "#1c1d23",
    textPrimary: "#f2f2f4",
    textSecondary: "#6b6d7a",
    borderColor: "#26272f",
    fontSize: "md",
    chatBackground: { type: "color", color: "#0d0d0f" },
    bubbleStyle: "rounded",
    myBubbleColor: "#c8f135",
    theirBubbleColor: "#1c1d23",
    myBubbleTextColor: "#0d0d0f",
    theirBubbleTextColor: "#f2f2f4",
    presetName: "Dark Lime",
  },
  "Midnight Blue": {
    accentColor: "#4e8ef7",
    bgColor: "#07090f",
    cardColor: "#121828",
    textPrimary: "#e8edf8",
    textSecondary: "#5a6480",
    borderColor: "#1e2640",
    fontSize: "md",
    chatBackground: {
      type: "gradient",
      color: "#070d1f",
      color2: "#0e1f3a",
    },
    bubbleStyle: "rounded",
    myBubbleColor: "#4e8ef7",
    theirBubbleColor: "#1a2744",
    myBubbleTextColor: "#ffffff",
    theirBubbleTextColor: "#e8edf8",
    presetName: "Midnight Blue",
  },
  "Sakura Pink": {
    accentColor: "#ff6b9d",
    bgColor: "#0f080b",
    cardColor: "#1e1118",
    textPrimary: "#fce8ef",
    textSecondary: "#7a5060",
    borderColor: "#2e1520",
    fontSize: "md",
    chatBackground: {
      type: "gradient",
      color: "#130810",
      color2: "#1f0d18",
    },
    bubbleStyle: "pill",
    myBubbleColor: "#ff6b9d",
    theirBubbleColor: "#2a1020",
    myBubbleTextColor: "#ffffff",
    theirBubbleTextColor: "#fce8ef",
    presetName: "Sakura Pink",
  },
  "Forest": {
    accentColor: "#22c55e",
    bgColor: "#070e09",
    cardColor: "#0f1c12",
    textPrimary: "#e4f5e8",
    textSecondary: "#4a6b52",
    borderColor: "#182a1e",
    fontSize: "md",
    chatBackground: { type: "color", color: "#07100a" },
    bubbleStyle: "rounded",
    myBubbleColor: "#22c55e",
    theirBubbleColor: "#112018",
    myBubbleTextColor: "#030d06",
    theirBubbleTextColor: "#e4f5e8",
    presetName: "Forest",
  },
  "Cyberpunk": {
    accentColor: "#22d3ee",
    bgColor: "#050a14",
    cardColor: "#0a1525",
    textPrimary: "#e0f6ff",
    textSecondary: "#3a6070",
    borderColor: "#0e2030",
    fontSize: "md",
    chatBackground: {
      type: "gradient",
      color: "#040b16",
      color2: "#071020",
    },
    bubbleStyle: "sharp",
    myBubbleColor: "#22d3ee",
    theirBubbleColor: "#08182c",
    myBubbleTextColor: "#020a10",
    theirBubbleTextColor: "#e0f6ff",
    presetName: "Cyberpunk",
  },
  "Violet Dusk": {
    accentColor: "#a78bfa",
    bgColor: "#09070f",
    cardColor: "#160f24",
    textPrimary: "#ede8ff",
    textSecondary: "#5e4d80",
    borderColor: "#22154e",
    fontSize: "md",
    chatBackground: {
      type: "gradient",
      color: "#0a0714",
      color2: "#17103a",
    },
    bubbleStyle: "rounded",
    myBubbleColor: "#a78bfa",
    theirBubbleColor: "#1e1440",
    myBubbleTextColor: "#09060f",
    theirBubbleTextColor: "#ede8ff",
    presetName: "Violet Dusk",
  },
};

export const DEFAULT_THEME: AppearanceTheme = PRESETS["Dark Lime"];

// ── Font size map (used wherever fontSize is applied) ──────
export const FONT_SIZE_MAP: Record<FontSize, number> = {
  sm: 12,
  md: 14,
  lg: 16,
};

// ── Context ────────────────────────────────────────────────
interface AppearanceContextValue {
  theme: AppearanceTheme;
  setTheme: (t: AppearanceTheme) => void;
  applyPreset: (name: string) => void;
  updateField: <K extends keyof AppearanceTheme>(
    key: K,
    value: AppearanceTheme[K]
  ) => void;
  resetToDefault: () => void;
  isLoaded: boolean;
}

const AppearanceContext = createContext<AppearanceContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  applyPreset: () => {},
  updateField: () => {},
  resetToDefault: () => {},
  isLoaded: false,
});

const STORAGE_KEY = "@fitapp_appearance_v2";

// ── Provider ───────────────────────────────────────────────
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppearanceTheme>(DEFAULT_THEME);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from storage
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as AppearanceTheme;
            setThemeState({ ...DEFAULT_THEME, ...parsed });
          } catch (_) {}
        }
      })
      .finally(() => setIsLoaded(true));
  }, []);

  const setTheme = useCallback((t: AppearanceTheme) => {
    setThemeState(t);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(t)).catch(console.error);
  }, []);

  const applyPreset = useCallback(
    (name: string) => {
      const preset = PRESETS[name];
      if (preset) setTheme(preset);
    },
    [setTheme]
  );

  const updateField = useCallback(
    <K extends keyof AppearanceTheme>(key: K, value: AppearanceTheme[K]) => {
      setThemeState((prev) => {
        const next = { ...prev, [key]: value, presetName: "Custom" };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(
          console.error
        );
        return next;
      });
    },
    []
  );

  const resetToDefault = useCallback(() => {
    setTheme(DEFAULT_THEME);
  }, [setTheme]);

  return (
    <AppearanceContext.Provider
      value={{ theme, setTheme, applyPreset, updateField, resetToDefault, isLoaded }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────
export function useAppearance() {
  return useContext(AppearanceContext);
}
