<script setup lang="ts">
import type { Training } from "./model";
defineProps<{
  relations: Training["relationships"];
  tables: { name: string }[];
}>();
const relation = defineModel<Training["relationships"][number]>({ required: true });
function move(items: string[], index: number, offset: number) {
  const item = items.splice(index, 1)[0];
  items.splice(index + offset, 0, item);
}
</script>
<template>
  <template v-if="relation.cardinality === 'N:N' || relation.via?.length || relation.path?.length">
    <h4>Caminho N:N</h4>
    <p>
      Declare as intermediárias e os elos diretos na ordem do percurso. A relação N:N não permite
      JOIN direto entre suas extremidades. Alterações não corrigem referências automaticamente.
    </p>
    <div v-for="(_table, i) in relation.via ?? []" :key="i">
      <label
        >Intermediária {{ i + 1
        }}<select v-model="relation.via![i]" required>
          <option :value="relation.via![i]">{{ relation.via![i] || "Selecione" }}</option>
          <option v-for="t in tables" :key="t.name">{{ t.name }}</option>
        </select></label
      >
      <button type="button" :disabled="i === 0" @click="move(relation.via!, i, -1)">
        Subir intermediária</button
      ><button
        type="button"
        :disabled="i === relation.via!.length - 1"
        @click="move(relation.via!, i, 1)"
      >
        Descer intermediária</button
      ><button type="button" @click="relation.via?.splice(i, 1)">Remover intermediária</button>
    </div>
    <button
      type="button"
      :disabled="(relation.via?.length ?? 0) >= 8"
      @click="
        relation.via ??= [];
        relation.via.push('');
      "
    >
      Adicionar intermediária
    </button>
    <div v-for="(_edge, i) in relation.path ?? []" :key="i">
      <label
        >Elo direto {{ i + 1
        }}<select v-model="relation.path![i]" required>
          <option :value="relation.path![i]">{{ relation.path![i] || "Selecione" }}</option>
          <option
            v-for="edge in relations.filter(
              (r) => r !== relation && r.id && r.cardinality !== 'N:N' && !r.via?.length,
            )"
            :key="edge.id"
            :value="edge.id"
          >
            {{ edge.id }} · {{ edge.from }} → {{ edge.to }}
          </option>
        </select></label
      >
      <button type="button" :disabled="i === 0" @click="move(relation.path!, i, -1)">
        Subir elo</button
      ><button
        type="button"
        :disabled="i === relation.path!.length - 1"
        @click="move(relation.path!, i, 1)"
      >
        Descer elo</button
      ><button type="button" @click="relation.path?.splice(i, 1)">Remover elo</button>
    </div>
    <button
      type="button"
      :disabled="(relation.path?.length ?? 0) >= 9"
      @click="
        relation.path ??= [];
        relation.path.push('');
      "
    >
      Adicionar elo direto
    </button>
  </template>
</template>
