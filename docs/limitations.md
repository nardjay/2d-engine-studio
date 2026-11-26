# Limitations & Improvements — the full checklist

You listed 55 things a scripting system should cover. Honest status, today:

| # | Feature | Status | Notes |
|---|---|---|---|
| 1 | Variables | ✅ | `local x = 5` / `let x = 5`; game vars via `get/set` |
| 2 | Constants | ✅ | `const` (JS) / convention `LOCAL_CAPS` (Lua) |
| 3 | Numbers | ✅ | floats + ints, operators, `math.*` |
| 4 | Strings | ✅ | quotes, `..` concat (Lua), `+`/template strings (JS) |
| 5 | Booleans | ✅ | true/false/nil |
| 6 | Arrays | ✅ | Lua `{1,2,3}` → JS arrays |
| 7 | Lists | ✅ | same; `table.insert`, loops, `.length`/`#` |
| 8 | Dictionaries | ✅ | hash tables `{k = v}` / JS objects |
| 9 | Operators | ✅ | `+ - * / == ~= and or not < <= > >=` |
| 10 | Math operations | ✅ | operators + `math.ceil/floor/abs/sqrt/min/max/round` + `clamp/pick/rand/randInt/chance` API |
| 11 | Conditions | ✅ | `if / elseif / else / end` |
| 12 | Loops | ✅ | `while do`, `for i = a, b, step`, `for … in ipairs/pairs`, `repeat … until` |
| 13 | Functions | ✅ | `function name(a, b) … end` |
| 14 | Return values | ✅ | `return` (single value; multi-return not supported) |
| 15 | Comments | ✅ | `--`, `--[[ ]]`, `//`, `/* */` |
| 16 | Object references | ✅ | `obj("Name")`, `objects()`, `self` |
| 17 | Object properties | ✅ | read/write live: `self.x`, `obj("Ball").bg` |
| 18 | Object creation | ✅ | `spawn("shape", {...})` at runtime |
| 19 | Object deletion | ✅ | `destroy("Name")` |
| 20 | Object cloning | ✅ | `clone("Ball")` — deep copy incl. scripts |
| 21 | Event handling | ✅ | script hooks (On create/Update/Click) + visual Events panel |
| 22 | Button click events | ✅ | `On click` hook, cancel(), purchase system |
| 23 | Hover events | ✅ | **On hover** / **On unhover** script hooks (hit-tested, survive rebuilds) |
| 24 | Game start events | ✅ | Game → On start |
| 25 | Game update events | ✅ | Game → On update (dt, time) |
| 26 | Value changed events | ✅ | `changed("Var")` edge check in update scripts |
| 27 | Custom events | ⚠️ | no `fire("name")` bus yet — vars+update polling works |
| 28 | Signals | ❌ | same as 27 — planned |
| 29 | Timers | ✅ | Timer objects + `timerStart/Stop/Set`, `obj("Clock").seconds` |
| 30 | Delays | ✅ | `wait(1.5)` / `await wait(1.5)` — blocks only that script |
| 31 | Random numbers | ✅ | `rand`, `randInt`, `chance`, `pick` |
| 32 | Animations | ⚠️ | code-driven: lerp with `dt` (see Dodge/Whack), tween helpers not built; no sprite flipbooks |
| 33 | Sound playback | ✅ | `play("name")` with uploaded mp3/wav assets + `beep()` synth |
| 34 | UI manipulation | ✅ | every object is UI: setText/setColor/move/hide/spawn |
| 35 | Text manipulation | ✅ | full JS string methods work on strings |
| 36 | Color manipulation | ✅ | setColor/setTextColor, any CSS color |
| 37 | Visibility control | ✅ | visible prop, hide/show/toggleVisible |
| 38 | Position control | ✅ | x/y props, moveTo/moveBy |
| 39 | Size control | ✅ | w/h props, setSize |
| 40 | Scene management | ✅ | every object has a Scene field; `gotoScene()` switches groups |
| 41 | Scene switching | ✅ | `gotoScene("menu")` / `currentScene()` |
| 42 | Data saving | ✅ | `save("slot", data)` → localStorage per project |
| 43 | Data loading | ✅ | `load("slot")` |
| 44 | Persistent variables | ✅ | via save/load slots |
| 45 | Script communication | ✅ | shared vars + `obj("Other")._state = x` + Game scripts' `self` brain |
| 46 | Debug printing | ✅ | `log()` → Console tab |
| 47 | Warnings | ✅ | `warn()` → Console (orange) |
| 48 | Error handling | ✅ | try/catch (JS), `pcall`/`error` (Lua); broken update-scripts auto-disable instead of killing the game |
| 49 | Custom modules | ❌ | no `require("mymodule")` yet — workaround: put shared code in Game On start, store functions on `self` |
| 50 | Autocomplete support | ✅ | Ctrl+Space: API, keywords, your variables & object names |
| 51 | Syntax highlighting | ✅ | real tokenizer coloring, JS **and** Lua |
| 52 | Code suggestions | ❌ | snippets chips exist (JS); full suggestions planned |
| 53 | Script debugger | ❌ | hard; Console + auto-disable + error lines is today's tool |
| 54 | Breakpoints | ❌ | planned (pause loop, inspect vars) |
| 55 | Documentation / API reference | ✅ | docs.html + docs/*.md + this checklist |

**All 7 candidates from the last round shipped** (hover+changed events, save/load, clone, autocomplete, sound assets, touching+gravity, scenes). Next candidates:
1. Sprite-sheet animation
2. Camera + worlds bigger than the canvas
3. Full multi-scene editor (per-scene canvas tabs — today scenes are visibility groups)
4. Debugger: breakpoints + pause + watch vars
5. Custom modules / shared code libraries
6. Touch/drag API for mobile
7. Physics: rotation inertia, friction, static bodies

## Why building here takes longer than Godot/Unity
They are 20-year compiled engines with teams; this is a hand-written,
**zero-dependency** engine where every feature must work in the editor, in
Play, AND in the standalone export — usually touching 5–8 files per feature.
The trade-off: nothing is a black box. You can open `luac.js` or `runtime.js`
and change the engine itself. That's something no closed engine offers.

---

## Honest post-mortem: the Flappy Bird bug hunt

You said the pipes were missing and the fly "sucked". Testing found three real
problems — two in the engine, one in the template:

1. **Engine bug (fixed): `pressed("space")` never fired.** The runtime stored the
   spacebar as `" "`, so every game checking `pressed("space")` silently lost all
   keyboard input. Keys are now normalized (`" "` and `"Spacebar"` → `"space"`).
2. **Engine limitation (browser behavior): background tabs freeze the game loop.**
   `requestAnimationFrame` stops when a tab is hidden — correct browser behavior,
   but it means a hidden preview tab shows "no pipes" because zero frames ran.
3. **Template bug (fixed): the v1 design was bad.** Pipes spawned off-screen at
   x=980 behind a menu that only started if you clicked a *falling 40px bird* —
   and with bug #1, Space couldn't save you. Projects saved before the fix keep
   the broken scene; the template change only applies to newly created projects,
   so the stored Flappy project was rebuilt from the fixed version.

**Testing lesson:** the first headless test harness pumped frames manually, which
hid bug #1 entirely (it synthesized input state instead of dispatching real
KeyboardEvents). Real-browser testing with actual key/click events is the only
honest verification. The runtime now exposes itself as `window.__rt` for exactly
this kind of inspection.

## Known limitations (the honest list)

- **DOM rendering, not canvas/WebGL** — hundreds of moving objects get heavy;
  hit-testing is axis-aligned boxes only (rotated objects have square-ish hitboxes)
- **No z-index UI** — overlap order is creation order (use `bring()`)
- **Scripts run in the page context** — a game script could touch editor state;
  fine for personal use, not a security boundary
- **`wait()` in per-object scripts has no cancel** — game-wide waits stop with
  the runtime, object-level ones can outlive a quick stop/start
- **Audio = WebAudio beeps + imported files** — no mixer, effects, or streaming
- **Exported HTML inlines everything** — large asset libraries make big files
- **No touch-drag, gamepad, or accelerometer APIs** yet (roadmap)
- **No sprite flipbook animation** — static images only (roadmap #1)
- **A script that throws every frame is caught but spams the console** —
  the guard keeps the game alive; it doesn't fix the code

## Fixed engine bugs log

| Bug | Symptom | Fix |
|---|---|---|
| `runtime.js` was a copy of `workspace.js` | Play did nothing | Rebuilt `GameRuntime` |
| `hierarchy.js` empty (0 bytes) | No Explorer panel | Rebuilt Hierarchy |
| `addObject()` didn't re-render | New objects invisible until refresh | Call `workspace.render()` |
| `pressed("space")` never matched | Space input dead in all games | Normalize key names |
| `obj("name")` broke on handles | `obj(self)` threw | Accept objects with `.id` |
| Spawned objects invisible | `refreshDynamic` skipped no-op position updates | Rebuild on membership change |
| Hover events lost on respawn | `On hover` died after `destroy`/`spawn` | Stage hit-testing instead of DOM listeners |
| `setText()` ignored on counters | Status text never changed | Counter honors whole-line override |
| Duplicate inspector section ("Button") | Two identical headers | Renamed to "Button Settings" |

### Batch-2 game bugs (XO / Snake / Pong / Memory / Breakout)

| Bug | Symptom | Fix |
|---|---|---|
| `mouse` was `null` until first mousemove | Pong/Breakout crashed "reading 'y'/'x'" on frame 1 | `mouse` always exists from mount; mutate in place |
| `restart` declared but never implemented | Snake: "restart is not a function" | Added `restart()` to the API object (replay from On start) |
| No `mouseup` listener | `mouse.down` stuck true forever after first click | mouseup on stage + window clears `down` |
| "On update" error message said "paused" but it kept running | Console spam every frame | Retry counter; disable after 5 bad frames with a clear message; Reset re-arms it |
| Click scripts' `self` used as shared state | XO board dead; Memory "same cards didn't match" | Shared state moved to a hidden Brain object (documented pattern) |
| Stale saved projects after template fixes | Memory behaved like the old buggy version | Rebuilt all 6 game projects from fixed templates |

**Testing lesson (again):** my first harness pre-initialized `g.mouse`, which hid the
null-mouse crash — the user's machine hit it immediately. A harness must never
set up state the engine is supposed to create itself.

### Shapes & Lua audit (v1.4)

| Issue | Was | Now |
|---|---|---|
| Shape variety | rect + ellipse only (triangle in model but never rendered!) | 8 kinds: rect, ellipse, triangle, diamond, pentagon, hexagon, star, arrow |
| `touching()` between round shapes | box corners counted as "touching" | true circle-vs-circle math for ellipse pairs; hover respects the curve too |
| Lua `math.random(1, 10)` | compiled to `Math.random` → returned 0–1, silently wrong | compiles to `randInt(1, 10)` |
| Lua `table.insert(t, i, v)` / `table.remove(t, i)` | produced broken JS | positional insert/remove (1-based, like real Lua) |
| Dashboard hero on narrow screens | fixed padding, title overflowed | fluid `clamp()` padding + font sizes |

### Batch-3: save system, export, performance, assets, text (v1.5)

| Issue | Was | Now |
|---|---|---|
| Grid "sometimes not working" | `render()` wrote the `background` shorthand, wiping the grid's `backgroundImage` | `backgroundColor` only — grid survives every render |
| Refresh → back to dashboard | no session memory | last-opened project id stored; refresh reopens the editor (dashboard clears it explicitly) |
| Unsaved edits lost on refresh | 900ms autosave debounce could be mid-flight | `beforeunload` flushes pending autosave |
| "All are gone" scare | my test scripts deleted/recreated projects by name | projects are rebuilt only when fixing a template; nothing else removes them; save-state chip shows Saved/Saving/Unsaved |
| Export too long | full commented engine inlined (~130 KB) | column-0 comments + blank runs stripped → ~90 KB, verified boots & plays in iframe |
| Export "objects not implemented" | unverified | coin template clicked in exported HTML → counter increments ✓ |
| Runtime re-rendered EVERY node every frame | 400 objects ≈ 2.7ms/frame + duplicate DOM nodes during a mid-fix state | incremental `refreshDynamic`: content-signature diff, style-write fast path, `replaceWith` for changes — 400 objects now ~1.8ms/frame, DOM node count == object count exactly |
| Editor drag rebuilt whole scene | every nudge/resize = full DOM churn | `updateNode` fast path for transform-only changes |
| Lua speed question | — | measured: compile 0.03 ms/script (once, cached), run 0.006 ms/frame = native JS |
| Lua `math.random(a,b)` | compiled to `Math.random` (0–1) | compiles to `randInt(a,b)` ✓ |
| Assets | import buttons only | drop files on the panel, drag asset cards onto the canvas to create images, size shown per asset, images auto-downscaled to ≤1024px & re-compressed on import |
| Text styling | bold/italic only | Roblox-style: 7 font families, underline/strike/shadow (+colors), letter spacing, line height, outline (stroke) width+color — works in editor, Play AND export (shared renderer) |
| Hero said "JavaScript" only | — | "JavaScript & Lua" |

### Batch-4: API performance + editor UX (v1.6)

- `obj()` is now **O(1)** via a lazily-rebuilt name/id index (invalidated on spawn/destroy/
  clone/rename/reset). Measured: 20,000 lookups/frame = 0.12 ms. Lua transpiler untouched.
- Properties panel no longer contradicts itself: shows "**Editing: Canvas**" context.
- Bottom dock default 216→150px (still draggable), empty Variables state centers its button.
- Status bar trimmed to selection + EDITING/RUNNING (count/zoom were duplicates).
- Shape palette icon is now actual shapes; Events tab explains itself; language dropdown
  widened (was truncating "JavaScript").
- Docs: perf caching note, shadowing warning, JS-vs-Lua `setText` examples, dot-vs-colon,
  async `wait()` explanation, `spawn()` live-handle return, `pcall` example (docs.html +
  docs/scripting-api.md + docs/lua.md).

### v1.7: Camera, Triggers, Emitters + Sky Runner (the complex game)

**New engine features (generic, API-only — no game logic in the engine):**
- `cam.follow/unfollow/moveTo/shake/x/y` — world larger than the view (Settings → World
  width/height), smooth follow, decaying shake, **automatic viewport culling**
- **Trigger Zone** object + On enter/On exit hooks + `other` handle
- **Emitter** object + `emit(x, y, n, opts)` burst API — pooled particles, hard cap 260
- `view()` — world/viewport sizes

**Sky Runner template** — platformer proving all of it: 3200px world, parallax, HUD
pinned to camera, gaps + moving platform that carries the hero, coins with bursts,
spike triggers, checkpoint triggers rewriting the respawn point, patrolling enemies,
pit deaths, torch/fountain emitters, saved best. Cleared by autopilot in 15s.

**Optimizations measured:** runner frame cost 0.57 → **0.33 ms** (script surface/coin
caching + culling); 26/41 nodes hidden off-screen mid-world.

**New bugs this round (fixed):** `runHookScripts` referenced a closure-local `live`
→ hoisted to a proper class method; culling initially lived in the dirty-only refresh
(moved into the per-frame camera tick).

**Still true:** culling is box-based (no rotation), particles are DOM divs (260 cap),
camera has no zoom yet, no physics engine beyond AABB + gravity.

### v1.8 batch: scenes-for-real, groups, touch, multi-delete fix

- **Multi-delete bug (user-reported)**: the Explorer trash button deleted only its own
  row even with several objects selected → now delegates to deleteSelection when the
  row is part of a multi-selection.
- **Cube Rush error (user-reported)**: the saved project kept the pre-fix script with a
  raw newline inside a string ('\n eaten by the template literal'). Template was already
  fixed; the stored project was re-registered from the fixed template. Lesson: when a
  template builder changes, refresh stored copies too.
- Scenes: normalizeProject migrates old scene-name strings into real scene records
  (name/size/background); 'main' is only forced when no objects exist.
- Touch events feed mouse.x/y/down — no game changes needed for mobile.
- Still true: no multiplayer, no tilemap, no breakpoints, 260-particle cap.

### v1.9 batch: 8 games + editor upgrades

- multi-delete: BOTH remaining single-delete paths (Explorer trash row, right-click
  menu) now honor the full selection.
- watersort crash was a TDZ bug in the template script (colors defined after first
  use) — template scripts get the same review as engine code.
- flowfree tail detection: chain-walk from the start endpoint (naive degree scan
  picked the far endpoint).
- blockblast: refill/checkDead moved onto the Brain object — scripts are separate
  scopes; helpers shared between scripts must live on an object (documented pattern).
- stack: needed worldHeight (camera clamps to world).
- Chess is "lite": no castling/en-passant/check-detection — king capture ends it.
- console dedupe: identical consecutive lines collapse ×N; render throttled 180ms.

## v2.0 — 2026-11-24 — Templates removed (release scope change)

- All 26 game templates and the hidden Warp Zone were deleted from the product
  (`js/games2-5.js`, `TEMPLATES`, `createTemplate`, dashboard gallery, Konami unlock).
  The editor is the deliverable; games are what users build.
- Docs re-aimed: docs.html "Ideas to build" replaces the template table;
  getting-started/lua/README no longer reference premade games.
- Historical entries ABOVE still mention templates — they are the development log,
  kept intact for honesty. They describe features that no longer ship.
- Engine fixes that shipped with this change:
  - `editor.js updateObject`: group rotation delta coerced (`rotation || 0`) —
    undefined rotation on fresh objects produced NaN and poisoned group members.
  - `model.js createObject`: `rotation/z/rotX/rotY` now default to 0 on creation.
  - runtime scene system: `persist` objects, boot-time scene filter (silent),
    scene-entry depenetration, spawn-into-active-scene (all verified in audit).

## v2.1 — 2026-11-24 — Release-audit fixes

- LICENSE (MIT) added; .gitignore added; repository got its first commit.
- Toggle objects on NUMBER variables now flip 0 ⇄ 1 (switch lights up) instead of
  erroring; text-bound toggles still report. (`runtime.js flipToggle`, `render.js` switch class)
- Explorer windowing: projects with >300 loose objects render the first 300 with a
  "Show all" footer; searching shows every match. Fixes slow panel opens on huge scenes. (`hierarchy.js`)
- README + docs.html: distribution & security notes, incl. the `new Function` /
  CSP `unsafe-eval` caveat for hosting exported games.
- Correction to audit §7: asset size caps DID exist (8 MB images/audio, images
  auto-downscaled to ≤1024 px) — "no cap" claim was wrong.

## v2.2 — 2026-11-24 — No-Python launcher + data features

- `serve.ps1`: dependency-free PowerShell static server (HttpListener) on
  127.0.0.1 only; sends `Cache-Control: no-store` (fixes stale-page reports),
  blocks path traversal (403) and `.git` (404); verified by live curl tests.
- `start.bat` rewritten: PowerShell first, Python only as fallback.
- Dashboard: **Data ▾** menu — download ALL projects as one JSON, import a JSON
  backup (same-id imports get fresh ids, never clobber), delete all projects.
- Dashboard: **Download Game** button on every card + right-click menu
  (standalone .html, no editor needed). Verified end-to-end ("showcase.html").
- Getting-started/README: file:// does not work in Chrome/Edge (ES modules);
  always launch with start.bat or any static server.

## v2.3 — 2026-11-26 — Security hardening, Handbook docs, 3D easter egg
- **Server security**: `serve.ps1` now rejects drive-letter/colon paths and NUL bytes (400),
  URL-encoded traversal verified blocked (403) — tested against 9 attack patterns including
  `/C:/Windows/win.ini` (was 200-empty, now 400) and double-encoded `%252e`.
- **Prototype pollution audit**: `{...raw}` spreads keep `__proto__` as an inert own property;
  `Object.assign` on settings can only reparent that one object. No global-proto vector found;
  documented rather than churned.
- **Runtime spam guard**: `onUpdate` disable threshold changed `=== 5` → `>= 5` (can't be
  skipped), and `resetState()` now actually clears `_gameUpdateBroken` / `_gameUpdateErrors` /
  per-script `_broken` flags — the "press Reset" console hint finally does what it says.
  (Trigger: user console showed ×2679 error spam from a stale tab running pre-guard code.)
- **Docs rebuilt as "The Handbook"**: school-style chapters (Grade 1 Beginner → Grade 4 Ship
  it, Electives, Reference), starting with *What is 2D Engine Studio?*; license chapter embeds
  the real LICENSE file; API cheat sheet page. No quizzes (user veto, correctly).
- **3D easter egg restored**: Konami code anywhere in the app → spinning CSS-3D cube overlay
  advertising the real rotX/rotY/z object properties; unlock remembered in localStorage.
  Documented under docs → Electives → The Rumor.

## v2.4 — 2026-11-26 — Handbook v2: complete, verified, credited, publishing
- **Docs honesty incident (found by user: "documentation is too weak")**: the previous
  docs.html documented `collide() / hits() / onGround() / vel()` and JS `print()` —
  **these functions do not exist** in the runtime. They were written from memory, not source.
  Full API dumped from `runtime.js` (`scriptApi` keys) and every hook's `extra` payload
  probed live: real collision fn is `touching(a,b)`; game hooks receive `other`
  (onKey = key name, onClick = clicked object, onScene = scene name); console fn is `log`
  (Lua `print` auto-maps to it); `self` exists in ALL scripts (game-level = Game brain object).
- **Handbook rebuilt (22 chapters, 9 parts)**: every field of every object type, the COMPLETE
  verified API, event-block action list, Lua mapping, physics model incl. bounce energy
  numbers + respawn recycling, camera/world/stage + persp, scene boot order, groups,
  particles cap, assets/embedding, **Exporting AND a new Publishing chapter**
  (itch.io step-by-step, GitHub + Pages, file distribution, branding), limitations incl.
  the doc-accuracy lesson.
- **Credit**: Jaynard (@nardjay) added to docs header + footer +
  License chapter, README author line, and the LICENSE copyright itself
  (was "contributors").
