# Object Types

Every object has: position (x, y), size (w, h), layer, rotation, opacity,
visibility, and can hold any number of script children.

## button
Clickable. Optional shop behavior: set **Cost variable** + **Cost amount** —
in Play it auto-checks the variable, deducts the cost, and fires purchase
events. `cancel()` in a click script skips that.

## text

Rich styling (Inspector → Text): **Bold / Italic / Underline / Strike / Shadow** (+shadow color),
7 font families (Default, Arcade pixel, Rounded, Serif, Monospace, Impact, Cursive),
letter spacing, line height, and **outline** (stroke width + color) — Roblox-Studio-style.
All of it renders identically in Scene view, Play, and the standalone export.
Supports `{{VariableName}}` interpolation — updates live every frame.

## image
Shows an asset (Assets panel → upload PNG/JPG/SVG). Fit: cover / contain / stretch.

## panel
Box for backgrounds and UI frames. Color, border, radius.

## shape
`rect` / `ellipse` / `triangle`. The workhorse for players, balls, enemies,
particles. Color + rotation + opacity.

## progressbar
Visualizes a variable between 0 and Max. HP bars, XP bars, loading bars.

## counter
Number readout bound to a variable, with prefix/suffix.
`setText("CoinLabel", "GAME OVER")` replaces the whole readout.

## timer
Countdown or stopwatch displayed `m:ss`. Properties: seconds, auto-start.
Code: `timerStart/Stop/Set("Clock", …)` and `obj("Clock").seconds`.

## input / slider / toggle
Player data entry, each bound to a variable. In Play, typing in them updates
the variable instantly; read with `get("Name")`.

## Layers
`layer` controls draw order (low = back). `bring("Ball")` in code = top layer.


## trigger
Invisible box that watches one target object (by name). Script hooks **On enter** /
**On exit** fire when it crosses in/out; inside those scripts `other` is the target.
Spikes, checkpoints, doors, boss arenas.

## emitter
Continuous particle fountain. Fields: particles/sec, lifetime, speed, angle, spread,
size, gravity, colors (comma list), running. Particles are pooled DOM dots capped at
260 — cheap. For one-shot bursts from any script use `emit(x, y, count, opts)`.
