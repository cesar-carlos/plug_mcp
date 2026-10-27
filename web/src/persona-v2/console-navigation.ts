const OPEN_WITHOUT_PERSONA: readonly string[] = ["personas", "catalog"];
const OPEN_WHILE_SUSPENDED: readonly string[] = ["personas", "catalog", "overview", "history"];

export function shouldBlockConsoleNavigation(busy: boolean, dialogOpen: boolean): boolean {
  return busy || dialogOpen;
}

export function consoleRouteAfterAreaChange(
  toName: string,
  state: { logged: boolean; personaId: string; personaActive: boolean | undefined },
): { name: "personas" | "overview" } | true {
  if (state.logged && !state.personaId && !OPEN_WITHOUT_PERSONA.includes(toName)) {
    return { name: "personas" };
  }
  if (state.personaActive === false && !OPEN_WHILE_SUSPENDED.includes(toName)) {
    return { name: "overview" };
  }
  return true;
}
