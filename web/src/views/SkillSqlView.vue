<script lang="ts">
export default { name: "SkillSqlView" };
</script>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api, type SkillSqlModeloRow } from "../api";
import { useAction } from "../composables/useAction";
import { statusLabel, toneForStatus } from "../presentation";
import { mesclarSqlDrafts } from "../sql-draft";
import Page from "../components/Page.vue";
import ConfirmField from "../components/ConfirmField.vue";
import ErrorBanner from "../components/ErrorBanner.vue";
import StatusPill from "../components/StatusPill.vue";

interface SkillSqlDraft extends SkillSqlModeloRow {
  original: string;
  sql: string;
  confirmado: boolean;
}

const { pending, error, run } = useAction();
const skills = ref<SkillSqlDraft[]>([]);
const filtro = ref("");
const soFalta = ref(false);
const pronto = ref(false);
const abertos = ref<Record<string, boolean>>({});
const erros = ref<Record<string, unknown>>({});

const faltaSql = (skill: SkillSqlModeloRow): string =>
  skill.faltas.find((falta) => falta.kind === "sql")?.message ?? "";

const mudou = (skill: SkillSqlDraft): boolean => skill.sql.trim() !== skill.original.trim();

const rascunhoDistinto = (skill: SkillSqlDraft): boolean => skill.statusRascunho !== skill.status;

const visiveis = computed(() => {
  const termo = filtro.value.trim().toLowerCase();
  return skills.value.filter((skill) => {
    if (soFalta.value && !faltaSql(skill)) {
      return false;
    }
    if (!termo) {
      return true;
    }
    const haystack = `${skill.nome} ${skill.slug} ${skill.sql}`.toLowerCase();
    return haystack.includes(termo);
  });
});

const aplicar = (rows: readonly SkillSqlModeloRow[], savedId?: string): void => {
  skills.value = mesclarSqlDrafts(rows, skills.value, savedId ?? "");
};

const load = async (bearer: string | undefined, savedId?: string): Promise<void> => {
  const result = await api.get<{ success: true; skills: SkillSqlModeloRow[] }>(
    "/app/api/skills/modelos",
    bearer,
  );
  aplicar(result.skills, savedId);
};

const alternar = (id: string): void => {
  abertos.value = { ...abertos.value, [id]: !abertos.value[id] };
};

onMounted(() => {
  void run(load).then(() => {
    pronto.value = true;
  });
});

const save = async (skill: SkillSqlDraft): Promise<void> => {
  if (!mudou(skill) || !skill.confirmado) {
    return;
  }
  erros.value = { ...erros.value, [skill.id]: null };
  await run(async (bearer) => {
    try {
      await api.post(
        `/app/api/skills/${encodeURIComponent(skill.id)}`,
        { sqlModelo: skill.sql, confirmadoPeloUsuario: true },
        bearer,
      );
      await load(bearer, skill.id);
    } catch (caught) {
      erros.value = { ...erros.value, [skill.id]: caught };
    }
  });
};
</script>

<template>
  <Page
    title="SQL de treino"
    lead="O sqlModelo de cada skill desta persona. O selo publicada é a publicação ativa; o texto é o rascunho."
    :error="error"
  >
    <div class="card">
      <label>
        Filtro
        <input v-model="filtro" placeholder="Nome, slug ou trecho do SQL" />
      </label>
      <label class="choice">
        <input v-model="soFalta" type="checkbox" />
        <span>Só com SQL ilegível</span>
      </label>
    </div>
    <p v-if="pronto && !error && skills.length === 0" class="empty">Nenhuma skill neste acesso.</p>
    <p v-else-if="pronto && visiveis.length === 0" class="empty">Nenhuma skill neste filtro.</p>
    <form v-for="skill in visiveis" :key="skill.id" class="card" @submit.prevent="save(skill)">
      <button class="card-toggle" type="button" @click="alternar(skill.id)">
        <span class="card-toggle-main">
          <strong>{{ skill.nome }}</strong>
          <span class="mono">{{ skill.slug }}</span>
        </span>
        <StatusPill :label="statusLabel(skill.status)" :tone="toneForStatus(skill.status)" />
        <StatusPill
          v-if="rascunhoDistinto(skill)"
          :label="`rascunho: ${statusLabel(skill.statusRascunho)}`"
          tone="warn"
        />
        <span class="hint">{{ abertos[skill.id] ? "Fechar" : "Abrir" }}</span>
      </button>
      <p v-if="faltaSql(skill)" class="row-note">{{ faltaSql(skill) }}</p>
      <p v-else-if="skill.motivoRevalidacao" class="hint">{{ skill.motivoRevalidacao }}</p>
      <template v-if="abertos[skill.id]">
        <ErrorBanner :error="erros[skill.id]" />
        <label>
          sqlModelo
          <textarea v-model="skill.sql" class="sql" rows="10" spellcheck="false" />
        </label>
        <p v-if="mudou(skill)" class="callout warn">
          Gravar este SQL devolve o rascunho a rascunho. Tabelas novas precisam já estar no grafo
          (Treino). A publicação ativa permanece até validar e republicar.
        </p>
        <ConfirmField
          v-model="skill.confirmado"
          label="Confirmo gravar este sqlModelo nesta skill"
        />
        <div class="form-actions">
          <button type="submit" :disabled="pending || !mudou(skill) || !skill.confirmado">
            Salvar
          </button>
          <RouterLink :to="`/skills/${skill.id}`">Abrir skill</RouterLink>
        </div>
      </template>
    </form>
  </Page>
</template>
