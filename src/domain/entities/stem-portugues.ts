/** Snowball português (léxico, sem embeddings). Entrada já pode ter acento; saímos ASCII. */

const VOWELS = new Set("aeiou");

export const stripAccents = (value: string): string =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const isVowel = (ch: string | undefined): boolean => Boolean(ch && VOWELS.has(ch));

interface Regions {
  readonly r1: number;
  readonly r2: number;
  readonly rv: number;
}

const regionsOf = (word: string): Regions => {
  const n = word.length;
  let r1 = n;
  let r2 = n;
  let rv = n;
  for (let i = 0; i < n - 1; i += 1) {
    if (isVowel(word[i]) && !isVowel(word[i + 1])) {
      r1 = i + 2;
      break;
    }
  }
  for (let i = r1; i < n - 1; i += 1) {
    if (isVowel(word[i]) && !isVowel(word[i + 1])) {
      r2 = i + 2;
      break;
    }
  }
  if (n >= 3) {
    const second = word[1];
    if (second && !isVowel(second)) {
      for (let i = 2; i < n; i += 1) {
        if (isVowel(word[i])) {
          rv = i + 1;
          break;
        }
      }
    } else if (isVowel(word[0]) && isVowel(second)) {
      for (let i = 2; i < n; i += 1) {
        if (!isVowel(word[i])) {
          rv = i + 1;
          break;
        }
      }
    } else {
      rv = 3;
    }
  }
  return { r1, r2, rv };
};

const inRegion = (word: string, suffix: string, start: number): boolean =>
  word.endsWith(suffix) && word.length - suffix.length >= start;

const del = (word: string, suffix: string): string => word.slice(0, word.length - suffix.length);

const longest = (word: string, suffixes: readonly string[], start: number): string | undefined => {
  let found: string | undefined;
  for (const suffix of suffixes) {
    if (inRegion(word, suffix, start) && (!found || suffix.length > found.length)) {
      found = suffix;
    }
  }
  return found;
};

const STD_R2 = [
  "amentos",
  "imentos",
  "adoras",
  "adores",
  "amento",
  "imento",
  "adoras",
  "acaoes",
  "acoes",
  "ismos",
  "istas",
  "aveis",
  "iveis",
  "adora",
  "ancas",
  "antes",
  "ancia",
  "icos",
  "icas",
  "ismo",
  "ista",
  "osos",
  "osas",
  "avel",
  "ivel",
  "ante",
  "acao",
  "ico",
  "ica",
  "oso",
  "osa",
  "ica",
  "eza",
  "ezas",
  "ivas",
  "ivos",
  "iva",
  "ivo",
] as const;

const VERB_RV = [
  "ariamos",
  "eriamos",
  "iriamos",
  "assemos",
  "essemos",
  "issemos",
  "aramos",
  "eramos",
  "iramos",
  "aremos",
  "eremos",
  "iremos",
  "ariam",
  "eriam",
  "iriam",
  "assem",
  "essem",
  "issem",
  "armos",
  "ermos",
  "irmos",
  "adas",
  "idas",
  "arao",
  "erao",
  "irao",
  "aria",
  "eria",
  "iria",
  "asse",
  "esse",
  "isse",
  "aste",
  "este",
  "iste",
  "arei",
  "erei",
  "irei",
  "ando",
  "endo",
  "indo",
  "ado",
  "ido",
  "ara",
  "era",
  "ira",
  "iam",
  "ado",
  "ada",
  "ida",
  "ou",
  "iu",
  "ia",
  "ei",
  "am",
  "em",
  "ar",
  "er",
  "ir",
] as const;

const RESIDUAL_RV = ["os", "a", "i", "o", "e"] as const;

/** Plural nasal (margem/margens): Snowball residual não cobre `m` → `ns`. */
const foldPluralNasal = (word: string): string =>
  word.length > 4 && word.endsWith("ns") ? `${word.slice(0, -2)}m` : word;

export const stemPortugues = (raw: string): string => {
  const word = foldPluralNasal(stripAccents(raw));
  if (word.length <= 2) {
    return word;
  }
  const { r1, r2, rv } = regionsOf(word);
  let w = word;
  let step1 = false;

  const amente = longest(w, ["amentos", "imentos", "amente"], r1);
  if (amente) {
    w = del(w, amente);
    step1 = true;
    const iv = longest(w, ["iv"], r2);
    if (iv) {
      w = del(w, iv);
    } else {
      const extra = longest(w, ["at", "os", "ad", "ic"], r2);
      if (extra) {
        w = del(w, extra);
      }
    }
  }

  if (!step1) {
    const mente = longest(w, ["amente", "mente"], r1);
    if (mente && mente !== "amente") {
      w = del(w, mente);
      step1 = true;
      const extra = longest(w, ["ante", "avel", "ivel"], r2);
      if (extra) {
        w = del(w, extra);
      }
    }
  }

  if (!step1) {
    const idade = longest(w, ["idades", "idade"], r2);
    if (idade) {
      w = del(w, idade);
      step1 = true;
      const extra = longest(w, ["abil", "ic", "iv"], r2);
      if (extra) {
        w = del(w, extra);
      }
    }
  }

  if (!step1) {
    const iva = longest(w, ["ivas", "ivos", "iva", "ivo"], r2);
    if (iva) {
      w = del(w, iva);
      step1 = true;
      if (inRegion(w, "at", r2)) {
        w = del(w, "at");
      }
    }
  }

  if (!step1) {
    const std = longest(w, STD_R2, r2);
    if (std) {
      w = del(w, std);
      step1 = true;
    }
  }

  if (!step1 && inRegion(w, "logia", r2)) {
    w = `${w.slice(0, w.length - 5)}log`;
    step1 = true;
  } else if (!step1 && inRegion(w, "logias", r2)) {
    w = `${w.slice(0, w.length - 6)}log`;
    step1 = true;
  }

  if (!step1 && (inRegion(w, "ucao", r2) || inRegion(w, "ucoes", r2))) {
    w = inRegion(w, "ucoes", r2) ? `${w.slice(0, w.length - 5)}u` : `${w.slice(0, w.length - 4)}u`;
    step1 = true;
  }

  if (!step1 && (inRegion(w, "encia", r2) || inRegion(w, "encias", r2))) {
    w = inRegion(w, "encias", r2)
      ? `${w.slice(0, w.length - 6)}ente`
      : `${w.slice(0, w.length - 5)}ente`;
    step1 = true;
  }

  if (!step1) {
    const verb = longest(w, VERB_RV, rv);
    if (verb) {
      w = del(w, verb);
    }
  }

  const residual = longest(w, RESIDUAL_RV, rv);
  if (residual) {
    w = del(w, residual);
  }

  if (w.endsWith("e") && w.length - 1 >= rv) {
    const stem = del(w, "e");
    if (stem.endsWith("gu") || stem.endsWith("ci")) {
      w = stem.slice(0, -1);
    } else {
      w = stem;
    }
  }

  return w.length >= 2 ? w : word;
};

export const stemsDeTexto = (
  text: string,
  extraStop: ReadonlySet<string> = new Set(),
): readonly string[] => {
  const unique = [
    ...new Set(
      stripAccents(text)
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length >= 3 && !extraStop.has(term))
        .map(stemPortugues)
        .filter((stem) => stem.length >= 2),
    ),
  ];
  return unique;
};

export const scoreStemOverlap = (
  haystack: string,
  stemmedTerms: readonly string[],
  extraStop: ReadonlySet<string> = new Set(),
): number => {
  if (stemmedTerms.length === 0) {
    return 0;
  }
  const hay = new Set(stemsDeTexto(haystack, extraStop));
  return stemmedTerms.reduce((score, term) => score + (hay.has(term) ? 1 : 0), 0);
};
