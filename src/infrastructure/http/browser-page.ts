const escape = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

export const browserPage = (input: { title: string; product: string; body: string }): string =>
  `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(input.title)}</title>
<style>
  :root { color-scheme: dark; --bg: #0f1720; --panel: #182230; --text: #e8eef5; --muted: #9aabbd; --line: #2b3b4e; --accent: #3d8bfd; --danger: #e35d5d; --ok: #3cb371; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: radial-gradient(880px 380px at 50% -8%, rgba(61, 139, 253, .2), transparent 62%), var(--bg); color: var(--text); font-family: "Segoe UI", system-ui, sans-serif; }
  main { max-width: 520px; margin: 0 auto; padding: 2.4rem 1rem 3rem; }
  header { display: flex; align-items: center; justify-content: center; gap: .85rem; margin-bottom: 1.35rem; }
  .mark { width: 56px; height: 56px; border-radius: 14px; }
  .kicker, .product { margin: 0; }
  .kicker { color: var(--muted); font-size: .75rem; letter-spacing: .14em; text-transform: uppercase; }
  .product { font-size: 1.05rem; font-weight: 650; }
  h1 { margin: 0 0 .45rem; font-size: 1.45rem; font-weight: 650; letter-spacing: -.03em; }
  .lead { margin: 0 0 1rem; color: var(--muted); line-height: 1.5; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 1.15rem 1.15rem 1.2rem; box-shadow: 0 18px 48px rgba(0, 0, 0, .28); }
  .meta { margin: 0; color: var(--muted); font-size: .82rem; }
  .client { margin: .2rem 0 1rem; color: var(--muted); font-size: .82rem; line-height: 1.4; word-break: break-all; }
  .persona { display: block; margin: .2rem 0 .85rem; color: var(--text); font-size: 1.45rem; }
  .section { border: 1px solid var(--line); border-radius: 8px; margin: 0 0 .85rem; padding: .7rem .85rem .15rem; }
  .section legend { padding: 0 .35rem; color: var(--text); font-size: .82rem; font-weight: 650; }
  label { display: grid; gap: .4rem; margin-bottom: .75rem; color: var(--muted); font-size: .92rem; }
  .hint { color: var(--muted); font-size: .78rem; line-height: 1.35; }
  input, select { width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: .7rem .75rem; font: inherit; }
  input[type="checkbox"] { width: 1rem; height: 1rem; margin-top: .15rem; padding: 0; accent-color: var(--accent); }
  input:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }
  label.choice { display: flex; align-items: flex-start; gap: .65rem; color: var(--text); line-height: 1.4; }
  .actions { display: grid; gap: .65rem; margin-top: .35rem; }
  button { width: 100%; background: var(--accent); color: #fff; border: 0; border-radius: 8px; padding: .75rem 1rem; font: inherit; font-weight: 650; cursor: pointer; }
  button.secondary { background: transparent; color: var(--text); border: 1px solid var(--line); }
  .notice, .ok { margin: 0; padding: .9rem 1rem; border-radius: 10px; line-height: 1.5; }
  .notice { background: #3a1d1d; border: 1px solid var(--danger); color: #ffd6d6; }
  .ok { background: #163324; border: 1px solid var(--ok); color: #d9ffe8; }
  pre.token { margin: 0; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: .85rem; overflow: auto; white-space: pre-wrap; word-break: break-all; font-size: .85rem; }
</style>
</head>
<body>
<main>
<header>
<img class="mark" src="/app/icon-192.png" alt="Se7e" width="56" height="56">
<div><p class="kicker">Se7e</p><p class="product">${escape(input.product)}</p></div>
</header>
<h1>${escape(input.title)}</h1>
${input.body}
</main>
</body>
</html>`;

export const hiddenField = (name: string, value: string): string =>
  `<input type="hidden" name="${name}" value="${escape(value)}">`;

export const escapeHtml = (value: string): string => escape(value);
