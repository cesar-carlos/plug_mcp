<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{
  tables: readonly { id: string; name: string }[];
  relationships: readonly {
    from: string;
    to: string;
    keys: readonly { from: string; to: string }[];
    cardinality: string;
    meaning: string;
    via?: readonly string[];
    path?: readonly string[];
  }[];
}>();
const nodes = computed(() =>
  props.tables
    .slice(0, 12)
    .map((t, i) => ({ ...t, x: i % 2 ? 470 : 10, y: 20 + Math.floor(i / 2) * 120 })),
);
const height = computed(() => Math.max(120, Math.ceil(nodes.value.length / 2) * 120));
const name = (id: string) =>
  props.tables.find((t) => t.id === id)?.name ?? `${id || "Não selecionada"} (referência pendente)`;
const edges = computed(() =>
  props.relationships.flatMap((r) => {
    const from = nodes.value.find((t) => t.id === r.from),
      to = nodes.value.find((t) => t.id === r.to);
    return from && to
      ? [{ ...r, x1: from.x + 150, y1: from.y + 30, x2: to.x + 150, y2: to.y + 30 }]
      : [];
  }),
);
</script>
<template>
  <details class="relationship">
    <summary>Visualizar relacionamentos e lista acessível</summary>
    <p>
      Declarações de treinamento; o desenho não confirma estrutura física, cardinalidade ou
      significado.
    </p>
    <svg v-if="nodes.length" :viewBox="`0 0 800 ${height}`" aria-hidden="true" width="100%">
      <g v-for="(edge, i) in edges" :key="i">
        <line :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2" stroke="currentColor" />
        <text
          :x="(edge.x1 + edge.x2) / 2"
          :y="(edge.y1 + edge.y2) / 2 - 8"
          text-anchor="middle"
          fill="currentColor"
        >
          {{ edge.cardinality }}
        </text>
      </g>
      <g v-for="(node, i) in nodes" :key="i">
        <rect
          :x="node.x"
          :y="node.y"
          width="300"
          height="60"
          rx="8"
          fill="var(--diagram-fill, #eef5f1)"
          stroke="currentColor"
        />
        <text :x="node.x + 150" :y="node.y + 36" text-anchor="middle" fill="#18322f">
          {{ node.name.length > 30 ? `${node.name.slice(0, 27)}…` : node.name }}
        </text>
      </g>
    </svg>
    <p v-if="tables.length > 12">
      O desenho mostra as primeiras 12 tabelas. A lista abaixo contém todos os relacionamentos.
    </p>
    <p v-if="!relationships.length">Nenhum relacionamento declarado.</p>
    <ul>
      <li v-for="(r, i) in relationships" :key="i">
        <strong>{{ name(r.from) }} → {{ name(r.to) }} · {{ r.cardinality }}</strong>
        <p>
          Chaves, na ordem: {{ r.keys.map((k) => `${k.from || "?"} → ${k.to || "?"}`).join("; ") }}.
        </p>
        <p>{{ r.meaning || "Significado ainda não informado." }}</p>
        <p v-if="r.via?.length">Intermediárias: {{ r.via.map(name).join(" → ") }}.</p>
        <p v-if="r.path?.length">Caminho de relações: {{ r.path.join(" → ") }}.</p>
      </li>
    </ul>
  </details>
</template>
