import { createRouter, createWebHistory } from "vue-router";
import { useSessionStore } from "./stores/session";
import { useSkillStore } from "./stores/skills";

export const router = createRouter({
  history: createWebHistory("/app/"),
  routes: [
    { path: "/", redirect: "/acesso" },
    {
      path: "/conectar",
      name: "conectar",
      component: () => import("./views/ConectarView.vue"),
      meta: { public: true },
    },
    {
      path: "/conectar/colar",
      name: "colar",
      component: () => import("./views/ColarBearerView.vue"),
      meta: { public: true },
    },
    {
      path: "/conectar/bearer",
      name: "bearer",
      component: () => import("./views/BearerEmitidoView.vue"),
      meta: { public: true },
    },
    {
      path: "/conectar/outra",
      name: "outra",
      component: () => import("./views/AdicionarPersonaView.vue"),
    },
    { path: "/acesso", name: "acesso", component: () => import("./views/AcessoView.vue") },
    {
      path: "/acesso/verificar",
      name: "verificar",
      component: () => import("./views/VerificarView.vue"),
    },
    {
      path: "/acesso/persona",
      name: "persona",
      component: () => import("./views/PersonaView.vue"),
    },
    { path: "/acesso/escopo", name: "escopo", component: () => import("./views/EscopoView.vue") },
    {
      path: "/acesso/dialeto",
      name: "dialeto",
      component: () => import("./views/DialetoView.vue"),
    },
    {
      path: "/acesso/credenciais",
      name: "credenciais",
      component: () => import("./views/CredenciaisView.vue"),
    },
    { path: "/acesso/token", name: "token", component: () => import("./views/RotacionarView.vue") },
    {
      path: "/acesso/remover",
      name: "remover",
      component: () => import("./views/RemoverView.vue"),
    },
    { path: "/skills", name: "skills", component: () => import("./views/SkillsView.vue") },
    {
      path: "/skills/nova",
      name: "skill-nova",
      component: () => import("./views/SkillNovaView.vue"),
    },
    {
      path: "/skills/sql",
      name: "skills-sql",
      component: () => import("./views/SkillSqlView.vue"),
    },
    {
      path: "/skills/:id",
      name: "skill",
      component: () => import("./views/SkillDetalheView.vue"),
    },
    {
      path: "/skills/:id/publicar",
      name: "publicar",
      component: () => import("./views/SkillPublicarView.vue"),
    },
    { path: "/grafo", name: "grafo", component: () => import("./views/GrafoView.vue") },
    {
      path: "/anotacoes",
      name: "anotacoes",
      component: () => import("./views/AnotacoesView.vue"),
    },
    { path: "/treino", name: "treino", component: () => import("./views/TreinoView.vue") },
    { path: "/consultas", name: "consultas", component: () => import("./views/ConsultasView.vue") },
    { path: "/operacao", name: "operacao", component: () => import("./views/OperacaoView.vue") },
  ],
});

router.beforeEach((to) => {
  if (to.meta.public) {
    return true;
  }
  const session = useSessionStore();
  if (!session.bearer) {
    return { name: "colar" };
  }
  if (to.name === "publicar") {
    const skills = useSkillStore();
    const id = String(to.params.id ?? "");
    if (skills.aberta?.id === id && !skills.podePublicar) {
      return { name: "skill", params: { id } };
    }
  }
  return true;
});
