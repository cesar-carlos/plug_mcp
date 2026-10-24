export interface DocLink {
  target: string;
  line: number;
}

export interface CodeBlock {
  info: string;
  content: string;
  line: number;
}

export interface MarkdownDocument {
  links: DocLink[];
  anchors: Set<string>;
  headings: { level: number; slug: string }[];
  blocks: CodeBlock[];
  problems: { line: number; message: string }[];
}

const referenceId = (text: string): string => text.trim().replace(/\s+/g, " ").toLowerCase();

/** Heading text follows the repository's GitHub Markdown conventions. */
export const headingSlug = (text: string): string =>
  text
    .replace(/!?\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&(?:[a-z]+|#\d+|#x[0-9a-f]+);/gi, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/\s/g, "-");

const blank = (text: string): string => text.replace(/[^\n]/g, " ");

const closingBracket = (text: string, start: number): number => {
  let depth = 1;
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
    } else if (text[i] === "[") {
      depth++;
    } else if (text[i] === "]" && --depth === 0) {
      return i;
    }
  }
  return -1;
};

/** Local destinations support angle brackets, escaped characters and balanced parentheses. */
const destination = (text: string, start: number): { target: string; end: number } | null => {
  let i = start;
  while (/\s/.test(text[i] ?? "") && i < text.length) {
    i++;
  }
  const angled = text[i] === "<";
  if (angled) {
    i++;
  }
  const begin = i;
  let depth = 0;
  for (; i < text.length; i++) {
    const char = text[i];
    if (char === "\\") {
      i++;
    } else if (angled && char === ">") {
      break;
    } else if (!angled) {
      if (char === "(") {
        depth++;
      } else if (char === ")") {
        if (depth === 0) {
          break;
        }
        depth--;
      } else if (/\s/.test(char ?? "") && depth === 0) {
        break;
      }
    }
  }
  if (i === text.length) {
    return null;
  }
  const target = text.slice(begin, i).replace(/\\([\\()[\] ])/g, "$1");
  if (angled) {
    i++;
  }
  while (i < text.length && /\s/.test(text[i] ?? "")) {
    i++;
  }
  if (text[i] !== ")") {
    const opener = text[i];
    if (opener !== '"' && opener !== "'" && opener !== "(") {
      return null;
    }
    const closer = opener === "(" ? ")" : opener;
    i++;
    while (i < text.length && text[i] !== closer) {
      if (text[i] === "\\") {
        i++;
      }
      i++;
    }
    i++;
    while (i < text.length && /\s/.test(text[i] ?? "")) {
      i++;
    }
  }
  return text[i] === ")" ? { target, end: i } : null;
};

export function parseMarkdown(source: string): MarkdownDocument {
  const result: MarkdownDocument = {
    links: [],
    anchors: new Set(),
    headings: [],
    blocks: [],
    problems: [],
  };
  const lines = source
    .replace(/\r\n/g, "\n")
    .replace(/^---\n[\s\S]*?\n---(?:\n|$)/, blank)
    .split("\n");
  let fence: { marker: string; length: number; info: string; line: number; body: string[] } | null =
    null;
  let comment = false;
  const stripComments = (line: string): string => {
    const searchable = line.replace(/(`+)[\s\S]*?\1(?!`)/g, blank);
    let output = "";
    let i = 0;
    while (i < line.length) {
      const boundary = comment ? line.indexOf("-->", i) : searchable.indexOf("<!--", i);
      if (boundary < 0) {
        output += comment ? blank(line.slice(i)) : line.slice(i);
        break;
      }
      if (comment) {
        output += blank(line.slice(i, boundary + 3));
        i = boundary + 3;
      } else {
        output += line.slice(i, boundary) + blank(line.slice(boundary, boundary + 4));
        i = boundary + 4;
      }
      comment = !comment;
    }
    return output;
  };
  const visible: string[] = [];
  for (const [index, line] of lines.entries()) {
    const content = fence ? line : stripComments(line);
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(content);
    if (fence) {
      if (
        marker &&
        marker[1]?.[0] === fence.marker &&
        marker[1].length >= fence.length &&
        !marker[2]?.trim()
      ) {
        result.blocks.push({ info: fence.info, line: fence.line, content: fence.body.join("\n") });
        fence = null;
      } else {
        fence.body.push(line);
      }
      visible.push("");
    } else if (marker) {
      fence = {
        marker: marker[1]?.[0] ?? "`",
        length: marker[1]?.length ?? 3,
        info: marker[2]?.trim() ?? "",
        line: index + 1,
        body: [],
      };
      visible.push("");
    } else {
      visible.push(content);
    }
  }
  if (fence) {
    result.problems.push({ line: fence.line, message: "Bloco de código sem fechamento." });
  }
  const prose = visible;
  const addHeading = (heading: string, level: number): void => {
    const base = headingSlug(heading);
    let slug = base;
    let suffix = 0;
    while (result.anchors.has(slug)) {
      slug = `${base}-${++suffix}`;
    }
    result.anchors.add(slug);
    result.headings.push({ level, slug });
  };
  for (const [index, line] of prose.entries()) {
    const heading = /^ {0,3}#{1,6}\s+(.+?)(?:\s+#+\s*)?$/.exec(line);
    if (heading?.[1]) {
      addHeading(heading[1], /^#+/.exec(line.trimStart())?.[0].length ?? 1);
    } else if (/^ {0,3}(?:=+|-+)\s*$/.test(line) && prose[index - 1]?.trim()) {
      addHeading(prose[index - 1] ?? "", line.trimStart().startsWith("=") ? 1 : 2);
    }
    const html = line.replace(/(`+)[\s\S]*?\1(?!`)/g, blank);
    for (const match of html.matchAll(/<[a-z][^>]*\b(?:id|name)=["']([^"']+)["'][^>]*>/gi)) {
      if (match[1]) {
        result.anchors.add(match[1]);
      }
    }
  }
  const references = new Map<string, string>();
  const masked = prose
    .map((line, index) => {
      const definition = /^ {0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/.exec(line);
      if (definition?.[1] && !definition[1].startsWith("^")) {
        const target = definition[2] ?? definition[3] ?? "";
        references.set(referenceId(definition[1]), target);
        result.links.push({ target, line: index + 1 });
        return blank(line);
      }
      return line;
    })
    .join("\n")
    .replace(/(`+)[\s\S]*?\1(?!`)/g, blank);
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === "\\") {
      i++;
      continue;
    }
    if (masked[i] !== "[" || masked[i + 1] === "^") {
      continue;
    }
    const end = closingBracket(masked, i);
    if (end < 0) {
      continue;
    }
    const line = masked.slice(0, i).split("\n").length;
    if (masked[end + 1] === "(") {
      const link = destination(masked, end + 2);
      if (link) {
        result.links.push({ target: link.target, line });
        i = link.end;
      } else {
        result.problems.push({
          line,
          message: "Link Markdown sem fechamento ou com destino inválido.",
        });
      }
    } else {
      const explicit = masked[end + 1] === "[";
      const refEnd = explicit ? closingBracket(masked, end + 1) : end;
      const label = explicit ? masked.slice(end + 2, refEnd) : "";
      const target = references.get(referenceId(label || masked.slice(i + 1, end)));
      if (target !== undefined) {
        result.links.push({ target, line });
      } else if (explicit && refEnd >= 0) {
        result.problems.push({ line, message: "Referência Markdown sem definição." });
      }
      i = refEnd >= 0 ? refEnd : end;
    }
  }
  return result;
}
