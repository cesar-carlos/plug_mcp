import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("correlaciona recusas SDK, autenticação e preparação com Pino real sem payloads", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
    import express from 'express';
    import request from 'supertest';
    import {createPersonaV2McpHandler} from './src/infrastructure/mcp/persona-v2-http.ts';
    import {createPino,PinoLoggerAdapter} from './src/infrastructure/logging/pino-logger.adapter.ts';
    import {parseMcpPayload} from './tests/helpers/mcp-rpc.ts';
    import {personaMcpParserError} from './src/infrastructure/mcp/persona-v2-protocol-error.ts';
    const logger=new PinoLoggerAdapter(createPino('warn',false));
    const identity={personaId:'fixture',tokenId:'fixture',tokenVersion:1,personaVersion:1};
    const app=express(); app.use(express.json({limit:1024})); app.use(personaMcpParserError(logger));
    for(const mode of ['sdk','authentication','preparation']) {
      const catalog={authenticate:async()=>{if(mode==='authentication')throw new Error('sensitive-authority');return identity;}};
      const setups=mode==='preparation'?{visible:async()=>{throw new Error('sensitive-setup');}}:undefined;
      app.post('/'+mode,createPersonaV2McpHandler(catalog,'http://fixture.test',{run:async()=>{throw Error('fixture should not execute')}},undefined,undefined,undefined,setups,undefined,undefined,logger));
    }
    const results=[];
    for(const [mode,method,params] of [
      ['sdk','tools/call',{name:'obter_treinamento_base',arguments:{topic:'sensitive-argument'}}],
      ['sdk','tools/call',{name:'sensitive-tool',arguments:{password:'sensitive-password'}}],
      ['sdk','resources/read',{uri:'sensitive-resource'}],
      ['authentication','tools/list',{}],
      ['preparation','tools/list',{}],
      ['sdk','tools/call',{name:'validar_consulta',arguments:{options:{page:1}}}],
      ['sdk','tools/call',{name:'validar_consulta',arguments:{options:{pageSize:'sensitive-value'}}}]
    ]) {
      const response=await request(app).post('/'+mode).set('Host','fixture.test')
        .set('Authorization','Bearer sensitive-bearer').set('Accept','application/json, text/event-stream')
        .send({jsonrpc:'2.0',id:1,method,params});
      results.push({status:response.status,body:parseMcpPayload(response)});
    }
    for (const body of ['{"secret":"sensitive-json"', JSON.stringify({secret:'sensitive-large'.repeat(100)})]) {
      const response=await request(app).post('/mcp').set('Content-Type','application/json').send(body);
      results.push({status:response.status,body:response.body});
    }
    console.log(JSON.stringify({results}));
  `,
    ],
    { encoding: "utf8" },
  );
  expect(output).not.toContain("sensitive-");
  const lines = output
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  const events = lines.filter((line) => line.msg === "persona-v2 request failed");
  interface Diagnostic {
    supportId: string;
    code: string;
  }
  interface Body {
    error?: Diagnostic & { data?: Diagnostic };
    result?: { content: { text: string }[] };
  }
  const results = lines.find((line) => line.results).results as { status: number; body: Body }[];
  expect(events, JSON.stringify(results)).toHaveLength(9);
  expect(new Set(events.map((event) => event.supportId)).size).toBe(9);
  results.forEach(({ body }, index) => {
    const diagnostic =
      body.error?.data ??
      body.error ??
      (JSON.parse(body.result!.content[0]!.text) as { error: Diagnostic }).error;
    expect(diagnostic.supportId).toMatch(/^[0-9a-f-]{36}$/);
    expect(events[index]).toMatchObject({
      supportId: diagnostic.supportId,
      errorCode: diagnostic.code,
    });
    expect(events[index]).not.toHaveProperty("message");
  });
  expect(events[0]).toMatchObject({
    protocolOrigin: "sdk_tool_input",
    tool: "obter_treinamento_base",
    rejectedField: "topic",
  });
  expect(events[1]).not.toHaveProperty("tool");
  expect(events[2]).toMatchObject({ protocolOrigin: "sdk_rpc" });
  for (const index of [5, 6]) {
    const diagnostic = JSON.parse(results[index]!.body.result!.content[0]!.text).error;
    expect(diagnostic).toMatchObject({
      rejectedField: "options",
      retryable: false,
      message: expect.stringContaining("page e pageSize juntos"),
    });
    expect(events[index]).toMatchObject({
      supportId: diagnostic.supportId,
      rejectedField: "options",
      tool: "validar_consulta",
    });
  }
  expect(events[7]).toMatchObject({ protocolOrigin: "http_parser" });
  expect(events[8]).toMatchObject({ protocolOrigin: "http_parser" });
  expect(results.slice(3).map((result: { status: number }) => result.status)).toEqual([
    503, 503, 200, 200, 400, 413,
  ]);
});
