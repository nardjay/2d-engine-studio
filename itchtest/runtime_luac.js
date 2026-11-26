/**
 * luac.js — a small Lua → JavaScript compiler.
 *
 * Why not a full Lua VM? Browsers only run JS. A real Lua interpreter would be
 * a ~600 KB dependency; this compiler is ~300 lines of readable code that
 * turns a practical Lua subset into the same JS the engine already runs.
 * You learn/write Lua; the browser gets JS. Nothing to install.
 *
 * Supported (the language basics you asked for):
 *   local x = 5            → let
 *   numbers "1e3" strings, escape-safe
 *   true / false / nil     → null
 *   {1,2,3} array tables   → [1,2,3]        (lists)
 *   {a = 1, ["b"] = 2}     → object tables  (dictionaries — kept as JS objects)
 *   ~= == and or not       → != == && || !
 *   a .. b                 → a + b (string concat)
 *   #t                     → t.length
 *   if / elseif / else / end, while do, repeat until
 *   for i = 1, 10 do · for i = 10, 1, -2 do
 *   for v in ipairs(t) do · for k, v in pairs(t) do
 *   function name(a, b) ... end · return
 *   print(x) → log(x) · warn(x) · error(msg) · pcall(f)
 *   wait(1)  → await wait(1)   (blocking-style, game keeps running)
 *   -- and --[[ ]] comments
 *   the full engine API: get set add obj objects hide show setText moveTo
 *   spawn destroy beep timerStart key pressed rand randInt chance pick clamp …
 */

export function luaToJs(src) {
  // ---- protect string literals so we never rewrite inside them ----
  const strings = [];
  let code = String(src).replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, m => {
    strings.push(m);
    return `\u0001${strings.length - 1}\u0001`;
  });

  // ---- comments ----
  code = code.replace(/\u0001\d+\u0001/g, m => m) // no-op, keep placeholders
    .replace(/--\[\[[\s\S]*?\]\]/g, '/* */')
    .replace(/--[^\n]*/g, m => '//' + m.slice(2));

  // ---- table constructors: list tables → arrays; hash tables → JS objects ----
  code = convertTables(code);

  // ---- numeric for + generic for ----
  code = code.replace(/\bfor\s+([A-Za-z_]\w*)\s*=\s*([^=]+?),\s*([^,]+?)(?:,\s*([^,]+?))?\s+do\b/g,
    (_, v, a, b, step) => {
      const st = step ? Number(step) || step : '1';
      const up = !step || Number(st) > 0;
      return `for (let ${v} = ${a.trim()}; ${v} ${up ? '<=' : '>='} ${b.trim()}; ${v} += ${st}) {`;
    });
  code = code.replace(/\bfor\s+_\s*,\s*([A-Za-z_]\w*)\s+in\s+ipairs\(([^)]*)\)\s+do\b/g,
    (_, v, t) => `for (const ${v} of ${t}) {`);
  code = code.replace(/\bfor\s+([A-Za-z_]\w*)\s+in\s+ipairs\(([^)]*)\)\s+do\b/g,
    (_, v, t) => `for (const ${v} of ${t}) {`);
  code = code.replace(/\bfor\s+([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s+in\s+pairs\(([^)]*)\)\s+do\b/g,
    (_, k, v, t) => `for (const ${k} in ${t}) { const ${v} = ${t}[${k}];`); // end's } closes it

  // ---- one-word operators & keywords ----
  code = code
    .replace(/\blocal\s+function\b/g, 'function')
    .replace(/\blocal\b/g, 'let')
    .replace(/\bnil\b/g, 'null')
    .replace(/~=/g, '!=')
    .replace(/\band\b/g, '&&')
    .replace(/\bor\b/g, '||')
    .replace(/\bnot\s+/g, '!')
    .replace(/\bprint\b/g, 'log')
    .replace(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*$/gm, 'function $1($2) {');
  // Lua uses `then`, `do`, `end`, `repeat`, `until`; elseif/else via placeholders
  // so generated "else" text is never re-matched.
  code = code
    .replace(/\bthen\b/g, '{')
    .replace(/\bdo\b/g, '{')
    .replace(/^(\s*)elseif\s+([^\n]+?)\s*\{\s*$/gm, '$1\u0002EI $2\u0002')
    .replace(/^(\s*)else\s*$/gm, '$1\u0002EL\u0002')
    .replace(/\u0002EI\s+(.*?)\u0002/g, '} else if ($1) {')
    .replace(/\u0002EL\u0002/g, '} else {')
    .replace(/\brepeat\b/g, 'do {')
    .replace(/\buntil\s+([^\n{}]+?)\s*$/gm, '} while (!($1));')
    .replace(/\bend\b/g, '}');

  // wrap bare if/while conditions in parens: "if x > 5 {" → "if (x > 5) {"
  code = code.replace(/^(\s*)if\s+([^\n{]+?)\s*\{/gm, '$1if ($2) {');
  code = code.replace(/^(\s*)while\s+([^\n{]+?)\s*\{/gm, '$1while ($2) {');

  // ---- concat & length ----
  code = code.replace(/\.\.(?=\s*\S)/g, m => m) // placeholder pass
    .replace(/(\s*)\.\.\s*/g, (m, sp) => (m.includes('...') ? m : ' + '));
  code = code.replace(/#([A-Za-z_$][\w$.]*(?:\([^)]*\))?(?:\.[A-Za-z_$][\w$]*)*)/g, '($1).length');

  // ---- Lua standard library bits ----
  code = code
    .replace(/\bmath\.ceil\b/g, 'Math.ceil')
    .replace(/\bmath\.floor\b/g, 'Math.floor')
    .replace(/\bmath\.abs\b/g, 'Math.abs')
    .replace(/\bmath\.sqrt\b/g, 'Math.sqrt')
    .replace(/\bmath\.round\b/g, 'Math.round')
    .replace(/\bmath\.max\b/g, 'Math.max')
    .replace(/\bmath\.min\b/g, 'Math.min')
    .replace(/\bmath\.random\s*\(([^,()]+)\s*,\s*([^)]+)\)/g, 'randInt($1, $2)') // Lua's math.random(a,b) = integer in [a,b]
    .replace(/\bmath\.random\b/g, 'Math.random')
    .replace(/\btable\.insert\(\s*([^,]+?)\s*,\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/g, '$1.splice(($2) - 1, 0, $3)') // 3-arg: insert at position (1-based)
    .replace(/\btable\.insert\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/g, '$1.push($2)')
    .replace(/\btable\.remove\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/g, '$1.splice(($2) - 1, 1)[0]') // 2-arg: remove at position
    .replace(/\btable\.remove\(\s*([^)]+?)\s*\)/g, '$1.pop()');

  // ---- Lua-style blocking wait ----
  code = code.replace(/\bwait\(/g, 'await wait(');

  // ---- restore strings; Lua string escapes are close enough to JS ----
  code = code.replace(/\u0001(\d+)\u0001/g, (_, i) => strings[Number(i)]);

  return code;
}

/** {1, 2, 3} list tables → arrays; {k = v} hash tables → {k: v} objects. */
function convertTables(code) {
  let out = '';
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c !== '{') { out += c; continue; }
    let depth = 1, j = i + 1;
    while (j < code.length && depth) {
      if (code[j] === '{') depth++;
      else if (code[j] === '}') depth--;
      j++;
    }
    const inner = code.slice(i + 1, j - 1);
    const isHash = /(^|[,;{\s(])[^\s=!,<>()+*\/\-]+\s*=(?!=)/.test(inner) || /\[[^\]]+\]\s*=/.test(inner);
    if (inner.trim() === '') {
      out += code.slice(i, j);
    } else if (isHash) {
      const objBody = inner
        .replace(/\[([^\]]+)\]\s*=(?!=)/g, '[$1]: ')
        .replace(/(^|[,\s])([A-Za-z_$][\w$]*)\s*=(?!=)/g, '$1$2: ');
      out += '{' + objBody + '}';
    } else {
      out += '[' + inner + ']';
    }
    i = j - 1;
  }
  return out;
}
