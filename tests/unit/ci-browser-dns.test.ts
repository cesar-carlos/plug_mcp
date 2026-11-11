import { expect, it, vi } from "vitest";
import { prepareBrowserDns } from "../../scripts/prepare-ci-browser-dns.js";

const env = { GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "github-hosted" };
it("preserva DNS saudável sem sudo de configuração", () => {
  const command = vi.fn((_file: string, _args: string[]) => "192.0.2.1 STREAM fixture");
  expect(prepareBrowserDns(env, "linux", command)).toEqual({ fallback: false });
  expect(command).toHaveBeenCalledTimes(3);
  expect(command.mock.calls.every(([, args]) => args.includes("getent"))).toBe(true);
});
it.each([true, false])("reconfere DNS após fallback, recuperação=%s", (recovered) => {
  let configured = false;
  const command = vi.fn((file: string, args: string[]) => {
    if (file === "ip") return JSON.stringify([{ dev: "eth0" }]);
    if (args.includes("flush-caches")) configured = true;
    if (args.includes("getent")) {
      if (!configured || !recovered) throw Error("synthetic DNS unavailable");
      return "192.0.2.1 STREAM fixture";
    }
    return "";
  });
  if (recovered) expect(prepareBrowserDns(env, "linux", command)).toEqual({ fallback: true });
  else expect(() => prepareBrowserDns(env, "linux", command)).toThrow("must not be skipped");
  expect(command).toHaveBeenCalledWith("sudo", [
    "-n",
    "resolvectl",
    "dns",
    "eth0",
    "1.1.1.1",
    "8.8.8.8",
  ]);
  expect(command.mock.calls.filter(([, args]) => args.includes("dns"))).toHaveLength(1);
});
it.each(
  [[], [{ dev: "eth0" }, { dev: "eth1" }], [{ dev: "--secret" }]].map((routes) => ({ routes })),
)("recusa interface indefinida/ambígua sem mutação: %j", ({ routes }) => {
  const command = vi.fn((file: string) => {
    if (file === "ip") return JSON.stringify(routes);
    throw Error("synthetic DNS failure");
  });
  expect(() => prepareBrowserDns(env, "linux", command)).toThrow("interface");
  expect(command.mock.calls.every(([file]) => file === "ip" || file === "sudo")).toBe(true);
  expect(command).toHaveBeenCalledTimes(2);
});
it.each([
  [{}, "linux"],
  [{ ...env, RUNNER_ENVIRONMENT: "self-hosted" }, "linux"],
  [env, "win32"],
] as const)("recusa ambiente fora de runner descartável", (environment, platform) => {
  const command = vi.fn();
  expect(() => prepareBrowserDns(environment, platform, command)).toThrow("ephemeral");
  expect(command).not.toHaveBeenCalled();
});
