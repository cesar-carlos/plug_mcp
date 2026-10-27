<script setup lang="ts">
import PersonaAvatar from "./PersonaAvatar.vue";
import PersonaIcon from "./PersonaIcon.vue";
import PersonaSettings from "./PersonaSettings.vue";
import PersonaState from "./PersonaState.vue";
import ProgressPanel from "./ProgressPanel.vue";
import type { Persona } from "./model";

defineProps<{
  persona: Persona;
  busy: boolean;
  errorFields: readonly string[];
  settingsKey: number;
  iconKey: number;
  iconAppearance?: { base: string; revision: number; hasIcon: boolean };
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
}>();
const emit = defineEmits<{
  save: [input: unknown];
  changeState: [active: boolean];
  settingsDirty: [value: boolean];
  iconDirty: [value: boolean];
  iconCurrent: [value: { base: string; revision: number; hasIcon: boolean }];
}>();
</script>
<template>
  <section>
    <div class="persona-heading">
      <PersonaAvatar
        :key="persona.id"
        :name="persona.name"
        :persona-id="persona.id"
        :active="persona.active"
        :current="iconAppearance"
      />
      <div>
        <h2>{{ persona.name }}</h2>
        <p>{{ persona.specialty }}</p>
      </div>
    </div>
    <p class="persona-status">
      {{ persona.active ? "Persona ativa" : "Persona suspensa" }}
    </p>
    <ProgressPanel v-if="persona.active" :key="persona.id" :api="api" :base="base" />
    <details v-if="persona.active" class="persona-edit">
      <summary>Editar persona</summary>
      <p class="field-help">
        Atualize nome, especialidade, orientações e imagem. Cada formulário tem seu próprio botão de
        salvar.
      </p>
      <PersonaSettings
        :key="`${persona.id}:${persona.authorizationVersion}:${settingsKey}`"
        embedded
        :persona="persona"
        :busy="busy"
        :error-fields="errorFields"
        @save="emit('save', $event)"
        @dirty="emit('settingsDirty', $event)"
      />
      <PersonaIcon
        :key="`${persona.id}:${iconKey}`"
        :base="base"
        :api="api"
        :busy="busy"
        @dirty="emit('iconDirty', $event)"
        @current="emit('iconCurrent', $event)"
      />
    </details>
    <details class="persona-management">
      <summary>Gerenciar disponibilidade</summary>
      <p class="field-help">
        Suspender interrompe o acesso à persona. Confira o impacto antes de confirmar.
      </p>
      <PersonaState
        :key="`${persona.id}:${persona.authorizationVersion}`"
        :persona="persona"
        :busy="busy"
        @change="emit('changeState', $event)"
      />
    </details>
  </section>
</template>
