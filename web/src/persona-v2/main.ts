import { createApp } from "vue";
import PersonaConsole from "./PersonaConsole.vue";
import "./style.css";
import { router } from "./navigation";

createApp(PersonaConsole).use(router).mount("#persona-app");
