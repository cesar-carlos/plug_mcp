// Browser fixtures keep NODE_ENV=test for their backend. The console artifact
// must still match the production bundle shipped by Docker.
process.env.NODE_ENV = "production";
const { build } = await import("vite");
await build();
