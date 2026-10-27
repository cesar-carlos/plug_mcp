import type { Source } from "./model";

export interface SourceForm {
  name: string;
  purpose: string;
  environment: string;
  agentId: string;
  clientToken: string;
  email: string;
  password: string;
  dialect: Source["dialect"];
}

export function emptySourceForm(): SourceForm {
  return {
    name: "",
    purpose: "",
    environment: "desenvolvimento",
    agentId: "",
    clientToken: "",
    email: "",
    password: "",
    dialect: "mssql",
  };
}

export function isSourceFormDirty(form: SourceForm, replacing: boolean): boolean {
  return !!(
    replacing ||
    form.name ||
    form.purpose ||
    form.agentId ||
    form.email ||
    form.password ||
    form.clientToken ||
    form.environment !== "desenvolvimento" ||
    form.dialect !== "mssql"
  );
}
