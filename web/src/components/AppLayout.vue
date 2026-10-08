<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  name: "AppLayout",
});
</script>

<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import { computed } from "vue";
import { useSessionStore } from "../stores/session";
import { useSkillStore } from "../stores/skills";
import BrandMark from "./BrandMark.vue";

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const skills = useSkillStore();
const publicPage = computed(() => Boolean(route.meta.public));

const sair = async (): Promise<void> => {
  session.clear();
  skills.limpar();
  await router.push({ name: "colar" });
};
</script>

<template>
  <div>
    <div v-if="publicPage" class="public-shell">
      <header class="public-head">
        <BrandMark />
        <div>
          <p class="public-kicker">Se7e</p>
          <p class="public-product">Console MCP</p>
        </div>
      </header>
      <RouterView />
    </div>
    <div v-else class="layout">
      <nav class="nav">
        <div class="nav-brand">
          <BrandMark compact />
          <h1>Console MCP</h1>
        </div>
        <div v-if="session.acesso" class="nav-persona">
          <p class="nav-persona-kicker">Persona desta aba</p>
          <p class="nav-persona-name">
            {{ session.acesso.nomePersona || session.acesso.nomeAmigavel }}
          </p>
          <p
            v-if="
              session.acesso.nomePersona &&
              session.acesso.nomePersona !== session.acesso.nomeAmigavel
            "
            class="nav-persona-meta"
          >
            {{ session.acesso.nomeAmigavel }}
          </p>
          <span class="pill neutral">{{ session.acesso.dialeto }}</span>
        </div>
        <p class="nav-label">Esta persona</p>
        <RouterLink to="/acesso">Acesso</RouterLink>
        <RouterLink to="/acesso/verificar">Verificar hub</RouterLink>
        <RouterLink to="/acesso/persona">Persona</RouterLink>
        <RouterLink to="/acesso/escopo">Escopo</RouterLink>
        <RouterLink to="/acesso/dialeto">Dialeto</RouterLink>
        <RouterLink to="/acesso/credenciais">Credenciais</RouterLink>
        <RouterLink to="/acesso/token">Rotacionar Bearer</RouterLink>
        <RouterLink to="/conectar/outra">Outra persona</RouterLink>
        <p class="nav-label">Catálogo</p>
        <RouterLink to="/skills">Skills</RouterLink>
        <RouterLink to="/skills/sql">SQL de treino</RouterLink>
        <RouterLink to="/grafo">Grafo</RouterLink>
        <RouterLink to="/anotacoes">Anotações</RouterLink>
        <RouterLink to="/treino">Treino</RouterLink>
        <RouterLink to="/consultas">Consultas</RouterLink>
        <p class="nav-label">Operação</p>
        <RouterLink to="/operacao">Painel</RouterLink>
        <RouterLink class="nav-danger" to="/acesso/remover">Remover acesso</RouterLink>
        <p class="nav-label">Sessão</p>
        <button class="nav-logout" type="button" @click="sair">Sair</button>
      </nav>
      <main>
        <RouterView />
      </main>
    </div>
  </div>
</template>
