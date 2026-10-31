import { ref } from "vue";

export type ThemePreference = "system" | "light" | "dark";
export const themePreference = ref<ThemePreference>("system");
const STORAGE_KEY = "se7e-persona-console-theme";
let media: MediaQueryList | undefined;

function apply(): void {
  const dark =
    themePreference.value === "dark" || (themePreference.value === "system" && media?.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#0f1a16" : "#126348");
}

export function initializeTheme(): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") {
      themePreference.value = saved;
    }
  } catch {
    /* A preferência persistida é opcional; segue o padrão do sistema. */
  }
  media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", apply);
  apply();
}

export function setTheme(value: ThemePreference): void {
  themePreference.value = value;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* O tema ainda se aplica mesmo sem gravar a preferência. */
  }
  apply();
}
