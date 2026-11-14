import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("correlaciona grão de CTE no Pino de produção e ignora contexto forjado em details", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
    import {createPino,PinoLoggerAdapter} from './src/infrastructure/logging/pino-logger.adapter.ts';
    import {reportPersonaV2ToolError} from './src/infrastructure/mcp/persona-v2-tool-error.ts';
    import {recordAggregationContext} from './src/domain/errors/aggregation-diagnostic.ts';
    import {DomainError} from './src/domain/errors/domain-error.ts';
    import {parseSelect} from './src/application/use-cases/shared/sql-ast.ts';
    import {assertFanoutSeguro} from './src/application/use-cases/shared/assert-fanout.ts';
    const logger=new PinoLoggerAdapter(createPino('warn',false));
    const scope={tabelas:['secret_parent','secret_child'],colunasPorTabela:{secret_parent:['id','amount'],secret_child:['id','parent']},relacionamentos:[{tabelaOrigem:'secret_child',tabelaDestino:'secret_parent',pares:[{colunaOrigem:'parent',colunaDestino:'id'}],cardinalidade:'N:1'}]};
    const ast=parseSelect('WITH secret_cte AS (SELECT p.id, SUM(p.amount) AS secret_alias FROM secret_parent p JOIN secret_child c ON c.parent=p.id GROUP BY p.id) SELECT x.id,x.secret_alias FROM secret_cte x','mssql');
    let failure;try{assertFanoutSeguro(ast,scope)}catch(e){failure=e}
    recordAggregationContext(failure,{publicationIds:['11111111-1111-4111-8111-111111111111'],publicationRevisions:[7],queryOrigin:'modelo_publicado'});
    const first=reportPersonaV2ToolError(failure,logger);
    const forged=DomainError.pacote({code:'AGREGACAO_INSEGURA',message:'secret_message',hint:'secret_hint',details:{aggregationReason:'measure_multiplication',publicationIds:['secret_token'],aggregationGrain:{selectPath:['secret_sql']},sql:'secret_sql'}});
    const second=reportPersonaV2ToolError(forged,logger);
    console.log(JSON.stringify({ids:[first.supportId,second.supportId],privateOnReply: 'aggregationGrain' in first || 'publicationIds' in first}));
  `,
    ],
    { encoding: "utf8" },
  );
  expect(output).not.toContain("secret_");
  const lines = output
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  const events = lines.filter((line) => line.msg === "persona-v2 tool failed");
  const receipt = lines.find((line) => line.ids);
  expect(events.map((event) => event.supportId)).toEqual(receipt.ids);
  expect(receipt.privateOnReply).toBe(false);
  expect(events[0]).toMatchObject({
    errorCode: "AGREGACAO_INSEGURA",
    aggregationReason: "measure_multiplication",
    publicationIds: ["11111111-1111-4111-8111-111111111111"],
    publicationRevisions: [7],
    queryOrigin: "modelo_publicado",
    aggregationGrain: {
      selectPath: [0],
      groupingKeyCount: 1,
      measureIndex: 1,
      sourceIndex: 0,
      targetIndex: 1,
    },
  });
  expect(events[1]).not.toHaveProperty("publicationIds");
  expect(events[1]).not.toHaveProperty("aggregationGrain");
});
