import { useFonts } from "expo-font";

// Loads the app's brand fonts (bundled .ttf under assets/fonts).
// Rajdhani = display / metrics / device IDs. Barlow = body text.
export function useAppFonts() {
  return useFonts({
    "Rajdhani-Medium": require("../../assets/fonts/Rajdhani-Medium.ttf"),
    "Rajdhani-SemiBold": require("../../assets/fonts/Rajdhani-SemiBold.ttf"),
    "Rajdhani-Bold": require("../../assets/fonts/Rajdhani-Bold.ttf"),
    "Barlow-Regular": require("../../assets/fonts/Barlow-Regular.ttf"),
    "Barlow-Medium": require("../../assets/fonts/Barlow-Medium.ttf"),
    "Barlow-SemiBold": require("../../assets/fonts/Barlow-SemiBold.ttf"),
    "Barlow-Bold": require("../../assets/fonts/Barlow-Bold.ttf"),
  });
}
