<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { askConfirmation } from "../confirmation";
import { useReview } from "../composables/useReview";
import { api, ConsoleApiError } from "../api";
import { record, stringField } from "../validation";
import {
  listarConsultas,
  obterConsulta,
  previewConsulta,
  novoExemplo,
  type Consulta,
  type ConsultaPreview,
} from "../services/consultas";
import { useAction } from "../composables/useAction";
import { useUnsavedChanges } from "../composables/useUnsavedChanges";
import Page from "../components/Page.vue";
import DataView from "../components/DataView.vue";
import ConfirmField from "../components/ConfirmField.vue";
import SkillSelect from "../components/SkillSelect.vue";
import SqlField from "../components/SqlField.vue";
import StatusPill from "../components/StatusPill.vue";
const { error, pending, success, run } = useAction();
const consultas = ref<Consulta[]>([]);
const pagina = ref(1);
const total = ref(0);
const estado = ref("");
const pronta = ref(false);
const aberta = ref<Consulta | null>(null);
const pergunta = ref("");
const sql = ref("");
const skillIds = ref<string[]>([]);
const { preview: salvarPreview, confirmado: confirmarSalvar } = useReview<ConsultaPreview>([
  pergunta,
  sql,
  skillIds,
]);
const salvarOrigem = ref<"candidata" | "novo">("novo");
const inativarId = ref("");
const motivo = ref("");
const { preview: inativarPreview, confirmado: confirmarInativar } = useReview<{
  hash: string;
  value: unknown;
}>([inativarId, motivo]);
const tipo = ref("sinonimo");
const titulo = ref("");
const texto = ref("");
const aprendizadoSkill = ref("");
const dirty = computed(() =>
  Boolean(pergunta.value || sql.value || titulo.value || texto.value || motivo.value),
);
useUnsavedChanges(dirty);
const load = async (bearer: string | undefined): Promise<void> => {
  const result = await listarConsultas(bearer, pagina.value, estado.value);
  consultas.value = result.consultas;
  total.value = result.total;
  pronta.value = true;
};
onMounted(() => {
  void run(load, { feedback: false });
});
const abrir = async (id: string): Promise<void> => {
  salvarPreview.value = null;
  confirmarSalvar.value = false;
  if (aberta.value?.id === id) {
    aberta.value = null;
    return;
  }
  await run(async (bearer) => {
    aberta.value = await obterConsulta(id, bearer);
  });
};
const copiar = async (): Promise<void> => {
  if (!aberta.value) {
    return;
  }
  if (
    (pergunta.value || sql.value) &&
    !(await askConfirmation({
      title: "Substituir novo exemplo?",
      message: "O conteúdo local do formulário será substituído pelo exemplo selecionado.",
      action: "Substituir",
    }))
  ) {
    return;
  }
  const novo = novoExemplo(aberta.value);
  pergunta.value = novo.pergunta;
  sql.value = novo.sql;
  skillIds.value = novo.skillIds;
  document.querySelector<HTMLElement>("#novo-exemplo")?.scrollIntoView({ block: "start" });
};
const revisar = async (candidata?: Consulta): Promise<void> => {
  await run(async (bearer) => {
    salvarOrigem.value = candidata ? "candidata" : "novo";
    const body = candidata
      ? { consultaAprendidaId: candidata.id }
      : { pergunta: pergunta.value, sql: sql.value, skillIds: skillIds.value };
    salvarPreview.value = previewConsulta(
      await api.post("/app/api/consultas/salvar", body, bearer),
    );
    confirmarSalvar.value = false;
  });
};
const confirmar = async (): Promise<void> => {
  const preview = salvarPreview.value;
  if (!preview || !confirmarSalvar.value) {
    return;
  }
  await run(async (bearer) => {
    try {
      const result = record(
        await api.post(
          "/app/api/consultas/salvar",
          {
            consultaAprendidaId: preview.consulta.id,
            confirmacaoHash: preview.hash,
            confirmadoPeloUsuario: confirmarSalvar.value,
          },
          bearer,
        ),
      );
      if (result.confirmacaoPendente) {
        salvarPreview.value = previewConsulta(result);
        confirmarSalvar.value = false;
        return;
      }
      salvarPreview.value = null;
      confirmarSalvar.value = false;
      if (salvarOrigem.value === "novo") {
        pergunta.value = "";
        sql.value = "";
        skillIds.value = [];
      }
      aberta.value = null;
      await load(bearer);
    } catch (caught) {
      if (caught instanceof ConsoleApiError && caught.code === "CONFIRMACAO_DESATUALIZADA") {
        salvarPreview.value = null;
        confirmarSalvar.value = false;
      }
      throw caught;
    }
  });
};
const revisarInativacao = async (): Promise<void> => {
  await run(async (bearer) => {
    const result = record(
      await api.post(
        `/app/api/consultas/${encodeURIComponent(inativarId.value)}/inativar`,
        { motivo: motivo.value },
        bearer,
      ),
    );
    inativarPreview.value = {
      hash: stringField(result, "confirmacaoHash"),
      value: record(result.preview),
    };
    confirmarInativar.value = false;
  });
};
const inativar = async (): Promise<void> => {
  if (!inativarPreview.value || !confirmarInativar.value) {
    return;
  }
  await run(async (bearer) => {
    try {
      const result = record(
        await api.post(
          `/app/api/consultas/${encodeURIComponent(inativarId.value)}/inativar`,
          {
            motivo: motivo.value,
            confirmacaoHash: inativarPreview.value?.hash,
            confirmadoPeloUsuario: confirmarInativar.value,
          },
          bearer,
        ),
      );
      if (result.confirmacaoPendente === true) {
        inativarPreview.value = {
          hash: stringField(result, "confirmacaoHash"),
          value: record(result.preview),
        };
        confirmarInativar.value = false;
        return;
      }
      inativarPreview.value = null;
      confirmarInativar.value = false;
      motivo.value = "";
      inativarId.value = "";
      aberta.value = null;
      await load(bearer);
    } catch (caught) {
      inativarPreview.value = null;
      confirmarInativar.value = false;
      throw caught;
    }
  });
};
const aprendizado = async (): Promise<void> => {
  await run(async (bearer) => {
    await api.post(
      "/app/api/aprendizado",
      {
        tipo: tipo.value,
        titulo: titulo.value,
        texto: texto.value,
        skillId: aprendizadoSkill.value || undefined,
      },
      bearer,
    );
    titulo.value = "";
    texto.value = "";
  });
};
const trocarPagina = async (nova: number): Promise<void> => {
  pagina.value = nova;
  await run(load);
};
</script>
<template>
  <Page
    title="Consultas e aprendizado"
    lead="Revise exemplos e confirme seu conteúdo antes de autorizar o reuso no pacote atual."
    :error="error"
    :pending="pending"
    :success="success"
  >
    <div class="card">
      <h2>Exemplos desta persona</h2>
      <label
        >Status<select v-model="estado" @change="trocarPagina(1)">
          <option value="">Todos</option>
          <option value="candidata">Candidatas</option>
          <option value="confirmada">Confirmadas</option>
          <option value="inativa">Inativas</option>
        </select></label
      >
      <p v-if="pronta && consultas.length === 0" class="empty">Nenhuma consulta neste filtro.</p>
      <div v-for="item in consultas" :key="item.id" class="data-block">
        <button
          class="card-toggle"
          type="button"
          :aria-expanded="aberta?.id === item.id"
          @click="abrir(item.id)"
        >
          <span class="card-toggle-main">{{ item.pergunta }}</span
          ><StatusPill :label="item.status" /><span class="hint">{{
            aberta?.id === item.id ? "Fechar" : "Ver exemplo"
          }}</span>
        </button>
        <template v-if="aberta?.id === item.id">
          <pre class="code">{{ aberta.sql }}</pre>
          <p class="hint">
            {{ aberta.skillIds.length }} skill(s) vinculada(s). O conteúdo deste registro é somente
            leitura.
          </p>
          <div class="form-actions">
            <button v-if="item.status === 'candidata'" type="button" @click="revisar(aberta)">
              Revisar candidata</button
            ><button class="secondary" type="button" @click="copiar">
              Criar novo exemplo a partir deste
            </button>
          </div></template
        >
      </div>
      <div class="form-actions">
        <button
          class="secondary"
          type="button"
          :disabled="pagina === 1"
          @click="trocarPagina(pagina - 1)"
        >
          Anterior</button
        ><span class="hint">Página {{ pagina }} · {{ total }} exemplo(s)</span
        ><button
          class="secondary"
          type="button"
          :disabled="pagina * 25 >= total"
          @click="trocarPagina(pagina + 1)"
        >
          Próxima
        </button>
      </div>
    </div>
    <form id="novo-exemplo" class="card" @submit.prevent="revisar()">
      <h2>Criar novo exemplo</h2>
      <label>Pergunta<input v-model="pergunta" required /></label
      ><SqlField v-model="sql" label="SQL do exemplo" required /><SkillSelect
        :model-value="skillIds"
        multiple
        published-only
        required
        @update:model-value="skillIds = Array.isArray($event) ? $event : []"
      />
      <div class="form-actions"><button type="submit">Revisar novo exemplo</button></div>
    </form>
    <form v-if="salvarPreview" class="card" @submit.prevent="confirmar">
      <h2>Conteúdo efetivo para confirmação</h2>
      <p>{{ salvarPreview.consulta.pergunta }}</p>
      <pre class="code">{{ salvarPreview.consulta.sql }}</pre>
      <details class="raw">
        <summary>Vínculos e contrato do exemplo</summary>
        <DataView
          :value="{
            skillIds: salvarPreview.consulta.skillIds,
            publicacoes: salvarPreview.consulta.publicacoes ?? [],
            paramsContrato: salvarPreview.consulta.paramsContrato ?? [],
          }"
        />
      </details>
      <p class="hint">
        {{ salvarPreview.consulta.skillIds.length }} skill(s) vinculada(s). A confirmação usa esta
        candidata e as publicações vigentes.
      </p>
      <ConfirmField v-model="confirmarSalvar" label="Confirmo este exemplo no pacote atual" />
      <div class="form-actions">
        <button type="submit" :disabled="!confirmarSalvar">Confirmar candidata</button
        ><button class="secondary" type="button" @click="salvarPreview = null">
          Cancelar revisão
        </button>
      </div>
    </form>
    <form class="card" @submit.prevent="revisarInativacao">
      <h2>Inativar consulta</h2>
      <label
        >Consulta<select v-model="inativarId" required>
          <option value="">Selecione um exemplo desta página</option>
          <option
            v-for="item in consultas.filter((item) => item.status !== 'inativa')"
            :key="item.id"
            :value="item.id"
          >
            {{ item.pergunta }}
          </option>
        </select></label
      ><label>Motivo<input v-model="motivo" required /></label>
      <div class="form-actions">
        <button class="secondary" type="submit">Revisar inativação</button>
      </div>
    </form>
    <form v-if="inativarPreview" class="card" @submit.prevent="inativar">
      <h2>Revisar inativação</h2>
      <DataView :value="inativarPreview.value" /><ConfirmField
        v-model="confirmarInativar"
        label="Confirmo inativar este exemplo pelo motivo apresentado"
      />
      <div class="form-actions">
        <button class="danger" type="submit" :disabled="!confirmarInativar">
          Confirmar inativação</button
        ><button class="secondary" type="button" @click="inativarPreview = null">Cancelar</button>
      </div>
    </form>
    <form class="card" @submit.prevent="aprendizado">
      <h2>Registrar aprendizado</h2>
      <SkillSelect
        :model-value="aprendizadoSkill"
        @update:model-value="aprendizadoSkill = typeof $event === 'string' ? $event : ''"
      /><label
        >Tipo<select v-model="tipo">
          <option value="sinonimo">Sinônimo</option>
          <option value="regra">Regra</option>
          <option value="metrica">Métrica</option>
          <option value="glossario">Glossário</option>
          <option value="dicionario">Dicionário</option>
        </select></label
      ><label>Título<input v-model="titulo" required /></label
      ><label>Texto<textarea v-model="texto" rows="4" required /></label>
      <div class="form-actions"><button type="submit">Registrar aprendizado</button></div>
    </form>
  </Page>
</template>
