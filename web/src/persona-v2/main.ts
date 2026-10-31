import { createApp } from "vue";
import PersonaConsole from "./PersonaConsole.vue";
import "./style.css";
import { router } from "./navigation";
import { initializeTheme } from "./use-theme";

initializeTheme();

createApp(PersonaConsole).use(router).mount("#persona-app");
