import { describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { effectScope, ref } from "vue";
import { useReview } from "./useReview";
import { useSkillStore } from "../stores/skills";
import { useSessionStore } from "../stores/session";
import { askConfirmation, confirmation, finishConfirmation } from "../confirmation";

describe("revisão e consentimento", () => {
  it("alteração de conteúdo ou vínculos invalida hash e confirmação imediatamente", () => {
    const scope = effectScope();
    const sql = ref("SELECT id FROM fato");
    const skills = ref(["s1"]);
    const review = scope.run(() => useReview<{ hash: string }>([sql, skills]))!;
    review.preview.value = { hash: "first" };
    review.confirmado.value = true;
    sql.value += " WHERE id > :id";
    expect(review.preview.value).toBeNull();
    expect(review.confirmado.value).toBe(false);
    review.preview.value = { hash: "second" };
    review.confirmado.value = true;
    skills.value.push("s2");
    expect(review.preview.value).toBeNull();
    expect(review.confirmado.value).toBe(false);
    scope.stop();
  });
  it("trocar sessão limpa rascunho, publicação, transferência e hash", () => {
    setActivePinia(createPinia());
    const session = useSessionStore();
    const skills = useSkillStore();
    skills.guardarHash("old-hash");
    skills.sqlTreinado = "SELECT synthetic";
    session.setBearer("new-synthetic");
    expect(skills.confirmacaoHash).toBeNull();
    expect(skills.sqlTreinado).toBe("");
    expect(skills.aberta).toBeNull();
    expect(skills.publicada).toBeNull();
  });
  it("não fabrica confirmação nem compartilha uma aprovação em dois diálogos", async () => {
    const first = askConfirmation({ title: "Remover A", message: "A será removido" });
    expect(await askConfirmation({ title: "Remover B", message: "B será removido" })).toBe(false);
    expect(confirmation.value?.title).toBe("Remover A");
    finishConfirmation(false);
    expect(await first).toBe(false);
    const next = askConfirmation({ title: "Remover B", message: "B será removido" });
    finishConfirmation(true);
    expect(await next).toBe(true);
  });
});
