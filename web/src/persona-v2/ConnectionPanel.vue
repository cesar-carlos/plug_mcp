<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import { RouterLink } from "vue-router";
import type { ConsumerDiagnosis as Diagnosis } from "../../../src/domain/persona-v2/console";
import { useErrorSummary } from "./useErrorSummary";
import {
  sourceVerificationMatches,
  remoteSkillStatus,
  diagnosisLimits,
  type SourceCheck,
} from "./connection-diagnosis";
const props = defineProps<{
  personaId: string;
  bearer: string;
  call: <T>(tool: string, args: unknown) => Promise<T>;
}>();
const emit = defineEmits<{ lock: [value: boolean] }>();
const diagnosis = ref<Diagnosis>(),
  sources = ref<{ id: string; name: string; dialect: string }[]>([]);
const capabilities = ref<unknown>(),
  busy = ref(false),
  message = ref("");
const { error, errorSummary } = useErrorSummary();
const sourceChecks = ref<Record<string, SourceCheck>>({});
let generation = 0;
function reset() {
  generation++;
  diagnosis.value = undefined;
  sources.value = [];
  sourceChecks.value = {};
  capabilities.value = undefined;
  error.value = "";
  message.value = "";
}
watch(() => [props.personaId, props.bearer], reset);
onBeforeUnmount(() => {
  reset();
  emit("lock", false);
});
async function test() {
  if (busy.value || !props.bearer) return;
  reset();
  const version = generation;
  busy.value = true;
  emit("lock", true);
  try {
    const context = await props.call<{ id: string }>("obter_contexto_persona", {});
    if (version !== generation) return;
    if (context.id !== props.personaId) throw new Error("Este token pertence a outra persona.");
    const checked = await props.call<Diagnosis>("diagnosticar_permissoes", {});
    if (version !== generation) return;
    if (checked.personaId !== props.personaId)
      throw new Error("Este token pertence a outra persona.");
    const available = await props.call<typeof sources.value>("listar_fontes", {});
    if (version !== generation) return;
    const platform = await props.call<unknown>("obter_capacidades", {});
    if (version !== generation) return;
    diagnosis.value = checked;
    sources.value = available;
    capabilities.value = platform;
    message.value =
      "Conexão autenticada e descoberta concluída. Nenhuma consulta de negócio foi executada.";
  } catch (cause) {
    if (version === generation) {
      diagnosis.value = undefined;
      error.value = cause instanceof Error ? cause.message : "Conexão não confirmada.";
    }
  } finally {
    busy.value = false;
    emit("lock", false);
  }
}
async function verify(id: string) {
  if (busy.value) return;
  const source = sources.value.find((item) => item.id === id);
  if (!source) return;
  const version = generation;
  busy.value = true;
  emit("lock", true);
  error.value = "";
  delete sourceChecks.value[id];
  try {
    const result = await props.call("verificar_fonte", { fonteId: id });
    if (version !== generation) return;
    if (!sourceVerificationMatches(result, source))
      throw new Error(
        "Resposta de verificação incompatível com a fonte selecionada. Confira a conexão novamente.",
      );
    if (version === generation)
      sourceChecks.value[id] = {
        state: "Portões remotos e identidade verificados; SQL não validado.",
        at: new Date().toISOString(),
        verified: true,
      };
  } catch (cause) {
    if (version === generation) {
      sourceChecks.value[id] = {
        state: "Acesso remoto não confirmado. Revise vínculo, policy e disponibilidade.",
        at: new Date().toISOString(),
        verified: false,
      };
      error.value = cause instanceof Error ? cause.message : "Fonte indisponível.";
    }
  } finally {
    busy.value = false;
    emit("lock", false);
  }
}
async function copy() {
  try {
    await navigator.clipboard.writeText(
      JSON.stringify(
        {
          url: `${window.location.origin}/mcp`,
          transport: "streamable-http",
          authentication: "Bearer informado separadamente",
        },
        null,
        2,
      ),
    );
    message.value = "Endereço e instruções copiados, sem o token.";
  } catch {
    error.value = "Não foi possível copiar. Use o endereço mostrado.";
  }
}
</script>
<template>
  <section aria-label="Conexão do consumidor" :aria-busy="busy">
    <h3>Testar conexão do consumidor</h3>
    <p>
      Use o Bearer informado nesta página. A sessão administrativa não substitui as permissões do
      consumidor.
    </p>
    <button type="button" :disabled="busy || !bearer" @click="test">Testar conexão</button>
    <button type="button" class="secondary" @click="copy">Copiar instruções sem token</button>
    <p role="status">{{ message }}</p>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
    <template v-if="diagnosis">
      <p>
        Token vigente no momento da verificação · versão {{ diagnosis.token.version }} · conferido
        em {{ new Date(diagnosis.checkedAt).toLocaleString("pt-BR", { timeZoneName: "short" }) }}.
      </p>
      <p>
        Validade:
        {{
          diagnosis.token.expiresAt
            ? new Date(diagnosis.token.expiresAt).toLocaleString("pt-BR", { timeZoneName: "short" })
            : "sem expiração configurada"
        }}. Uma revogação posterior bloqueia o uso.
      </p>
      <p>{{ diagnosis.guidance }}</p>
      <h4>Por que esta capacidade está disponível ou bloqueada?</h4>
      <p v-if="!diagnosis.skills.length">
        Este token não possui skills concedidas. Solicite a seleção explícita ao responsável.
      </p>
      <ul>
        <li v-for="skill in diagnosis.skills" :key="skill.skillId">
          <strong
            >{{ skill.name ?? "Concessão de skill" }} ·
            {{ skill.state === "permitido" ? "Permitido localmente" : "Bloqueado" }}</strong
          >
          <p>{{ skill.reason }} {{ skill.action }}</p>
          <p>{{ remoteSkillStatus(skill, sourceChecks) }}</p>
          <p v-if="skill.revision">
            Publicação · revisão {{ skill.revision }}. Aprovação humana:
            {{ skill.requireHumanApproval ? "exigida" : "conforme contrato" }}.
          </p>
          <details v-if="skill.capabilities">
            <summary>Capacidades e limites</summary>
            <pre>{{
              JSON.stringify({ capabilities: skill.capabilities, limits: skill.limits }, null, 2)
            }}</pre>
          </details>
          <dl
            v-if="diagnosisLimits(skill.limits).length"
            aria-label="Limites efetivos da capacidade"
          >
            <template v-for="limit in diagnosisLimits(skill.limits)" :key="limit.key">
              <dt>{{ limit.label }}</dt>
              <dd>{{ limit.value.toLocaleString("pt-BR") }}</dd>
            </template>
          </dl>
        </li>
      </ul>
      <h4>Fontes concedidas</h4>
      <ul>
        <li v-for="source in sources" :key="source.id">
          {{ source.name }} · {{ source.dialect }}
          <button type="button" class="secondary" :disabled="busy" @click="verify(source.id)">
            Verificar acesso à fonte
          </button>
          <p>{{ sourceChecks[source.id]?.state ?? "Portões remotos não verificados." }}</p>
          <p v-if="sourceChecks[source.id]">
            {{
              new Date(sourceChecks[source.id]!.at).toLocaleString("pt-BR", {
                timeZoneName: "short",
              })
            }}
          </p>
        </li>
      </ul>
      <p>
        Conexão autenticada, SQL validado e consulta executada são etapas distintas. Verificar fonte
        usa apenas metadados pelo hub/agente.
      </p>
      <RouterLink :to="{ name: 'queries' }">Escolher consulta publicada</RouterLink>
      <details>
        <summary>Contrato técnico da plataforma</summary>
        <pre>{{ JSON.stringify(capabilities, null, 2) }}</pre>
      </details>
    </template>
  </section>
</template>
