# Getting Started — 5 minutes to your first game

## 1. Open the engine
Run `py -m http.server 8000 --bind 127.0.0.1` in the engine folder and open
<http://localhost:8000> (or just double-click `index.html`).

## 2. Create a project
Click **New Project**, name it, and you are in the editor with a blank canvas.
The palette on the left has every object type — drag one onto the canvas.

## 3. Build the scene
- Drag objects from the palette onto the canvas (or use the + buttons).
- Click an object to select; drag to move; Shift+click to multi-select.
- Right-click anything for actions (duplicate, rename, delete, align…).
- The Properties panel on the right edits the selected object: size, colors,
  rotation, bold/italic, text, and type-specific settings.
- Mouse wheel zooms smoothly at your cursor; the dropdown sets exact zoom %.
  Drag the thin dividers to resize the panels (double-click = reset).

## 4. Add behavior with code
In the Explorer, click **+** on an object → **Add Script**:

| Hook | When it runs |
|---|---|
| **On create** | once, when Play starts |
| **Every frame** | ~60×/s — use `dt` for smooth motion |
| **On click** | when clicked in the Game tab |

The **Game** node has **On start** / **On update** for game-wide logic.

Example — a bouncing ball (shape called "Ball", hook *Every frame*):

```js
self.x += self.vx * dt;
self.y += self.vy * dt;
if (self.x < 0 || self.x > 900) self.vx = -self.vx;
if (self.y < 0 || self.y > 500) self.vy = -self.vy;
```

…with On create: `self.vx = 220; self.vy = 160;`

You don't need to pre-create variables: `set("Score", 0)` makes the variable.
Show it anywhere: a text object with `Score: {{Score}}`, or a counter object.

## 5. Play, test, share
- **▶** runs the game in the Game tab; **Console** shows `log()` and errors.
- Errors in an *Every frame* script disable only that script, not your game.
- The **upload** button in the top bar exports a **single standalone .html file**
  — send it to anyone, it runs in any browser with no server.

Next: read [scripting-api.md](scripting-api.md) — every command in one page.
