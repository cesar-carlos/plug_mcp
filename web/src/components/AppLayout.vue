<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSessionStore } from "../stores/session";
import { useSkillStore } from "../stores/skills";
import BrandMark from "./BrandMark.vue";
import ThemeSelect from "./ThemeSelect.vue";
import ConfirmationDialog from "./ConfirmationDialog.vue";
import { finishConfirmation } from "../confirmation";
const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const skills = useSkillStore();
const publicPage = computed(() => Boolean(route.meta.public));
const menuOpen = ref(false);
const menuButton = ref<HTMLButtonElement | null>(null);
const persona = computed(
  () => session.acesso?.nomePersona || session.acesso?.nomeAmigavel || "Seu acesso",
);
const groups = [
  {
    label: "Visão geral",
    links: [
      { to: "/acesso", label: "Resumo do acesso" },
      { to: "/acesso/verificar", label: "Verificar conexão" },
    ],
  },
  {
    label: "Catálogo",
    links: [
      { to: "/skills", label: "Skills" },
      { to: "/consultas", label: "Consultas" },
      { to: "/anotacoes", label: "Anotações" },
    ],
  },
  {
    label: "Treinamento",
    links: [
      { to: "/treino", label: "Treinar e inspecionar" },
      { to: "/skills/sql", label: "SQL de treino" },
      { to: "/grafo", label: "Grafo e relações" },
    ],
  },
  { label: "Operação", links: [{ to: "/operacao", label: "Painel operacional" }] },
  {
    label: "Configurações do acesso",
    links: [
      { to: "/acesso/persona", label: "Persona" },
      { to: "/acesso/escopo", label: "Escopo" },
      { to: "/acesso/dialeto", label: "Dialeto" },
      { to: "/acesso/credenciais", label: "Credenciais" },
      { to: "/acesso/token", label: "Gerenciar token MCP" },
      { to: "/conectar/outra", label: "Adicionar persona" },
    ],
  },
];
const closeMenu = async (): Promise<void> => {
  if (!menuOpen.value) {
    return;
  }
  menuOpen.value = false;
  await nextTick();
  menuButton.value?.focus();
};
const escape = (event: KeyboardEvent): void => {
  if (event.key === "Escape") {
    void closeMenu();
  }
};
window.addEventListener("keydown", escape);
onBeforeUnmount(() => window.removeEventListener("keydown", escape));
watch(
  () => route.fullPath,
  () => {
    void closeMenu();
  },
);
watch(
  () => session.generation,
  () => {
    skills.limpar();
    finishConfirmation(false);
  },
  { flush: "sync" },
);
const sair = async (): Promise<void> => {
  const failure = await router.push({ name: "colar" });
  if (!failure) {
    session.clear();
    skills.limpar();
  }
};
</script>
<template>
  <a href="#main-content" class="skip-link">Ir para o conteúdo</a>
  <div v-if="publicPage" class="public-shell">
    <header class="public-head">
      <div class="nav-brand">
        <BrandMark />
        <div>
          <p class="public-kicker">Se7e</p>
          <p class="public-product">Console MCP</p>
        </div>
      </div>
      <ThemeSelect />
    </header>
    <main id="main-content" class="public-main"><RouterView :key="route.path" /></main>
  </div>
  <div v-else class="layout">
    <header class="mobile-header">
      <BrandMark compact />
      <div>
        <strong>Console MCP</strong><span class="hint">{{ persona }}</span>
      </div>
      <button
        ref="menuButton"
        class="secondary"
        type="button"
        aria-controls="app-navigation"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen"
      >
        {{ menuOpen ? "Fechar" : "Menu" }}
      </button>
    </header>
    <nav
      id="app-navigation"
      class="nav"
      :class="{ 'is-open': menuOpen }"
      aria-label="Navegação principal"
    >
      <div class="nav-brand">
        <BrandMark compact />
        <div>
          <strong>Se7e</strong>
          <p class="hint">Console MCP</p>
        </div>
      </div>
      <div class="nav-persona">
        <p class="nav-persona-kicker">Persona atual</p>
        <p class="nav-persona-name">{{ persona }}</p>
        <span v-if="session.acesso" class="pill neutral">{{ session.acesso.dialeto }}</span>
      </div>
      <section v-for="group in groups" :key="group.label">
        <p class="nav-label">{{ group.label }}</p>
        <RouterLink
          v-for="link in group.links"
          :key="link.to"
          :to="link.to"
          :class="{
            'nav-current':
              route.path === link.to || (link.to === '/skills' && route.name === 'skill'),
          }"
          >{{ link.label }}</RouterLink
        >
      </section>
      <details class="danger-zone">
        <summary>Ações destrutivas</summary>
        <RouterLink class="nav-danger" to="/acesso/remover">Remover acesso</RouterLink>
      </details>
      <div class="nav-footer">
        <ThemeSelect /><button class="nav-logout" type="button" @click="sair">
          Sair desta sessão
        </button>
      </div>
    </nav>
    <main id="main-content"><RouterView :key="`${route.path}:${session.generation}`" /></main>
  </div>
  <ConfirmationDialog />
</template>
