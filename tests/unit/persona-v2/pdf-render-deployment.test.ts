import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { expect, it } from "vitest";

it("keeps destination PDF configuration explicit and disabled by default", () => {
  const compose = parse(readFileSync("docker-compose.persona-v2.test.yml", "utf8"));
  expect(compose.services.server.environment.PERSONA_V2_PDF_ENABLED).toBe(
    "${PERSONA_V2_TEST_PDF_ENABLED-false}",
  );
  expect(compose.services.worker.environment.PERSONA_V2_PDF_ENABLED).toBeUndefined();
});

it("keeps the PDF sidecar isolated with bounded writable font cache only", () => {
  const compose = parse(readFileSync("docker-compose.persona-v2.pdf.yml", "utf8"));
  const renderer = compose.services["pdf-renderer"];
  expect(renderer).toMatchObject({
    network_mode: "none",
    read_only: true,
    restart: "no",
    mem_limit: "384m",
    cpus: 1,
    pids_limit: 32,
    cap_drop: ["ALL"],
    security_opt: ["no-new-privileges:true"],
    tmpfs: ["/tmp:rw,noexec,nosuid,size=32m,mode=1777"],
    volumes: ["persona_pdf_socket:/run/se7e-pdf"],
  });
  expect(renderer.environment).toBeUndefined();
  expect(renderer.env_file).toBeUndefined();
  expect(renderer.ports).toBeUndefined();
  expect(compose.services.server.environment.PERSONA_V2_PDF_ENABLED).toBe("true");
});
