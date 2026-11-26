# Honest Limitations & Roadmap

You asked: *as a tester, what would I need, and why does this take long when
other engines make it easy?* Here is the honest answer.

## What the engine can NOT do yet (today's limits)

| Limitation | Why it hurts | Workaround now |
|---|---|---|
| No physics engine (gravity, joints) | Platformers need tuning by hand | write `self.vy += 900*dt` in an update script |
| Collisions are DIY | no `onTouch` event | distance/box checks in code |
| No sprite sheets / animation | character games look static | swap `image` objects with timers |
| No sound files, only `beep()` | no music | hum along; assets for audio are planned |
| No multi-player, no leaderboards | social games impossible | export is single-player only |
| One canvas, no camera scroll | big worlds need manual `moveTo` math | keep games one-screen |
| No touch input API | mobile games can't read drags | buttons/inputs work on mobile, just no drag API |
| Undo history is capped | deep undo lost | save often (Ctrl+S) |

## Why features take longer here than in Godot/Unity

- **Zero dependencies, zero build tools.** Everything is plain ES modules you
  can read and edit. Godot ships a compiled engine + editor; here the *engine,
  editor, renderer, runtime, exporter and docs are all hand-written JS* — a
  feature usually touches 5–7 of those files (model → inspector → hierarchy →
  runtime → render → export → docs).
- **Everything must survive three paths**: editor canvas, live Play, and the
  standalone export. A property added only to the inspector is a bug factory.
- **No package manager, no TypeScript, no tests** — correctness comes from
  live play-testing each change in the browser (which is what I do every round).

That's the cost. The benefit: you can open any file and change *any* part of
the engine itself — impossible in closed engines.

## Roadmap (next → later)

1. **Collision events** — `onTouch("A", "B")` / `touching("A","B")` helper
2. **Gravity + velocity fields** on objects (`vx`, `vy`, `gravity`, auto-integrated)
3. **Touch/drag API** — `dragging("Ball")`, pointer position
4. **Sprite animation** — flipbook asset + `animate("walk", 0.1)`
5. **Sound assets** — upload mp3/wav, `play("jump")`
6. ~~**Camera**~~ ✅ v1.7 — `cam.follow/shake/x/y`, world > canvas, auto culling
   ~~**Trigger zones**~~ ✅ v1.7 — On enter/On exit + `other`
   ~~**Emitter/particles**~~ ✅ v1.7 — Emitter object + `emit()` bursts
7. **Groups/folders** in Explorer + multi-select align
8. **Save/load API in games** — `save("slot1", vars())`, `load("slot1")`
9. ~~Templates~~ — **removed 2026-11-24**: the editor is the product; games are what users make
10. **Tile map** painter for platformers

If you vote with your playtime, tell me which two you want first — the engine
is yours to steer.
