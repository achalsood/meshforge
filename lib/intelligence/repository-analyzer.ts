export type FindingSeverity = "critical" | "high" | "medium" | "low";
export type FindingCategory = "syntax" | "security" | "performance" | "reliability" | "complexity" | "maintainability";

export interface SuggestedPatch {
  path: string;
  before: string;
  after: string;
  description: string;
}

export interface AnalysisFinding {
  id: string;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  explanation: string;
  path: string;
  line: number;
  column: number;
  evidence: string;
  score: number;
  suggestion: string;
  patch?: SuggestedPatch;
}

export interface DependencyEdge { from: string; to: string; external: boolean; }
export interface FileHotspot { path: string; complexity: number; lines: number; imports: number; risk: number; }

export interface RepositoryAnalysis {
  generatedAt: number;
  summary: {
    score: number;
    files: number;
    lines: number;
    findings: number;
    critical: number;
    high: number;
    dependencyEdges: number;
    duplicateBlocks: number;
    syntaxErrors: number;
  };
  findings: AnalysisFinding[];
  hotspots: FileHotspot[];
  dependencies: DependencyEdge[];
  algorithms: Array<{ name: string; complexity: string; purpose: string }>;
}

interface SourceFile { path: string; content: string; }

const SEVERITY_WEIGHT: Record<FindingSeverity, number> = { critical: 40, high: 24, medium: 12, low: 5 };

class MaxHeap<T> {
  private values: Array<{ priority: number; value: T }> = [];

  push(value: T, priority: number) {
    this.values.push({ value, priority });
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.values[parent].priority >= priority) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = { value, priority };
  }

  pop(): T | undefined {
    if (!this.values.length) return undefined;
    const result = this.values[0].value;
    const tail = this.values.pop();
    if (!this.values.length || !tail) return result;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.values.length) break;
      const child = right < this.values.length && this.values[right].priority > this.values[left].priority ? right : left;
      if (this.values[child].priority <= tail.priority) break;
      this.values[index] = this.values[child];
      index = child;
    }
    this.values[index] = tail;
    return result;
  }
}

function lineAt(content: string, index: number): number {
  return content.slice(0, Math.max(0, index)).split("\n").length;
}

function locationAt(content: string, index: number): { line: number; column: number } {
  const safeIndex = Math.max(0, Math.min(index, content.length));
  const line = lineAt(content, safeIndex);
  const lastBreak = content.lastIndexOf("\n", safeIndex - 1);
  return { line, column: safeIndex - lastBreak };
}

function stableId(path: string, line: number, column: number, title: string): string {
  let hash = 2166136261;
  for (const character of `${path}:${line}:${column}:${title}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `mesh-${(hash >>> 0).toString(16)}`;
}

function resolveImport(from: string, target: string, paths: Set<string>): { path: string; external: boolean } {
  if (!target.startsWith(".")) return { path: target.split("/").slice(0, target.startsWith("@") ? 2 : 1).join("/"), external: true };
  const parts = from.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "." || !part) continue;
    if (part === "..") parts.pop(); else parts.push(part);
  }
  const base = parts.join("/");
  const match = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}/index.ts`, `${base}/index.tsx`].find((candidate) => paths.has(candidate));
  return { path: match ?? base, external: false };
}

function dependencyGraph(files: SourceFile[]): DependencyEdge[] {
  const paths = new Set(files.map((file) => file.path));
  const edges: DependencyEdge[] = [];
  const seen = new Set<string>();
  const importPattern = /(?:import|export)[^"'\n]*?from\s*["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)/g;
  for (const file of files) {
    for (const match of file.content.matchAll(importPattern)) {
      const resolved = resolveImport(file.path, match[1] ?? match[2], paths);
      const key = `${file.path}\0${resolved.path}`;
      if (!seen.has(key)) edges.push({ from: file.path, to: resolved.path, external: resolved.external });
      seen.add(key);
    }
  }
  return edges;
}

function complexityOf(content: string): number {
  const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  return 1 + (withoutComments.match(/\b(if|for|while|case|catch)\b|&&|\|\||\?(?![?.])/g)?.length ?? 0);
}

function duplicateBlocks(files: SourceFile[], width = 5): Array<{ first: string; second: string; line: number }> {
  const MOD = 1_000_000_007;
  const BASE = 257;
  const hashes = new Map<number, Array<{ path: string; line: number; block: string }>>();
  const duplicates: Array<{ first: string; second: string; line: number }> = [];
  const seenPairs = new Set<string>();
  for (const file of files) {
    const lines = file.content.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("//"));
    for (let start = 0; start + width <= lines.length; start += 1) {
      const block = lines.slice(start, start + width).join("\n");
      if (block.length < 80) continue;
      let hash = 0;
      for (const char of block) hash = (hash * BASE + char.charCodeAt(0)) % MOD;
      const matches = hashes.get(hash) ?? [];
      const previous = matches.find((candidate) => candidate.path !== file.path && candidate.block === block);
      if (previous) {
        const key = [previous.path, file.path].sort().join("\0");
        if (!seenPairs.has(key)) duplicates.push({ first: previous.path, second: file.path, line: start + 1 });
        seenPairs.add(key);
      }
      matches.push({ path: file.path, line: start + 1, block });
      hashes.set(hash, matches);
    }
  }
  return duplicates;
}

function makeFinding(file: SourceFile, index: number, input: Omit<AnalysisFinding, "id" | "path" | "line" | "column" | "score">): AnalysisFinding {
  const { line, column } = locationAt(file.content, index);
  return { ...input, id: stableId(file.path, line, column, input.title), path: file.path, line, column, score: SEVERITY_WEIGHT[input.severity] };
}

type LexicalState = "code" | "single" | "double" | "template" | "line-comment" | "block-comment" | "regex";

function syntaxFindings(file: SourceFile): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  const source = file.content;
  const stack: Array<{ character: "(" | "[" | "{"; index: number }> = [];
  const closing: Record<string, "(" | "[" | "{"> = { ")": "(", "]": "[", "}": "{" };
  let state: LexicalState = "code";
  let stateStart = 0;
  let escaped = false;
  let regexClass = false;

  const evidenceAt = (index: number) => source.split("\n")[locationAt(source, index).line - 1]?.trim().slice(0, 180) || source.slice(index, index + 80);
  const add = (index: number, title: string, explanation: string, suggestion: string) => {
    findings.push(makeFinding(file, index, {
      severity: "high", category: "syntax", title, explanation,
      evidence: evidenceAt(index), suggestion,
    }));
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (state === "line-comment") {
      if (character === "\n") state = "code";
      continue;
    }
    if (state === "block-comment") {
      if (character === "*" && next === "/") { state = "code"; index += 1; }
      continue;
    }
    if (state === "single" || state === "double" || state === "template") {
      if (escaped) { escaped = false; continue; }
      if (character === "\\") { escaped = true; continue; }
      const delimiter = state === "single" ? "'" : state === "double" ? '"' : "`";
      if (character === delimiter) state = "code";
      else if (character === "\n" && state !== "template") {
        add(stateStart, "Unterminated string literal", "A quoted string reaches a newline before its closing delimiter.", "Close the string or use a template literal for multiline text.");
        state = "code";
      }
      continue;
    }
    if (state === "regex") {
      if (escaped) { escaped = false; continue; }
      if (character === "\\") { escaped = true; continue; }
      if (character === "[") regexClass = true;
      else if (character === "]") regexClass = false;
      else if (character === "/" && !regexClass) {
        state = "code";
        while (/[a-z]/i.test(source[index + 1] ?? "")) index += 1;
      } else if (character === "\n") {
        add(stateStart, "Unterminated regular expression", "A regular-expression literal reaches a newline before its closing slash.", "Close the expression and verify escaped slashes and character classes.");
        state = "code";
      }
      continue;
    }

    if (character === "/" && next === "/") { state = "line-comment"; index += 1; continue; }
    if (character === "/" && next === "*") { state = "block-comment"; stateStart = index; index += 1; continue; }
    if (character === "'" || character === '"' || character === "`") {
      state = character === "'" ? "single" : character === '"' ? "double" : "template";
      stateStart = index;
      escaped = false;
      continue;
    }
    if (character === "/") {
      const prefix = source.slice(0, index).trimEnd();
      const previous = prefix.at(-1) ?? "";
      const lastWord = prefix.match(/([a-zA-Z_$][\w$]*)$/)?.[1] ?? "";
      if (!previous || "([=,:;!&|?{}".includes(previous) || /^(return|throw|case|yield)$/.test(lastWord)) {
        state = "regex"; stateStart = index; regexClass = false; escaped = false; continue;
      }
    }
    if (character === "(" || character === "[" || character === "{") stack.push({ character, index });
    else if (character in closing) {
      const expected = closing[character];
      const opener = stack.at(-1);
      if (!opener || opener.character !== expected) {
        add(index, `Unexpected '${character}'`, opener ? `This closing delimiter does not match the open '${opener.character}'.` : "This closing delimiter has no matching opener.", "Remove it or add the matching opening delimiter.");
      } else stack.pop();
    }
  }

  if (state === "block-comment") add(stateStart, "Unterminated block comment", "The comment reaches the end of the file without */.", "Add the closing */ delimiter.");
  else if (state === "single" || state === "double" || state === "template") add(stateStart, state === "template" ? "Unterminated template literal" : "Unterminated string literal", "The literal reaches the end of the file without a closing delimiter.", "Add the matching closing delimiter.");
  else if (state === "regex") add(stateStart, "Unterminated regular expression", "The expression reaches the end of the file without a closing slash.", "Add the closing slash and verify escaping.");

  for (const opener of stack.slice(-3).reverse()) {
    const expected = opener.character === "(" ? ")" : opener.character === "[" ? "]" : "}";
    add(opener.index, `Unclosed '${opener.character}'`, `This delimiter reaches the end of the file without '${expected}'.`, `Add the matching '${expected}' delimiter.`);
  }

  const missingExpression = /\b(?:const|let|var)\s+[a-zA-Z_$][\w$]*\s*=\s*(?=;|$)/gm.exec(source);
  if (missingExpression) add(missingExpression.index, "Missing assignment expression", "A variable declaration has an equals sign but no value.", "Provide an expression after '=' or remove the assignment.");
  const emptyCondition = /\b(?:if|while|switch)\s*\(\s*\)/g.exec(source);
  if (emptyCondition) add(emptyCondition.index, "Missing condition expression", "This control-flow statement requires an expression inside its parentheses.", "Add a boolean or switch expression.");
  const missingArrowBody = /=>\s*(?=;|$)/gm.exec(source);
  if (missingArrowBody) add(missingArrowBody.index, "Missing arrow-function body", "The arrow is not followed by an expression or block.", "Add an expression or a { ... } body after =>.");

  if (/\.json$/i.test(file.path)) {
    try { JSON.parse(source); } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Invalid JSON";
      const position = Number(message.match(/position\s+(\d+)/i)?.[1] ?? 0);
      add(position, "Invalid JSON syntax", message.replace(/^JSON\.parse:\s*/i, ""), "Remove comments and trailing commas, and ensure every key and string uses double quotes.");
    }
  }
  return findings;
}

function inspectFile(file: SourceFile): AnalysisFinding[] {
  const findings: AnalysisFinding[] = syntaxFindings(file);
  const rules: Array<{ pattern: RegExp; severity: FindingSeverity; category: FindingCategory; title: string; explanation: string; suggestion: string }> = [
    { pattern: /\beval\s*\(/, severity: "critical", category: "security", title: "Dynamic code execution", explanation: "eval executes data as code and can turn untrusted input into arbitrary execution.", suggestion: "Replace eval with a typed parser or explicit command map." },
    { pattern: /\.innerHTML\s*=/, severity: "high", category: "security", title: "Unsafe HTML assignment", explanation: "Direct HTML assignment can introduce cross-site scripting when content is not strictly trusted.", suggestion: "Render text nodes or sanitize through an application-owned allowlist." },
    { pattern: /(?:api[_-]?key|secret|password)\s*[:=]\s*["'][^"']{8,}["']/i, severity: "critical", category: "security", title: "Possible embedded credential", explanation: "Long-lived credentials in source code are easy to leak through history and logs.", suggestion: "Remove the value, rotate it, and load secrets only from the deployment environment." },
    { pattern: /\bwhile\s*\([^)]*\)[\s\S]{0,500}\.shift\s*\(/, severity: "medium", category: "performance", title: "Quadratic queue behavior", explanation: "Array.shift moves every remaining element and can make a loop quadratic.", suggestion: "Use a head index or deque so removals stay O(1)." },
    { pattern: /:\s*any\b|<any>/, severity: "low", category: "maintainability", title: "Unchecked any type", explanation: "any removes compiler guarantees at the boundary where defects are cheapest to catch.", suggestion: "Use unknown and narrow it, or define the actual interface." },
  ];
  for (const rule of rules) {
    const match = rule.pattern.exec(file.content);
    if (!match) continue;
    findings.push(makeFinding(file, match.index, { ...rule, evidence: match[0].slice(0, 160) }));
  }

  const hypot = /const\s+(\w+)\s*=\s*Math\.hypot\(\.\.\.(\w+)\)\s*\|\|\s*1\s*;/g.exec(file.content);
  if (hypot) {
    const indent = file.content.slice(file.content.lastIndexOf("\n", hypot.index) + 1, hypot.index);
    const before = hypot[0];
    const after = `let sumSquares = 0;\n${indent}for (const value of ${hypot[2]}) sumSquares += value * value;\n${indent}const ${hypot[1]} = Math.sqrt(sumSquares) || 1;`;
    findings.push(makeFinding(file, hypot.index, {
      severity: "medium", category: "performance", title: "Avoid spread allocation in vector norm",
      explanation: "Spreading a large typed array into Math.hypot creates argument pressure and can exceed engine limits.",
      evidence: before, suggestion: "Compute the sum of squares in one linear, allocation-free pass.",
      patch: { path: file.path, before, after, description: "Replace spread-based norm with an O(n), O(1)-space loop." },
    }));
  }

  const dynamicLevel = /this\.levels\[([^\]]+)\]\.push\(/g.exec(file.content);
  if (dynamicLevel && dynamicLevel[1] !== "0" && !file.content.includes(`this.levels[${dynamicLevel[1]}] ??=`)) {
    findings.push(makeFinding(file, dynamicLevel.index, {
      severity: "high", category: "reliability", title: "Level may be uninitialized",
      explanation: "A dynamically selected adjacency level can be missing, causing push to throw at runtime.",
      evidence: dynamicLevel[0], suggestion: `Initialize the level before writing: this.levels[${dynamicLevel[1]}] ??= [];`,
    }));
  }

  const complexity = complexityOf(file.content);
  if (complexity > 18) {
    findings.push(makeFinding(file, 0, {
      severity: complexity > 30 ? "high" : "medium", category: "complexity", title: "High decision complexity",
      explanation: `This file has an estimated cyclomatic complexity of ${complexity}, increasing the number of execution paths to test.`,
      evidence: `${complexity} decision paths`, suggestion: "Extract cohesive branches into small functions and add boundary-focused tests.",
    }));
  }
  return findings;
}

export function analyzeRepository(inputFiles: SourceFile[]): RepositoryAnalysis {
  const files = inputFiles.filter((file) => file.path && typeof file.content === "string").slice(0, 200);
  const dependencies = dependencyGraph(files);
  const duplicates = duplicateBlocks(files);
  const findings = files.flatMap(inspectFile);
  for (const duplicate of duplicates) {
    const file = files.find((candidate) => candidate.path === duplicate.second);
    if (!file) continue;
    findings.push(makeFinding(file, 0, {
      severity: "low", category: "maintainability", title: "Duplicate implementation block",
      explanation: `A verified five-line block also appears in ${duplicate.first}.`, evidence: `Matches ${duplicate.first}`,
      suggestion: "Extract the shared behavior behind one named function to prevent divergent fixes.",
    }));
  }

  const findingHeap = new MaxHeap<AnalysisFinding>();
  for (const finding of findings) findingHeap.push(finding, finding.score * 10_000 - finding.line);
  const ranked: AnalysisFinding[] = [];
  while (ranked.length < 30) {
    const finding = findingHeap.pop();
    if (!finding) break;
    ranked.push(finding);
  }

  const hotspotHeap = new MaxHeap<FileHotspot>();
  for (const file of files) {
    const lines = file.content ? file.content.split("\n").length : 0;
    const complexity = complexityOf(file.content);
    const imports = dependencies.filter((edge) => edge.from === file.path).length;
    const risk = complexity * 3 + Math.ceil(lines / 20) + imports * 2;
    hotspotHeap.push({ path: file.path, complexity, lines, imports, risk }, risk);
  }
  const hotspots: FileHotspot[] = [];
  while (hotspots.length < 5) {
    const hotspot = hotspotHeap.pop();
    if (!hotspot) break;
    hotspots.push(hotspot);
  }

  const penalty = ranked.reduce((sum, finding) => sum + SEVERITY_WEIGHT[finding.severity], 0);
  return {
    generatedAt: Date.now(),
    summary: {
      score: Math.max(0, Math.round(100 - Math.min(100, penalty / Math.max(1, Math.sqrt(files.length))))),
      files: files.length,
      lines: files.reduce((sum, file) => sum + (file.content ? file.content.split("\n").length : 0), 0),
      findings: ranked.length,
      critical: ranked.filter((finding) => finding.severity === "critical").length,
      high: ranked.filter((finding) => finding.severity === "high").length,
      dependencyEdges: dependencies.length,
      duplicateBlocks: duplicates.length,
      syntaxErrors: ranked.filter((finding) => finding.category === "syntax").length,
    },
    findings: ranked,
    hotspots,
    dependencies,
    algorithms: [
      { name: "Dependency graph", complexity: "O(F + I)", purpose: "Resolve internal and external import edges" },
      { name: "Rabin–Karp shingles", complexity: "O(L) expected", purpose: "Find verified duplicate code blocks" },
      { name: "Binary max-heap", complexity: "O(N log N)", purpose: "Rank risk findings and hotspots" },
      { name: "Single-pass rule engine", complexity: "O(B)", purpose: "Detect security, reliability, and performance risks" },
      { name: "Lexical state machine + stack", complexity: "O(B) time · O(D) space", purpose: "Locate malformed literals, comments, and delimiters" },
    ],
  };
}
