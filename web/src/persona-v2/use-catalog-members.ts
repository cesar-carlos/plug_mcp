import { type ComputedRef, type Ref, ref } from "vue";
import type { Catalog, CatalogMember } from "./catalog-panel";

export function useCatalogMembers(input: {
  api: <T>(url: string, body?: unknown) => Promise<T>;
  run: (action: () => Promise<void>) => Promise<void>;
  isLive: () => boolean;
  catalogPath: ComputedRef<string>;
  catalog: ComputedRef<Catalog | undefined>;
  refresh: () => Promise<void>;
  message: Ref<string>;
  onGranted: () => void;
}): {
  members: Ref<CatalogMember[]>;
  clientId: Ref<string>;
  role: Ref<string>;
  loadMembers: () => Promise<void>;
  setMember: () => Promise<void>;
  clearMembers: () => void;
} {
  const members = ref<CatalogMember[]>([]);
  const clientId = ref("");
  const role = ref("reader");
  async function loadMembers(): Promise<void> {
    if (input.catalog.value?.role === "administrator") {
      const data = await input.api<{ members: CatalogMember[] }>(
        `${input.catalogPath.value}/membros`,
      );
      if (input.isLive()) {
        members.value = data.members;
      }
    } else {
      members.value = [];
    }
  }
  async function setMember(): Promise<void> {
    await input.run(async () => {
      await input.api(`${input.catalogPath.value}/membros`, {
        expectedVersion: input.catalog.value!.authorizationVersion,
        hubClientId: clientId.value,
        role: role.value || null,
      });
      if (!input.isLive()) {
        return;
      }
      clientId.value = "";
      input.onGranted();
      await input.refresh();
      input.message.value = "Permissão do catálogo atualizada.";
    });
  }
  function clearMembers(): void {
    members.value = [];
  }
  return { members, clientId, role, loadMembers, setMember, clearMembers };
}
