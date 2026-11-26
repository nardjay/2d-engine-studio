# Lua in 2D Engine Studio

**Yes — you can write scripts in Lua now.** Flip the language dropdown in any
script tab from `JavaScript` to `Lua`. The engine compiles your Lua to JS at
Play time (`js/runtime/luac.js`, ~200 lines you can read and edit).

## Why not a *full* Lua VM?
Browsers only run JavaScript. A real Lua interpreter would be a ~600 KB
dependency inside the engine, and this project is deliberately zero-dependency.
A compiler for a practical Lua subset is tiny, fast, debuggable — and every
Lua script still exports to the standalone .html file (the compiler ships inside it).

## Supported language

```lua
-- comments start with two dashes. --[[ block ]] comments too.

local coins = 0            -- variables (local) — or none (globals just work)
local power = 2            -- numbers
local name = "miner"       -- strings, 'or " quotes
local alive = true         -- booleans (nil = nothing/null)

local names = {"a", "b", "c"}          -- array table → JS array
local data  = { hp = 10, ["max hp"] = 99 } -- hash table → JS object

-- operators: + - * / == ~= < <= > >= and or not .. (concat) # (length)
log(coins .. " coins, " .. #names .. " names")

-- conditions
if coins == 0 then
  log("start")
elseif coins < 10 then
  log("early")
else
  log("late")
end

-- loops
for i = 1, 10 do log(i) end
for i = 10, 1, -2 do log(i) end
for v in ipairs(names) do log(v) end
for k, v in pairs(data) do log(k, v) end
local n = 0
repeat n = n + 1 until n >= 3
while n < 6 do n = n + 1 end

-- functions with return values
function earn(times)
  local total = 0
  for i = 1, times do total = total + power end
  return total
end
coins = coins + earn(3)

-- math + tables libraries (subset)
local c = math.ceil(coins * 1.5)
table.insert(names, "d")

-- error handling
local ok, err = pcall(function() error("boom") end)
if not ok then warn("caught: " .. err) end
```

## The engine API works identically in Lua

```lua
-- On click on "Mine"
add("Coins", get("Per click"))
if chance(0.1) then
    add("Coins", 20)
    setText("Status", "BONUS +20!")
    beep(880, 120)
end

-- Every frame on "Ship"
if key("arrowleft") then self.x = self.x - 300 * dt end
if pressed("space") then add("Jumps", 1) end

-- wait blocks only this script, the game keeps running:
wait(1)
moveTo("Ball", randInt(40, 900), randInt(40, 520))
```

All JS API names are available: `get set add subtract multiply increase
decrease toggleVar obj objects hide show toggleVisible setText moveTo moveBy
setSize setProperty setColor setTextColor setOpacity bring spawn destroy
timerStart timerStop timerSet beep wait pick clamp rand randInt chance key
pressed log warn error pcall vars cancel self dt time`.

## Differences from real Lua (honest list)

| Not supported | Use instead |
|---|---|
| `math.random(a, b)` (different semantics) | `rand(a, b)` / `randInt(a, b)` |
| `goto`, coroutines, metatables, `setmetatable` | plain code; engine objects already behave like tables |
| `obj:method()` colon calls | `obj.method(...)` |
| multi-return `a, b = f()` | return a table `{a, b}` |
| `string.format` etc. | string concatenation `..` |
| one-line `if x then y end` | put body on its own lines |
| `..` between two numbers adds them (JS quirk) | `.. "a"` at least one side string, or use `tostring()` |

## Learning by building
Make a clicker in Lua: a Button with an `On click` script
(`add("Coins", 1)`), a Counter on `Coins`, and an Upgrade button with a cost
check. Every command in this guide works from a Lua script tab — set the
language dropdown at the top of the editor.


## Honest Lua limitations

Lua here is a **compiler to JavaScript** (141 lines, regex-based), not a real Lua VM.

**Speed:** zero runtime cost — compiled once per edit (cached), then runs as native JS.
Same speed as JavaScript scripts, always.

**Fixed bugs (v1.4):**
- `math.random(1, 10)` used to compile to `Math.random` (0–1!) — now `randInt(1,10)`
- `table.insert(t, 3, v)` (insert at position) and `table.remove(t, i)` now work

**Still unsupported — the compiler will produce broken JS, so avoid these:**
- metatables, `setmetatable`, `__index` / operator overloading
- coroutines, `yield`, `resume`
- multiple return values (`local a, b = f()`) and varargs (`...`)
- `goto`/`label`, one-line semicolons in odd places
- `string.format/gsub/gmatch/sub`, `tonumber`, `tostring`, `os.*`, `require`
- mixed tables (list + hash in one `{}`)
- `#t` on hash tables (returns undefined — use `len(t)`… actually count keys yourself)
- `a .. b` compiles to `a + b`: fine when at least one side is a string;
  `1 .. 2` gives 3, not "12" — write `"1" .. 2` if you need text

**Compiler errors:** if a Lua script fails to compile, the Console shows
`Lua compile error: ...` and the script is skipped — other scripts keep running.


## Dot vs colon (why `obj("Ball").x` and not `obj("Ball"):x()`)

Engine objects are **JS objects under the hood**, so property access and method calls use
plain **dot notation** in Lua too: `self.x`, `obj("Ball").visible = false`,
`brain.setup()`. Standard Lua colon syntax (`t:method()`) is not required and not
translated — dots give you exact parity with the JavaScript API.

## wait() is async, not blocking

`wait(1)` compiles to `await wait(1)`: it pauses **only that one script** while the game
loop keeps running at 60fps. Other objects, physics, and other scripts are unaffected.

## pcall debugging example

```lua
local ok, err = pcall(function() set("Coins", "invalid") end)
if not ok then log("Script Error: " .. err) end
```
