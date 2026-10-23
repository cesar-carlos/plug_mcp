import { createRouter, createWebHashHistory } from "vue-router";

export const consoleAreas = [
  { id: "personas", label: "Personas" },
  { id: "overview", label: "Visão geral" },
  { id: "sources", label: "Bases" },
  { id: "knowledge", label: "Conhecimento" },
  { id: "training", label: "Treinamentos" },
  { id: "tokens", label: "Tokens e conexões" },
  { id: "queries", label: "Consultas" },
  { id: "operations", label: "Operações" },
  { id: "history", label: "Histórico" },
  { id: "integrations", label: "Integrações" },
  { id: "catalog", label: "Catálogo compartilhado" },
] as const;
export type ConsoleArea = (typeof consoleAreas)[number]["id"];
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/personas" },
    ...consoleAreas.map(({ id }) => ({
      path: `/${id}`,
      name: id,
      component: { render: () => null },
    })),
    { path: "/:pathMatch(.*)*", redirect: "/personas" },
  ],
});
