<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  name: "AppLayout",
});
</script>

<script setup lang="ts">
import { useRoute } from "vue-router";
import { computed } from "vue";
import { useSessionStore } from "../stores/session";
import BrandMark from "./BrandMark.vue";

const route = useRoute();
const session = useSessionStore();
const publicPage = computed(() => Boolean(route.meta.public));
</script>

<template>
  <div>
    <div v-if="publicPage">
      <div class="public-head">
        <BrandMark />
      </div>
      <RouterView />
    </div>
    <div v-else class="layout">
      <nav class="nav">
        <div class="nav-brand">
          <BrandMark compact />
          <h1>Console MCP</h1>
        </div>
        <p class="muted">{{ session.acesso?.nomeAmigavel ?? "Persona atual" }}</p>
        <a class="muted" style="display: block; margin-bottom: 0.8rem">{{
          session.acesso?.dialeto
        }}</a>
        <RouterLink to="/acesso">Acesso</RouterLink>
        <RouterLink to="/acesso/verificar">Verificar hub</RouterLink>
        <RouterLink to="/acesso/persona">Persona</RouterLink>
        <RouterLink to="/acesso/escopo">Escopo</RouterLink>
        <RouterLink to="/acesso/dialeto">Dialeto</RouterLink>
        <RouterLink to="/acesso/credenciais">Credenciais</RouterLink>
        <RouterLink to="/acesso/token">Rotacionar Bearer</RouterLink>
        <RouterLink to="/conectar/outra">Outra persona</RouterLink>
        <p class="muted">Catálogo</p>
        <RouterLink to="/skills">Skills</RouterLink>
        <RouterLink to="/grafo">Grafo</RouterLink>
        <RouterLink to="/anotacoes">Anotações</RouterLink>
        <RouterLink to="/treino">Treino</RouterLink>
        <RouterLink to="/consultas">Consultas</RouterLink>
        <p class="muted">Operação</p>
        <RouterLink to="/operacao">Painel</RouterLink>
        <RouterLink to="/acesso/remover">Remover acesso</RouterLink>
      </nav>
      <main>
        <RouterView />
      </main>
    </div>
  </div>
</template>
