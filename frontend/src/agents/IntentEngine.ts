/* ───────────────────────────────────────────────────────
   Smart Lab – Intelligent Intent Engine v2
   RAG-first scoring engine with:
   • Required gates (AND logic – ALL must match or 0)
   • Negative signals (penalise conflicting keywords)
   • Exemplar similarity (Jaccard vs prototype phrases)
   • Phrase normalisation (multi-word → canonical form)
   • Lab-state awareness (context boost / penalty)
   • Single-intent output (avoids multi-fire bugs)
   ─────────────────────────────────────────────────────── */

import type { AgentActionType } from '../types';
import type { ExperimentRAG } from '../rag/ExperimentRAG';
import type { SimulationState } from '../engine/SimulationState';

/* ── Public types ────────────────────────────────────── */

export interface ScoredIntent {
  action: AgentActionType | 'REMOVE_MATERIAL';
  targets: string[];
  quantity: number;
  score: number;   // 0–100 confidence
  raw: string;
}

/* ── Internal types ──────────────────────────────────── */

interface RAGContext {
  tags: Set<string>;
  keywords: Set<string>;
}

interface IntentDef {
  action: AgentActionType | 'REMOVE_MATERIAL';
  /** ALL required groups must match (AND gate) — any miss → score 0 */
  required: string[][];
  /** Optional groups add bonus score if matched */
  optional?: string[][];
  /** If ANY negative keyword appears, heavy penalty */
  negative?: string[];
  /** Example user phrases — used for Jaccard similarity */
  exemplars: string[];
  /** RAG tags that should appear in top results */
  ragTags?: string[];
  /** Dynamic boost based on current lab state */
  contextBoost?: (eng: IntentEngine) => number;
  /** Extract targets from the matched text */
  targetExtractor?: (text: string, eng: IntentEngine) => string[];
  /** If true, intent is discarded when targetExtractor returns [] */
  requiresTargets?: boolean;
}

/* ═══════════════════════════════════════════════════════
   Utility functions
   ═══════════════════════════════════════════════════════ */

/** Levenshtein distance for typo tolerance */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

/** Fuzzy word match (exact, substring, or edit-distance ≤ threshold) */
function fuzzyMatch(word: string, keyword: string, threshold = 2): boolean {
  if (word === keyword) return true;
  if (keyword.length <= 3) return word === keyword; // short words: exact only
  if (word.includes(keyword) || keyword.includes(word)) return true;
  return editDistance(word, keyword) <= threshold;
}

/** Tokenise text into lower-case words */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

/** Does any token in `words` fuzzy-match any keyword? */
function matchesGroup(words: string[], fullText: string, keywords: string[]): boolean {
  for (const kw of keywords) {
    if (kw.includes(' ')) {
      if (fullText.includes(kw)) return true;
    } else {
      for (const w of words) {
        if (fuzzyMatch(w, kw)) return true;
      }
    }
  }
  return false;
}

/** Jaccard-like similarity (with partial fuzzy credit) */
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const w of setA) {
    if (setB.has(w)) {
      inter++;
    } else {
      for (const bw of setB) {
        if (fuzzyMatch(w, bw, 1)) { inter += 0.5; break; }
      }
    }
  }
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

/* ── Phrase normalisation ────────────────────────────── */
const PHRASE_NORMS: [RegExp, string][] = [
  [/\btake\s+away\b/g,               'remove'],
  [/\bget\s+rid\s+(?:of\s+)?/g,      'remove '],
  [/\bthrow\s+away\b/g,              'remove'],
  [/\btake\s+out\b/g,                'remove'],
  [/\bturn\s+around\b/g,             'reverse'],
  [/\bturn\s+on\b/g,                 'activate'],
  [/\blight\s+(?:it\s+)?up\b/g,      'activate'],
  [/\bmake\s+it\s+work\b/g,          'activate'],
  [/\bpower\s+on\b/g,                'activate'],
  [/\bhow\s+much\b/g,                'calculate'],
  [/\bhow\s+many\b/g,                'calculate'],
  [/\bleft\s+to\s+right\b/g,         'swap'],
  [/\bright\s+to\s+left\b/g,         'swap'],
];

function normalise(text: string): string {
  let t = text.toLowerCase().trim();
  for (const [re, rep] of PHRASE_NORMS) t = t.replace(re, rep);
  return t;
}

/* ═══════════════════════════════════════════════════════
   The Intent Engine
   ═══════════════════════════════════════════════════════ */

export class IntentEngine {
  private rag: ExperimentRAG;
  private sim: SimulationState;
  private defs: IntentDef[];

  constructor(rag: ExperimentRAG, sim: SimulationState) {
    this.rag = rag;
    this.sim = sim;
    this.defs = this.buildDefs();
  }

  /* ── Public entry point ──────────────────────────── */

  parse(text: string): ScoredIntent[] {
    const norm  = normalise(text);
    const words = tokenize(norm);
    if (words.length === 0) return [];

    // 1. Query RAG for context
    const ragResults = this.rag.query(norm, 3);
    const ragCtx: RAGContext = {
      tags:     new Set(ragResults.flatMap(r => r.document.tags.map(t => t.toLowerCase()))),
      keywords: new Set(ragResults.flatMap(r => tokenize(r.document.content).slice(0, 40))),
    };

    // 2. Score every defined intent
    const candidates: ScoredIntent[] = [];
    for (const def of this.defs) {
      const score = this.score(def, norm, words, ragCtx);
      if (score < 30) continue;

      const targets = def.targetExtractor
        ? def.targetExtractor(norm, this)
        : [];

      // Discard if targets are required but we found none
      if (def.requiresTargets && targets.length === 0) continue;

      candidates.push({
        action:   def.action,
        targets,
        quantity: this.extractQty(norm),
        score,
        raw:      text,
      });
    }

    if (candidates.length === 0) return [];
    candidates.sort((a, b) => b.score - a.score);

    // 3. Single best intent (compound only for "and then"/"and also")
    if (/\b(?:and\s+(?:then|also|next)|then|after\s+that)\b/.test(norm) && candidates.length > 1) {
      return candidates.slice(0, 2);
    }
    return [candidates[0]];
  }

  /* ── Scoring ─────────────────────────────────────── */

  private score(def: IntentDef, norm: string, words: string[], rag: RAGContext): number {
    // Gate: ALL required groups must match
    for (const group of def.required) {
      if (!matchesGroup(words, norm, group)) return 0;
    }

    // Base: passed all gates
    let s = 40;

    // Optional groups (up to +15)
    if (def.optional && def.optional.length > 0) {
      let matched = 0;
      for (const g of def.optional) if (matchesGroup(words, norm, g)) matched++;
      s += (matched / def.optional.length) * 15;
    }

    // Exemplar similarity (up to +25)
    let best = 0;
    for (const ex of def.exemplars) {
      const sim = jaccardSimilarity(words, tokenize(ex));
      if (sim > best) best = sim;
    }
    s += best * 25;

    // RAG alignment (up to +15)
    if (def.ragTags && def.ragTags.length > 0) {
      const overlap = def.ragTags.filter(t => rag.tags.has(t.toLowerCase())).length;
      s += (overlap / def.ragTags.length) * 15;
    }

    // Context boost (±15)
    if (def.contextBoost) s += def.contextBoost(this);

    // Negative signals (−25 each)
    if (def.negative) {
      for (const neg of def.negative) {
        if (neg.includes(' ') ? norm.includes(neg) : words.includes(neg)) {
          s -= 25;
        }
      }
    }

    return Math.min(100, Math.max(0, s));
  }

  /* ── Helpers ─────────────────────────────────────── */

  private extractQty(text: string): number {
    const m = text.match(/(\d+)\s*(?:lemon|nail|wire|led)/);
    if (m) return parseInt(m[1]);
    if (/\b(?:two|2)\b/.test(text))   return 2;
    if (/\b(?:three|3)\b/.test(text)) return 3;
    if (/\b(?:four|4)\b/.test(text))  return 4;
    return 1;
  }

  /** Fuzzy material lookup — returns the EARLIEST match by position in text */
  matchMaterial(text: string): string | null {
    const lower = text.toLowerCase().trim();
    const map: [string, string[]][] = [
      ['zinc-nail',   ['zinc nail', 'galvanized nail', 'galvanised nail', 'nail', 'zinc', 'galvanized', 'galvanised', 'zn']],
      ['copper-wire', ['copper wire', 'copper coin', 'wire electrode', 'copper', 'cu']],
      ['led',         ['led light', 'l.e.d', 'led', 'diode', 'bulb', 'lamp']],
      ['wire-clip',   ['connecting wire', 'alligator clip', 'wire clip', 'wire', 'wires', 'clip', 'alligator', 'connector', 'cable']],
      ['knife',       ['knife', 'cutter', 'blade']],
      ['lemon',       ['lemon', 'fruit', 'citrus', 'limon', 'lemmon']],
    ];
    // Find the earliest substring match by character position
    let bestId: string | null = null;
    let bestPos = Infinity;
    for (const [id, kws] of map) {
      for (const kw of kws) {
        const pos = lower.indexOf(kw);
        if (pos !== -1 && pos < bestPos) {
          bestPos = pos;
          bestId = id;
        }
      }
    }
    if (bestId) return bestId;
    // Fallback: fuzzy match (strict threshold 1)
    const ws = tokenize(lower);
    for (const [id, kws] of map)
      for (const kw of kws)
        if (!kw.includes(' ') && ws.some(w => fuzzyMatch(w, kw, 1))) return id;
    return null;
  }

  getSimState() { return this.sim; }

  /* ═════════════════════════════════════════════════════
     Intent Definitions
     ═════════════════════════════════════════════════════ */

  private buildDefs(): IntentDef[] {
    return [

      /* ── REVERSE LED POLARITY ─────────────────────── */
      {
        action: 'REVERSE_LED' as AgentActionType,
        required: [
          // Must have a "change" verb
          ['reverse', 'flip', 'swap', 'switch', 'change', 'invert', 'rotate', 'opposite', 'turn'],
          // Must reference the LED / polarity concept
          ['led', 'light', 'bulb', 'diode', 'polarity', 'poles', 'legs', 'pins',
           'terminals', 'anode', 'cathode', 'orientation'],
        ],
        exemplars: [
          'reverse the led',
          'flip the led polarity',
          'swap the poles of the led',
          'change led direction',
          'switch the anode and cathode',
          'turn the led around',
          'change the poles of the led',
          'reverse led connections',
          'invert the led orientation',
          'change the poles from left to right and right to left',
        ],
        ragTags: ['LED', 'polarity', 'circuit'],
        contextBoost: (eng) => eng.sim.getLabState().hasLED ? 10 : -15,
      },

      /* ── REMOVE MATERIAL ──────────────────────────── */
      {
        action: 'REMOVE_MATERIAL',
        required: [
          ['remove', 'discard', 'delete', 'trash', 'eliminate', 'dispose'],
        ],
        optional: [
          ['lemon', 'fruit', 'cell', 'battery'],
        ],
        negative: ['add', 'more', 'another'],
        exemplars: [
          'remove a lemon',
          'remove the lemon',
          'discard the lemon',
          'delete a lemon',
          'eliminate one lemon',
        ],
        ragTags: ['lemon', 'circuit'],
        targetExtractor: (text, eng) => {
          const mat = eng.matchMaterial(text);
          return mat ? [mat] : ['lemon'];
        },
      },

      /* ── ADD SERIES CELL (more lemons) ────────────── */
      {
        action: 'ADD_SERIES_CELL',
        required: [
          // Must have an action verb
          ['add', 'connect', 'put', 'get', 'take', 'need', 'want', 'give',
           'more', 'another', 'extra', 'increase'],
          // MUST reference "more / another / series / increase" concept
          ['more', 'another', 'extra', 'second', 'third', 'additional',
           'series', 'increase', 'voltage'],
        ],
        exemplars: [
          'add another lemon',
          'add more lemons',
          'connect another lemon in series',
          'increase voltage',
          'need more voltage',
          'put another lemon',
          'add a second lemon',
          'get one more lemon',
        ],
        ragTags: ['series', 'voltage', 'lemon'],
        contextBoost: (eng) => eng.sim.getLabState().lemons > 0 ? 10 : -10,
        targetExtractor: () => ['lemon'],
      },

      /* ── ROLL LEMON ───────────────────────────────── */
      {
        action: 'ROLL_LEMON',
        required: [
          // MUST have a "roll" verb — "take" will NOT pass this gate
          ['roll', 'prepare', 'squeeze', 'press', 'soften', 'massage', 'knead'],
        ],
        optional: [
          ['lemon', 'fruit', 'citrus'],
        ],
        negative: ['insert', 'into', 'connect'],
        exemplars: [
          'roll the lemon',
          'prepare the lemon',
          'squeeze the lemon',
          'press the lemon',
          'soften the lemon',
          'roll the lemons',
          'massage the lemon',
        ],
        ragTags: ['rolling', 'conductivity', 'lemon'],
        contextBoost: (eng) => eng.sim.getLabState().lemons > 0 ? 5 : -10,
      },

      /* ── INSERT INTO ──────────────────────────────── */
      {
        action: 'INSERT_INTO',
        required: [
          ['insert', 'push', 'stick', 'shove', 'poke', 'drive', 'put', 'place'],
          ['into', 'in', 'inside', 'through'],
        ],
        optional: [
          ['nail', 'zinc', 'copper', 'wire', 'electrode'],
          ['lemon', 'fruit'],
        ],
        exemplars: [
          'insert the nail into the lemon',
          'push the nail in the lemon',
          'stick the copper wire in the lemon',
          'push zinc into the lemon',
          'place the nail inside the lemon',
          'put the copper in the lemon',
          'insert copper wire into lemon',
        ],
        ragTags: ['electrode', 'insert', 'lemon'],
        targetExtractor: (text, eng) => {
          // Try structured regex first: "insert X into Y"
          const m = text.match(
            /(?:insert|push|stick|put|place|shove|poke|drive)\s+(?:the\s+)?(?:a\s+)?(.+?)\s+(?:into|in|inside|through)\s+(?:the\s+)?(?:a\s+)?(\w+)/i,
          );
          if (m) {
            const mat  = eng.matchMaterial(m[1]);
            const host = eng.matchMaterial(m[2]);  // only first word after "into"
            if (mat && host) return [mat, host];
          }
          // Infer host = lemon when user says "insert nail"
          const stripped = text.replace(/insert|push|stick|put|place|into|in|the|a/gi, '').trim();
          const mat = eng.matchMaterial(stripped);
          if (mat && (mat === 'zinc-nail' || mat === 'copper-wire')) return [mat, 'lemon'];
          return [];
        },
        requiresTargets: true,
      },

      /* ── ADD MATERIAL ─────────────────────────────── */
      {
        action: 'ADD_MATERIAL',
        required: [
          ['take', 'get', 'grab', 'pick', 'add', 'bring', 'give', 'need',
           'want', 'fetch', 'use', 'put', 'place'],
        ],
        // Heavy negatives prevent overlap with other intents
        negative: [
          'into', 'inside', 'through',           // INSERT_INTO
          'more', 'another', 'extra', 'series',  // ADD_SERIES_CELL
          'remove', 'discard',                    // REMOVE
          'reverse', 'flip', 'swap',              // REVERSE_LED
          'roll', 'squeeze', 'press',             // ROLL_LEMON
          'connect', 'attach', 'hook',            // CONNECT_WIRE
          'complete', 'close', 'finish',          // COMPLETE_CIRCUIT
        ],
        exemplars: [
          'take a lemon',
          'get the nail',
          'add the copper wire',
          'i need an led',
          'give me the zinc nail',
          'take zinc',
          'take the led',
          'get the lemon',
          'pick up the nail',
          'grab a lemon',
          'bring me the copper',
          'i want the led',
        ],
        ragTags: ['materials', 'electrode'],
        targetExtractor: (text, eng) => {
          const mat = eng.matchMaterial(text);
          return mat ? [mat] : [];
        },
        requiresTargets: true,
      },

      /* ── CONNECT WIRE / LED ───────────────────────── */
      {
        action: 'CONNECT_WIRE',
        required: [
          ['connect', 'attach', 'wire', 'link', 'hook', 'plug', 'join'],
        ],
        optional: [
          ['led', 'light', 'bulb', 'diode'],
          ['wire', 'circuit', 'electrode', 'nail', 'copper'],
        ],
        negative: ['remove', 'reverse', 'flip', 'disconnect'],
        exemplars: [
          'connect the led',
          'attach the led to the circuit',
          'wire up the led',
          'hook up the light',
          'connect the wires',
          'plug in the led',
          'join the circuit',
        ],
        ragTags: ['connection', 'wiring', 'circuit', 'LED'],
        contextBoost: (eng) => {
          const ls = eng.sim.getLabState();
          return (ls.nailInserted && ls.copperInserted && ls.hasLED && !ls.ledConnected) ? 10 : 0;
        },
        targetExtractor: (text, eng) => {
          if (/led|light|bulb|diode/i.test(text)) return ['led'];
          const m = text.match(
            /(?:connect|attach|wire|link|hook)\s+(?:the\s+)?(?:a\s+)?(?:wire\s+)?(?:from\s+)?(?:the\s+)?(.+?)(?:\s+(?:to|with)\s+(?:the\s+)?(.+))?$/i,
          );
          if (m) {
            const t1 = eng.matchMaterial(m[1]);
            const t2 = m[2] ? eng.matchMaterial(m[2]) : null;
            if (t1) return t2 ? [t1, t2] : [t1];
          }
          return ['led']; // default: connect LED
        },
      },

      /* ── COMPLETE CIRCUIT ─────────────────────────── */
      {
        action: 'COMPLETE_CIRCUIT',
        required: [
          ['complete', 'close', 'finish', 'finalize', 'done', 'activate', 'start'],
          ['circuit', 'battery', 'experiment', 'led', 'light'],
        ],
        exemplars: [
          'complete the circuit',
          'close the circuit',
          'finish the experiment',
          'activate the battery',
          'start the experiment',
          'activate the led',
          'activate the circuit',
        ],
        ragTags: ['circuit', 'complete'],
      },

      /* ── SHOW REACTION ────────────────────────────── */
      {
        action: 'SHOW_REACTION',
        required: [
          ['show', 'explain', 'what', 'tell', 'describe', 'display'],
          ['reaction', 'equation', 'formula', 'chemistry', 'chemical',
           'oxidation', 'reduction', 'redox'],
        ],
        exemplars: [
          'show the reaction',
          'explain the chemical reaction',
          'what is the equation',
          'tell me about oxidation',
          'describe the redox reaction',
          'show me the formula',
          'what is oxidation and reduction',
        ],
        ragTags: ['reaction', 'chemistry', 'oxidation'],
      },

      /* ── CALCULATE ────────────────────────────────── */
      {
        action: 'CALCULATE',
        required: [
          ['calculate', 'compute', 'measure', 'show', 'tell', 'what', 'how'],
          ['voltage', 'current', 'power', 'resistance', 'runtime',
           'watts', 'volts', 'amps', 'ohms', 'energy', 'metrics'],
        ],
        exemplars: [
          'calculate the voltage',
          'what is the current',
          'show me the metrics',
          'compute the power',
          'calculate the resistance',
          'measure the voltage',
          'tell me the volts',
          'what is the runtime',
        ],
        ragTags: ['voltage', 'current', 'calculation'],
      },
    ];
  }
}
