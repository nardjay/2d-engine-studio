# Script API Reference

All names below are available inside every script — no imports. Scripts are
**async**: `await wait(2)` works and the game keeps running while you wait.

## Variables

| Command | Example | Notes |
|---|---|---|
| `get(name)` | `get("Coins")` | read |
| `set(name, v)` | `set("Coins", 50)` | **creates the variable if missing** |
| `add(name, n)` / `subtract(name, n)` | `add("Score", 10)` | ± |
| `multiply(name, n)` | `multiply("Power", 2)` | × |
| `increase(name)` / `decrease(name)` | `increase("Level")` | +1 / −1 |
| `toggleVar(name)` | `toggleVar("Paused")` | flip boolean |
| `vars()` | `log(vars())` | snapshot object |

## Objects — find

| Command | Notes |
|---|---|
| `obj("Ball")` | live handle by name or id — read/write any property |
| `objects()` | array of all live objects (loops!) |

## Objects — act

```js
hide("Ball"); show("Ball"); toggleVisible("Ball");
setText("Label", "Score " + get("Score"));   // counters: replaces whole readout
moveTo("Ball", 100, 200);  moveBy("Ball", 10, 0);
setSize("Ball", 80, 80);
setProperty("Ball", "rotation", 45);          // any property by name
setColor("Btn", "#ff5555");  setTextColor("Lbl", "#fff");  setOpacity("Ghost", 0.4);
bring("Ball");                                 // top layer
const rock = spawn("shape", { x: 40, y: -30, w: 30, kind: "ellipse", bg: "red" });
destroy(rock);  destroy("Bullet3");
```

`spawn` types: `button text image panel shape progressbar counter timer input slider toggle`.
Anything you set on a handle (`rock._vy = 200`) persists on the object — perfect
for custom state.

## Timers

```js
timerStart("Clock"); timerStop("Clock"); timerSet("Clock", 30);
const left = obj("Clock").seconds;
```

## Keyboard

```js
if (key("arrowleft") || key("a")) self.x -= 300 * dt;  // held down
if (pressed("space")) jump();                           // edge: true once per press
```
Lowercase names: letters, digits, `space enter escape shift control
arrowup arrowdown arrowleft arrowright`. Keys pressed while typing in the code
editor never reach the game.

## Sound, flow, math

| Command | Notes |
|---|---|
| `beep(440, 80)` | tone: Hz, ms. No audio files needed |
| `await wait(1.5)` | pause this script only |
| `cancel()` | in *On click*: skips events & button purchase |
| `log(x)` | Console tab |
| `rand(1, 6)` / `randInt(1, 6)` | float / int in range |
| `chance(0.25)` | true 25% of calls |
| `pick(["a","b"])` | random element |
| `clamp(v, 0, 100)` | keep in range |

## Frame data

| Name | Meaning |
|---|---|
| `dt` | seconds since last frame (~0.016) — always multiply movement by it |
| `time` | seconds since Play started |
| `self` | the object owning the script. In **Game** scripts it's a shared "brain" object that keeps custom fields across frames (`self._nextMole = 3;`) |

Writable on `self`/handles: `x y w h text visible opacity rotation bg color
seconds running` + anything custom.

## Patterns

**State machine** (one script, no events needed):
```js
if (get("State") === "menu" && pressed("enter")) set("State", "play");
```

**Enemy spawner with difficulty ramp** (Game → On update):
```js
self._t = (self._t || 0) - dt;
if (self._t <= 0) {
  self._t = Math.max(0.2, 1 - time * 0.01);      // faster over time
  const e = spawn("shape", { x: rand(0, 900), y: -30, w: 30, h: 30 });
  e._vy = rand(100, 200) + time;
}
for (const o of objects()) {
  if (!o._vy) continue;
  o.y += o._vy * dt;
  if (o.y > 560) destroy(o);
}
```

**Simple collision**: `Math.abs(a.x - b.x) < 30 && Math.abs(a.y - b.y) < 30`.

## Hover, physics & persistence (new)

| Command | Notes |
|---|---|
| `changed("Coins")` | true the frame a variable changed — check it AFTER the code that changes it |
| `touching("A", "B")` | box collision between two objects |
| `clone("Star")` | deep copy incl. scripts; returns live handle (auto-named Star2, offset +24px) |
| `save(slot, data)` / `load(slot)` | JSON data persisted per project — high scores survive closing the tab |
| `restart()` | replay the game from On start (use on game-over: `if (pressed("space")) restart();`) |
| `gotoScene("menu")` / `currentScene()` | every object has a **Scene** field; gotoScene shows that scene's objects, hides the rest |
| `play("jump", 0.8)` | play an uploaded sound asset (Assets → + Import Sound, mp3/wav) |
| `mouse.x` `mouse.y` `mouse.down` | pointer position in stage coords during Play |

New script hooks: **On hover** / **On unhover** (fire from the stage hit-test, so they work
even while physics rebuilds objects every frame).

New inspector fields on every object: **Gravity** (px/s²), **Vel X/Y** (px/s), **Bounce**
(walls+floor, auto-integrated each frame — a ball needs zero code), **Scene** (name).

**Ctrl+Space** in the script editor = autocomplete over API names, language keywords,
your variables and object names.


## Performance best practice

`obj("Name")` uses an O(1) internal index (rebuilt only when objects spawn/destroy/rename).
Still, for hot loops cache the handle outside the loop:

```js
// On start
self.ball = obj("Ball");
// On update — no lookup per frame
self.ball.x += 10 * dt;
```

Lua: `local ball = obj("Ball")` then `ball.x = ball.x + 10 * dt` — the handle stays live.

## ⚠️ Warnings / best practices

- **Never name your own variables/functions after API commands** (`get`, `set`, `obj`,
  `spawn`, `wait`, `time`, `self`, ...). Your declaration shadows the engine command in
  that script scope and causes silent failures.
- `spawn()` **returns a live handle**: `local enemy = spawn("shape", {...}); enemy.x = 50;`
  works immediately — no name lookup needed.
- `setText` example, both languages:
  - JS: `setText("Label", "Hi " + get("Score"))`
  - Lua: `setText("Label", "Hi " .. get("Score"))`


## Camera & particles (v1.7)

| Call | Does |
|---|---|
| `cam.follow("Hero", 8)` | camera tracks an object (handle or name) with smoothing |
| `cam.unfollow()` / `cam.moveTo(x, y)` / `cam.shake(12)` | manual control |
| `cam.x` / `cam.y` | read (or write) camera position — parallax = `far.x = cam.x * 0.35` |
| `emit(x, y, 14, { color: "#ffd76e", speed: 140, life: 0.5, gravity: 300, size: 6, square: true })` | one-shot particle burst at world coords |
| `view()` | `{ width, height, worldWidth, worldHeight }` |
| `other` | inside **On enter / On exit** trigger scripts: the object that crossed |

Settings → GAMEPLAY now has **World width/height** (0 = same as the view). Objects outside
the camera view are culled automatically. HUD trick: reposition labels to `cam.x + n`
each frame (see Sky Runner).

## New objects

- **Trigger Zone** — invisible at Play; set a *Target object* name, add **On enter** /
  **On exit** script children
- **Emitter** — always-on particle source: rate, lifetime, speed, angle, spread, size,
  gravity, csv colors, running toggle

## v1.8 — Real scenes, groups, touch

**Scenes are now real**: each scene has its own **name, size (160×120 → 4096×4096) and
background**. The editor shows scene chips above the canvas — click to edit a scene,
right-click to rename / resize / duplicate / delete. `+` adds one.

```js
gotoScene("Room 2")   // switches canvas size + background + visible objects
view()                // { width, height, scene, scenes: [...] } — current scene's size!
```

A portal between scenes = **Trigger Zone + gotoScene()** — six lines of script.
`mouse.x/y/down` now works with **fingers** too (touch events feed the same API) —
every game is instantly playable on phones, exports included.

**Groups**: select 2+ objects → `Ctrl+G` (must share a scene). Folders appear in the
Explorer: click = select members, double-click = go in (zoom to fit), right-click =
rename / ungroup / delete. `Ctrl+Shift+G` ungroups.

**Layers are out of the closet**: ⤒ ▲ ▼ ⤓ buttons in the Inspector (single + multi
select), right-click menu, and the Explorer shows an `L3` badge on non-zero layers.


## v1.9 — more game scripts, groups, extras

**Game-level scripts (Explorer → Game node)**: On start · On update · **On click**
(anywhere on stage; `other` = clicked object or null) · **On key** (any keydown;
`other` = key name) · **On scene** (after `gotoScene`; `other` = scene name).

**Object extras (Inspector)**: Tags (query with `tagged("enemy")`), Blend mode
(CSS mix-blend-mode), Shadow (any CSS box-shadow), Cursor.

**Editable backgrounds**: color OR any imported image asset — Settings modal and
each scene chip right-click → Edit size/background. Scenes now go up to **8192×8192**.

**Explorer**: search box (name/type/script contents), resizable Explorer↔Properties
divider, richer + menu, group folders (Ctrl+G / Ctrl+Shift+G, double-click = go in),
layer badges + ⤒▲▼⤓ buttons.

**Console**: identical consecutive lines collapse to `×N`; re-renders throttled —
per-frame `log()` no longer floods.

**Events**: `→ Script` button converts any block-event into real code you can edit.
