import { ref } from "vue";

export type ThemePreference = "system" | "light" | "dark";
export const themePreference = ref<ThemePreference>("system");
const KEY = "se7e-console-theme";
let media: MediaQueryList | undefined;

const apply = (): void => {
  const dark =
    themePreference.value === "dark" || (themePreference.value === "system" && media?.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#101827" : "#f4f6fa");
};
export const initializeTheme = (): void => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark" || saved === "system") {
      themePreference.value = saved;
    }
  } catch {
    /* Preference storage is optional. */
  }
  media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", apply);
  apply();
};
export const setTheme = (value: ThemePreference): void => {
  themePreference.value = value;
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* The current theme still applies. */
  }
  apply();
};
