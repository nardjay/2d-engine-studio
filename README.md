# 2D Engine Studio

A web-based 2D game engine with a Unity/Roblox-Studio-style editor. Pure HTML/CSS/JS —
no build step, no dependencies, no install. Open `index.html` (or run a local server) and make games.

**Created by Jaynard Jake Urban Onarag** (@nardjay) — MIT licensed; games you build are 100% yours.

## Run it

Double-click **`start.bat`**. A small PowerShell server (built into Windows — nothing to
install) starts on `127.0.0.1:8000` and opens your browser. Python is no longer
required; `start.bat` still falls back to it automatically.


## Run it

```bash
# easiest: just open index.html in a browser

# better (needed for stable storage + preview):
py -m http.server 8000 --bind 127.0.0.1
# then open http://localhost:8000
```

## What you get

- **Settings** — canvas size & presets, background, grid/snap, master volume, global gravity scale, start scene.
- **Editor** — Explorer (object tree + scripts), Properties, Scene/Game tabs,
  resizable panels (drag the dividers, double-click to reset), zoom dropdown with
  smooth animated wheel zoom, custom right-click menus everywhere, drag-and-drop palette.
- **Objects** — button, text, image, panel, shape, progress bar, counter, timer,
  input, slider, toggle. Rotation, bold/italic, colors, opacity.
- **Scripts** — Roblox-style script children per object (`On create`, `Every frame`,
  `On click`) plus game-wide `On start` / `On update`, with a syntax-colored editor.
- **Two languages** — every script tab switches between JavaScript and **Lua** (a real Lua-subset compiler ships inside the engine and the export)
- **Two languages** — every script tab switches between JavaScript and **Lua**
  (a real Lua-subset compiler ships inside the engine and inside the export)
- **Script API** — ~40 commands: variables (`get/set/add/subtract/multiply/toggleVar`),
  objects (`hide/show/setText/moveTo/spawn/destroy/setColor/bring/…`), timers,
  keyboard (`key()/pressed()`), sound (`beep()`), async (`await wait(1)`), math
  (`rand/randInt/chance/pick/clamp`). No pre-declaring: `set("Coins", 5)` creates the variable.
- **Game loop** — requestAnimationFrame; `dt` and `time` in update scripts.
- **Systems** — scenes (each with its own size/background), groups, camera with
  follow + shake + culling, trigger zones, particle emitters, CSS 3D (`z/rotX/rotY`),
  gravity/bounce physics, touch input, persistent game saves.
- **Storage** — projects autosave to IndexedDB; Export produces a standalone HTML game.

## Docs

- **[docs.html](docs.html)** — full documentation in one page (open it in the browser).
- [docs/getting-started.md](docs/getting-started.md) — first project in 5 minutes
- [docs/scripting-api.md](docs/scripting-api.md) — every command with examples
- [docs/objects.md](docs/objects.md) — the 11 object types
- [docs/roadmap.md](docs/roadmap.md) — known limits & what's next
- [docs/lua.md](docs/lua.md) — the Lua language guide
- [docs/limitations.md](docs/limitations.md) — the honest checklist + full development log

## Project layout

```
index.html          dashboard + editor shell
docs.html           full documentation
js/model.js         data model, object types
js/render.js        shared object renderer (editor + runtime + export)
js/runtime/         GameRuntime: loop, script API, input, audio
js/editor/          workspace, inspector, hierarchy, script editor, panels
js/exporter.js      standalone HTML export
css/styles.css      all styling
LICENSE             MIT
```

## Distribution & security notes

- **Local-only by design.** `start.bat` serves on `127.0.0.1:8000` (not reachable
  from other devices). Projects and game saves live in your browser storage
  (IndexedDB / localStorage) — nothing is uploaded anywhere; the app makes zero
  external network requests.
- **Exports are standalone HTML files** — no server or runtime dependency. Open
  them straight from disk (`file://`) or host them anywhere.
- **CSP note for web hosting:** the engine is a scripting host — scripts you
  write are compiled and run with `new Function`. If you host an exported game
  behind a Content-Security-Policy, it must allow `'unsafe-eval'` for scripts.
  Hosting on a static file server or opening locally needs no configuration.
- **Trust model:** a project file is like a saved game macro — its scripts run
  with your browser permissions when you press Play. Don't open project files
  from strangers if that concerns you.
- **Dependencies:** none. Any modern evergreen browser (Chrome/Edge/Firefox/Safari)
  and that is it — `start.bat` uses only built-in Windows PowerShell.
