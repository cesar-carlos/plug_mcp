import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("sinaliza janela truncada e linhas desconhecidas sem imprimir conteúdo", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      String.raw`
    import {safeLogSummary} from './scripts/verify-persona-deployment.mjs';
    console.log(JSON.stringify(safeLogSummary(Array(1000).fill('private SQL').join('\n'))));
  `,
    ],
    { encoding: "utf8" },
  );
  expect(JSON.parse(output)).toMatchObject({ possiblyTruncated: true, nonJson: 1000, errors: 0 });
  expect(output).not.toContain("private");
});

function check(change = "none"): {
  passed: boolean;
  calls: string[][];
  diagnostic?: { code: string };
  report?: { containers: { warnings: number; completedJobs: string[] }[] };
} {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        String.raw`
    import {verifyPersonaDeployment,observationFailure} from './scripts/verify-persona-deployment.mjs';
    const change=process.argv[1], calls=[];
    const revision='a'.repeat(40),imageId='sha256:'+'b'.repeat(64);
    const run=args=>{
      calls.push(args);
      if(args[0]==='inspect') return JSON.stringify([{Name:'/'+args[1], Image:change==='image'?'wrong':imageId,
        Config:{Env:['GIT_SHA='+(change==='sha'?'wrong':revision),'PERSONA_V2_DEPLOYMENT=test-server']},
        RestartCount:change==='restart'?1:0, State:{Status:'running',OOMKilled:false,Health:{Status:change==='health'?'unhealthy':'healthy'},StartedAt:'2026-11-08T22:00:00Z'}}]);
      return [JSON.stringify({level:40,msg:'private SQL password',supportId:'11111111-1111-4111-8111-111111111111'}),
        ...(change==='cycles'?[]:['review','ephemeral','retention','outbox'].map(j=>JSON.stringify({level:30,msg:'persona '+j+' worker completed'}))),
        ...(change==='error'?[JSON.stringify({level:50,msg:'private'})]:[])].join('\n');
    };
    try{const report=await verifyPersonaDeployment({revision,imageId,run,wait:async()=>{},attempts:2}); console.log(JSON.stringify({passed:true,calls,report}));}
    catch(error){console.log(JSON.stringify({passed:false,calls,diagnostic:observationFailure(error)}));}
  `,
        change,
      ],
      { encoding: "utf8" },
    ),
  ) as ReturnType<typeof check>;
}

it("confere revisão, imagem e ciclos com logs resumidos sem dados privados", () => {
  const result = check();
  expect(result.passed).toBe(true);
  expect(result.report?.containers).toHaveLength(2);
  expect(result.report?.containers[0]?.warnings).toBe(1);
  expect(JSON.stringify(result)).not.toMatch(/private|password|SQL/);
  expect(result.calls.every((call) => ["inspect", "logs"].includes(call[0]!))).toBe(true);
  expect(
    result.calls.filter((call) => call[0] === "logs").every((call) => call.includes("1000")),
  ).toBe(true);
});
it.each(["sha", "image", "restart", "health", "cycles", "error"])(
  "recusa %s sem mutação ou repetição de deploy",
  (change) => {
    const result = check(change);
    expect(result.passed).toBe(false);
    expect(result.diagnostic?.code).toBe(
      change === "error"
        ? "RUNTIME_ERRORS_OBSERVED"
        : change === "health" || change === "cycles"
          ? "HEALTH_OR_WORKER_CYCLE_UNCONFIRMED"
          : "CONTAINER_IDENTITY_OR_LIFECYCLE_MISMATCH",
    );
    expect(JSON.stringify(result)).not.toMatch(/private|password|SQL/);
    expect(result.calls.length).toBeLessThanOrEqual(8);
    expect(result.calls.every((call) => ["inspect", "logs"].includes(call[0]!))).toBe(true);
  },
);
