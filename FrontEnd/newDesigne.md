# PROMPT: SAMP Dispatch Terminal — Full UI Redesign

## CONTEXT

You are redesigning a **police dispatch terminal** for a GTA San Andreas Multiplayer (SAMP) roleplay server. This is a **real working web application** used by dispatchers to coordinate police units in real time. It must feel like a **1990s military-grade CRT terminal** — not a modern SaaS dashboard, not a generic dark UI. Think: old amber phosphor monitor, DOS-era software, classified government terminal.

---

## TECH STACK

- **React** (functional components + hooks)
- **No UI libraries** — pure inline styles or a single CSS file
- **No Tailwind, no MUI, no Chakra**
- Font: `Share Tech Mono` from Google Fonts (import in index.html or via @import)
- All state via `useState` / `useReducer`
- Routing: `react-router-dom` v6 (or simple state-based routing if no router installed)

---

## COLOR PALETTE — HIGH CONTRAST

Use these exact values. No deviations.

```
--bg-base:       #020304   /* near-black, cold tint */
--bg-panel:      #060a0e   /* panel background */
--bg-header:     #0a1018   /* panel headers, top bar */

--primary:       #00ff41   /* matrix green — main text, active elements */
--primary-dim:   #007a1f   /* secondary green text, borders */
--primary-lo:    #003d10   /* very dim green — separators, inactive */

--accent:        #00e5ff   /* cyan — selected items, live indicators */
--accent-dim:    #006b78   /* dim cyan */

--danger:        #ff2020   /* HIGH priority, alerts, pursuit */
--danger-dim:    #6b0000   /* danger borders, backgrounds */

--warn:          #ffaa00   /* MED priority, busy status */
--warn-dim:      #6b4500   /* warn borders */

--off:           #1a2a1a   /* OFF DUTY units, disabled states */
--text-muted:    #2a4a2a   /* timestamps, labels, separators */
```

**Rules:**
- Background is always `--bg-base` or `--bg-panel`. Never lighter.
- Active / selected elements get `--primary` text + `--primary-dim` left border (3px).
- PURSUIT status always renders in `--danger` with a blinking dot.
- Never use white. Never use pure gray. Everything is tinted green or cyan.

---

## CRT VISUAL EFFECTS (apply to root wrapper)

```css
/* 1. Scanlines — fixed overlay on top of everything */
.crt-scanlines {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  background-image: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.18) 0px,
    rgba(0, 0, 0, 0.18) 1px,
    transparent 1px,
    transparent 4px
  );
}

/* 2. Vignette — edges darker */
.crt-vignette {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9998;
  background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.85) 100%);
}

/* 3. Flicker animation — very subtle, 8s cycle */
@keyframes flicker {
  0%, 100% { opacity: 1; }
  92%       { opacity: 1; }
  93%       { opacity: 0.94; }
  94%       { opacity: 1; }
  97%       { opacity: 0.97; }
}
.crt-root { animation: flicker 8s infinite; }

/* 4. Pursuit pulse ring */
@keyframes pulse-ring {
  0%   { transform: scale(1); opacity: 0.8; }
  100% { transform: scale(3.5); opacity: 0; }
}
```

---

## TYPOGRAPHY RULES

- **One font only:** `Share Tech Mono`, monospace
- Font sizes: `9px` labels · `10px` body · `11px` unit IDs / situation titles · `13px` section values · `16px` clock / alerts
- Letter-spacing: `2px` on headers · `1px` on labels · `0` on body text
- **NO bold** — use color contrast instead of weight
- **ALL CAPS** everywhere except radio message content
- Cursor in text inputs: blinking block `|` in `--primary`

---

## LAYOUT STRUCTURE

```
┌─────────────────────────────────────────────────────────────────┐
│  TOP BAR: logo · server name · unit counts · threat · clock     │
├──────────────┬──────────────────────────────┬───────────────────┤
│  LEFT PANEL  │       CENTER: MAP            │   RIGHT PANEL     │
│  Unit Roster │   (tactical map + markers)   │   Situations      │
│  Unit Detail │                              │   AI Assistant    │
│  Quick Acts  │                              │                   │
├──────────────┴──────────────────────────────┴───────────────────┤
│  BOTTOM: Radio Communications + message input                    │
├─────────────────────────────────────────────────────────────────┤
│  STATUS BAR: sys log · db status · connection                   │
└─────────────────────────────────────────────────────────────────┘
```

**Column widths:** `260px | 1fr | 300px`
**All panels** have: 1px solid border in `--primary-lo`, header row in `--bg-header`, no border-radius anywhere (0px everywhere).

---

## SCREENS / PAGES

### 1. LOGIN / REGISTER SCREEN

Full-screen terminal login. Centered, max-width 420px.

```
┌──────────────────────────────────────────┐
│  LSPD DISPATCH SYSTEM // ACCESS CONTROL  │
│  ──────────────────────────────────────  │
│                                          │
│  BADGE ID:     [ __________________ ]    │
│  PASSWORD:     [ __________________ ]    │
│                                          │
│  [ AUTHENTICATE ]    [ NEW OPERATOR ]    │
│                                          │
│  SERVER: RP_CITY_01 // ONLINE           │
│  LAST LOGIN: 2026-05-14 21:30:12        │
└──────────────────────────────────────────┘
```

- Input fields: no border-radius, 1px border `--primary-dim`, background `--bg-panel`, text `--primary`, placeholder `--text-muted`
- On focus: border becomes `--primary`, faint `box-shadow: 0 0 8px #00ff4130`
- "AUTHENTICATE" button: full-width, background `--primary-lo`, text `--primary`, border `--primary-dim`. Hover: background `--primary-dim`, text `--bg-base`
- "NEW OPERATOR" button: ghost style, border `--primary-lo`, text `--text-muted`
- Show typing animation: `INITIALIZING CONNECTION...` → `LOADING UNIT DATABASE...` → `ACCESS GRANTED` before transitioning
- Register form: shows BADGE ID, CALLSIGN, PASSWORD, RANK (select dropdown styled as terminal select), CONFIRM PASSWORD
- Error states: text flashes in `--danger`, prefixed with `[ERROR]`

---

### 2. MAIN DISPATCH TERMINAL

#### 2a. TOP BAR
Height: 34px. No separators between items — use spacing only.

Left side:
- `LSPD // DISPATCH TERMINAL v2.0` in `--primary`, letterSpacing 3px
- `SAN ANDREAS NETWORK` in `--text-muted`, smaller

Right side (all in `--text-muted`, values in their semantic color):
- `UNITS [active]/[total]` — active count in `--primary`
- `CRITICAL [n]` — n in `--danger` if >0, else `--primary`
- `● SRV:ONLINE` — blinking dot in `--accent`
- `[HH:MM:SS]` — live clock in `--primary`, font-size 14px

---

#### 2b. LEFT PANEL — UNIT ROSTER + DETAIL

**Unit roster (top half):**

Column headers: `CALLSIGN` · `STATUS` in `--text-muted`, 8px, 1px bottom border

Each unit row:
```
[●] 3-ADAM-55    PURSUIT    EAST LS
```
- Status dot: colored circle (6px) in status color
- Callsign: `--primary` if active, `--off` if OFF DUTY
- Status label: its semantic color
- Location: `--text-muted`
- Selected: left border 3px `--primary`, row bg `#00ff4110`
- Hover (non-OFF): row bg `#00ff410a`
- OFF DUTY rows: 30% opacity, not clickable

**Unit detail (bottom half):**

When unit selected, show:
```
▸ 3-ADAM-32
──────────────────
CALLSIGN   3-ADAM-32
STATUS     BUSY
LOCATION   IDLEWOOD
SPEED      72 KM/H
HEADING    NORTH
LAST SEEN  21:47:58
OFFICER    J. SMITH [102]
VEHICLE    LSPD CRUISER
FUEL       ████████░░ 67%
HEALTH     █████████░ 89%
──────────────────
[F1] TRACK   [F2] MESSAGE
[F3] ASSIGN  [F4] EDIT
```

- Fuel/health: ASCII progress bars using `█` and `░` characters
- Function buttons: 2×2 grid, 1px border `--primary-lo`, text `--text-muted`. Hover → border+text `--primary`
- `[F4] EDIT` opens **Unit Edit Modal**

---

#### 2c. CENTER — TACTICAL MAP

Background: `#010203` (coldest black)

Overlays (bottom to top):
1. Dot grid: `rgba(0,255,65,0.07)` dots every 28px
2. Road lines: thin `rgba(0,255,65,0.06)` diagonal/horizontal SVG lines
3. Zone name labels: `--text-muted`, 8px, letterSpacing 2px, ALL CAPS
4. Unit markers (see below)
5. Pursuit trail: dashed line in `--danger`, opacity 0.35
6. Scanlines (fixed overlay)

**Unit marker:**
- 8px filled circle in status color
- `box-shadow: 0 0 10px [statusColor]` (glow)
- Label: callsign to the right, 9px, `--text-muted` default / `--primary` when selected
- PURSUIT units: animated pulse ring expanding outward in `--danger`
- Clicking marker = selecting that unit in left panel (bidirectional)

**Map controls (top-left corner):**
```
[+] [-] [⌖] [LAYERS ▾]
```
Tiny buttons, 1px border `--primary-lo`, 18px height

**Compass (bottom-right):**
- 36×36px box, border `--primary-lo`, letter N in `--primary`

---

#### 2d. RIGHT PANEL — SITUATIONS

**Situation card:**
```
21:46  10-21                        ▲▲ HIGH
VEHICLE PURSUIT
EAST LS  ·  3-ADAM-55
```
- Left border 3px in level color (`--danger` / `--warn` / `--primary-dim`)
- Title: `--primary`, 11px
- Meta: `--text-muted`, 9px
- HIGH situations: card background `#ff202008`
- Selected: background `#00ff4110`, border `--primary`
- `[EDIT]` button appears on hover (top-right of card, ghost style)
- `[CLOSE SIT]` appears on hover (marks situation as resolved)

---

#### 2e. BOTTOM — RADIO COMMUNICATIONS

Height: 190px. Split: log area (flex-grow) + input row (32px).

Log format per line:
```
21:47:25  [3-LINCOLN-2]  On scene — officer down. Need backup NOW.
```
- Timestamp: `--text-muted`
- `[DISPATCH]` tag: `--primary`
- Other unit tags: `--accent`
- Message text: `--primary-dim`
- New messages scroll into view (auto-scroll)
- Typewriter effect on newest message (optional but recommended)

Input row:
```
> [typed message here________________________]  [SEND]
```
- `>` prompt in `--primary-dim`
- Input: no border, no background, `--primary` text, `--primary` caret
- SEND: 1px border `--primary-lo`, text `--text-muted`. Hover → `--primary`
- Enter key = send

---

#### 2f. STATUS BAR

Height: 24px. Bottom of screen.
```
SYS:  21:47:12 » DB SYNC OK   21:47:19 » UNITS REFRESHED    |    CONNECTED: DISPATCH_SERVER_01
```
All in `--text-muted`, 8px. `»` separators in `--primary-lo`.

---

### 3. DATABASE PANEL (separate page/tab)

Accessed via top-bar button `[DATABASE]` or keyboard shortcut.

Three sub-tabs: `UNITS` · `INCIDENTS` · `OPERATORS`

**Tab style:** underline-only active tab in `--primary`. Inactive in `--text-muted`. No background pills.

---

#### 3a. UNITS DATABASE TAB

Toolbar:
```
[+ ADD UNIT]  [⟳ REFRESH]    SEARCH: [____________]    FILTER: [ALL STATUS ▾]
```

Table:
```
┌──────────────┬──────────┬─────────────┬────────┬─────────┬──────────────┐
│ CALLSIGN     │ STATUS   │ OFFICER     │ BADGE  │ VEHICLE │ ACTIONS      │
├──────────────┼──────────┼─────────────┼────────┼─────────┼──────────────┤
│ 3-ADAM-12   │ ● DUTY   │ J. SMITH    │ [102]  │ CRUISER │ [EDIT][VIEW] │
│ 3-ADAM-55   │ ● PURSUIT│ T. BROWN    │ [118]  │ CRUISER │ [EDIT][VIEW] │
└──────────────┴──────────┴─────────────┴────────┴─────────┴──────────────┘
```

Table rules:
- `border-collapse: collapse`
- All borders: 1px solid `--primary-lo`
- Header row: bg `--bg-header`, text `--text-muted`, 9px, letterSpacing 2px
- Body rows: bg `--bg-panel`, text `--primary`, 10px
- Row hover: bg `#00ff410a`
- Status cells: colored dot + label text in status color
- `[EDIT]` button → opens Unit Edit Modal
- `[VIEW]` → jumps to that unit on main terminal map
- Pagination: `< PREV  PAGE 1 OF 3  NEXT >` — text buttons, `--text-muted`

---

#### 3b. INCIDENTS DATABASE TAB

Same toolbar pattern.

Table columns: `TIME · CODE · TITLE · LOCATION · LEVEL · UNITS · STATUS · ACTIONS`

Each incident row:
- LEVEL column: colored badge `[HIGH]` `[MED]` `[LOW]`
- STATUS column: `ACTIVE` in `--danger` blink / `RESOLVED` in `--text-muted`
- `[EDIT]` → Incident Edit Modal
- `[RESOLVE]` → marks closed, row dims to 40% opacity

---

#### 3c. OPERATORS DATABASE TAB

Table columns: `BADGE # · CALLSIGN · RANK · LAST LOGIN · STATUS · ACTIONS`

Only admin-rank operators can see `[EDIT]` and `[REMOVE]` actions.

---

### 4. MODALS (Edit Unit / Edit Situation)

**Style:**
- Full-screen dimmed backdrop: `rgba(0,0,0,0.85)`
- Modal box: max-width 500px, centered, bg `--bg-panel`, border 1px `--primary-dim`
- Header: `EDIT UNIT // 3-ADAM-32` in `--primary`, border-bottom `--primary-lo`
- No border-radius anywhere

**Edit Unit Modal fields:**
```
CALLSIGN      [ 3-ADAM-32        ]
STATUS        [ BUSY          ▾  ]   ← styled select
LOCATION      [ IDLEWOOD         ]
OFFICER       [ J. SMITH [102]   ]
PARTNER       [ T. BROWN [118]   ]
VEHICLE       [ LSPD CRUISER     ]
PLATE         [ LS-PD32          ]
FUEL %        [ 67               ]
HEALTH %      [ 89               ]
EQUIPMENT     [ CODE 3 KIT       ]
NOTES         [ ________________ ]   ← multiline
```

Buttons:
```
[SAVE CHANGES]      [CANCEL]      [DELETE UNIT]
```
- SAVE: bg `--primary-lo`, text `--primary`, border `--primary-dim`
- CANCEL: ghost
- DELETE: text `--danger`, border `--danger-dim`. Requires confirmation: replace with `[CONFIRM DELETE?]` on first click

**Edit Situation Modal fields:**
```
CODE          [ 10-21            ]
TITLE         [ VEHICLE PURSUIT  ]
LOCATION      [ EAST LS          ]
LEVEL         [ HIGH          ▾  ]
ASSIGNED      [ 3-ADAM-55        ]   ← multi-value, comma separated
NOTES         [ ________________ ]
```

Same button row as Unit Modal.

---

### 5. EMERGENCY MODE (triggered automatically when CRITICAL ≥ 2)

When 2+ HIGH situations are active simultaneously:
- All panel borders switch from `--primary-lo` → `--danger-dim`
- Top bar background flashes between `--bg-header` and `#1a0000` every 1.2s
- A banner appears below top bar:
```
! EMERGENCY MODE ACTIVE — MULTIPLE CRITICAL INCIDENTS — ALL UNITS RESPOND !
```
Banner: bg `--danger-dim`, text `--danger`, blinking, full width, 24px height
- Deactivates automatically when critical count drops to 0

---

## GENERAL COMPONENT RULES

**All inputs:**
```css
background: var(--bg-panel);
border: 1px solid var(--primary-lo);
color: var(--primary);
font-family: 'Share Tech Mono', monospace;
font-size: 10px;
padding: 6px 10px;
border-radius: 0;
outline: none;
caret-color: var(--primary);
```
Focus: `border-color: var(--primary); box-shadow: 0 0 6px #00ff4125`

**All select dropdowns:**
Same as inputs + `appearance: none` + custom `▾` arrow via `background-image` SVG or absolute-positioned span.

**All buttons:**
```css
background: transparent;
border: 1px solid var(--primary-lo);
color: var(--text-muted);
font-family: 'Share Tech Mono', monospace;
font-size: 9px;
letter-spacing: 1px;
padding: 5px 12px;
border-radius: 0;
cursor: pointer;
text-transform: uppercase;
```
Hover: `border-color: var(--primary); color: var(--primary)`
Active/primary action: `background: var(--primary-lo); color: var(--primary); border-color: var(--primary-dim)`

**Scrollbars:**
```css
::-webkit-scrollbar { width: 3px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--primary-lo); }
```

**No shadows** except: focus glow on inputs (`0 0 6px #00ff4125`) and unit marker glow on map.

---

## WHAT TO AVOID

- ❌ No border-radius anywhere (not even 2px)
- ❌ No gradient backgrounds
- ❌ No box-shadow except focus rings and map marker glow
- ❌ No icons (use ASCII characters instead: `▸ ▲ ● ■ ░ █ ▾ »`)
- ❌ No Inter, Roboto, or system fonts
- ❌ No card-style containers with heavy shadows
- ❌ No colored backgrounds on panels (only `--bg-panel` or `--bg-base`)
- ❌ No loading spinners — use text: `LOADING...` / `CONNECTING...`
- ❌ No rounded inputs or buttons
- ❌ No white or light gray text — everything is green-tinted

---

## ATMOSPHERE CHECKLIST

Before finishing, verify:
- [ ] Scanlines visible on all screens including login
- [ ] Clock ticks every second
- [ ] PURSUIT units have animated pulse ring on map
- [ ] Blinking `●` on SRV:ONLINE indicator
- [ ] EMERGENCY MODE activates when 2+ HIGH situations
- [ ] All modals have `rgba(0,0,0,0.85)` backdrop
- [ ] Radio log auto-scrolls to newest message
- [ ] Login has transition animation between states
- [ ] All tables use `border-collapse: collapse`
- [ ] No element has `border-radius` set to anything > 0