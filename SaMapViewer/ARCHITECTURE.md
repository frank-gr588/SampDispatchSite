# 📊 Architecture Diagram

## 🏗️ Архитектура системы

```
┌─────────────────────────────────────────────────────────────┐
│                        GTA SA + SA-MP                        │
│                     (MoonLoader Runtime)                     │
└───────────────┬─────────────────────────────────────────────┘
                │
                │ track_samp_v4.lua
                │
┌───────────────▼─────────────────────────────────────────────┐
│                     Lua Script Core                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  State Management                                    │   │
│  │  - playerNick, currentUnit, currentSituation        │   │
│  │  - isAFK, trackingTarget, isInPanic                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   ImGui UI   │  │   Commands   │  │   Timers     │      │
│  │   (Optional) │  │   /unit      │  │   5s coords  │      │
│  │   Menu       │  │   /sit       │  │   30s AFK    │      │
│  │   Rendering  │  │   /panic     │  │   3s location│      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Native SA-MP Functions                             │   │
│  │  - getZoneName(x, y, z)                             │   │
│  │  - getCityName(x, y, z)                             │   │
│  │  - getCharCoordinates(ped)                          │   │
│  │  - sampIsPlayerConnected(id)                        │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────┬─────────────────────────────────────────────┘
                │
                │ HTTP REST API (requests.lua)
                │ Every 5 seconds / On command
                │
┌───────────────▼─────────────────────────────────────────────┐
│                   C# ASP.NET Core Backend                    │
│                      (localhost:5000)                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Controllers                                         │   │
│  │  - PlayersController (/api/players)                 │   │
│  │  - UnitsController (/api/units)                     │   │
│  │  - SituationsController (/api/situations)           │   │
│  │  - CoordsController (/api/coords)                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Services                                            │   │
│  │  - PlayerTrackerService (In-memory storage)         │   │
│  │  - UnitsService (Units management)                  │   │
│  │  - SituationsService (Situations management)        │   │
│  │  - TacticalChannelsService (TAC-1/2/3)              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  SignalR Hub (CoordsHub)                            │   │
│  │  - Real-time updates to web clients                 │   │
│  │  - Broadcasts: coords, situations, units            │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────┬─────────────────────────────────────────────┘
                │
                │ SignalR WebSocket
                │ Real-time updates
                │
┌───────────────▼─────────────────────────────────────────────┐
│              React Frontend (Vite + TypeScript)              │
│                      (localhost:5173)                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  DataContext (Centralized State)                    │   │
│  │  - allPlayers, allUnits, allSituations              │   │
│  │  - SignalR connection                                │   │
│  │  - refreshUnits(), refreshSituations()              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Operations   │  │   Units      │  │  Situations  │      │
│  │    Map       │  │  Management  │  │  Management  │      │
│  │ Leaflet.js   │  │   Table      │  │    Panel     │      │
│  │ Real-time    │  │   CRUD       │  │   CRUD       │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Features                                            │   │
│  │  - Live map with player markers                     │   │
│  │  - AFK indicators (semi-transparent)                │   │
│  │  - 🔴 LIVE badge for Panic/Pursuit                  │   │
│  │  - Tactical channels (TAC-1/2/3)                    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow

### 1. **Coordinates Update** (Every 5 seconds)
```
Lua Script (GTA SA)
    ↓ getCharCoordinates()
[X, Y, Z, AFK]
    ↓ POST /api/coords
C# Backend
    ↓ SignalR broadcast
React Frontend
    ↓ Update map marker
User sees real-time position
```

---

### 2. **Unit Creation** (Command: `/unit create 1-A-12`)
```
Lua Script
    ↓ /unit create 1-A-12
createUnit() function
    ↓ POST /api/units
C# Backend (UnitsController)
    ↓ Save to UnitsService
    ↓ SignalR broadcast
React Frontend (UnitsManagement)
    ↓ Update units table
User sees new unit on web
```

---

### 3. **Panic Button** (Command: `/panic`)
```
Lua Script
    ↓ /panic command
createPanic() function
    ↓ getLocationName(x, y, z)
    ↓ POST /api/situations/create
C# Backend (SituationsController)
    ↓ Create Panic situation
    ↓ SignalR broadcast
React Frontend (SituationsManagement)
    ↓ Show 🔴 LIVE badge
    ↓ Highlight on map
User sees emergency alert

Every 3 seconds:
Lua Script
    ↓ updateSituationLocation()
    ↓ PUT /api/situations/{id}/location
Backend updates location
    ↓ SignalR broadcast
Frontend updates marker position
```

---

### 4. **AFK Detection** (Automatic)
```
Lua Script (every 30 seconds)
    ↓ hasPlayerMoved()
    ↓ Check distance > 5m
If no movement for 5 minutes:
    ↓ state.isAFK = true
    ↓ PUT /api/players/{nick}/afk
C# Backend (PlayersController)
    ↓ Set IsAFK = true
    ↓ SignalR broadcast
React Frontend
    ↓ Make marker semi-transparent
User sees AFK indicator on map
```

---

## 📡 Communication Protocols

### HTTP REST API
```
Lua → Backend
- POST /api/coords           (coordinates)
- POST /api/units            (create unit)
- PUT  /api/units/{id}       (update unit)
- DELETE /api/units/{id}     (delete unit)
- POST /api/situations       (create situation)
- PUT  /api/situations/{id}  (update situation)
- PUT  /api/players/{nick}/afk (AFK status)
```

### SignalR WebSocket
```
Backend → Frontend (Real-time)
- CoordinatesUpdated         (player moved)
- UnitCreated                (new unit)
- UnitUpdated                (unit changed)
- SituationCreated           (new situation)
- SituationLocationUpdated   (panic/pursuit location)
```

---

## 🧩 Component Dependencies

### Lua Script Dependencies
```
track_samp_v4.lua
  ├── lib.moonloader (required)
  ├── encoding (required)
  ├── requests (required)
  ├── dkjson (required)
  ├── mimgui (optional - for GUI)
  └── ffi (optional - for GUI)
```

### Backend Dependencies
```
SaMapViewer.csproj
  ├── ASP.NET Core 9.0
  ├── SignalR
  └── In-memory storage (no database)
```

### Frontend Dependencies
```
package.json
  ├── React 18
  ├── TypeScript
  ├── Vite
  ├── Leaflet.js (maps)
  ├── Shadcn/ui (components)
  └── @microsoft/signalr
```

---

## 🔐 Security

### API Key Authentication
```
Lua Script → Backend
  Header: X-API-Key: changeme-key
  
Backend validates:
  if (apiKey != config["ApiKey"])
    return 401 Unauthorized
```

### CORS Configuration
```
Backend allows:
  - http://localhost:5173 (Vite dev server)
  - http://localhost:3000 (alternative)
```

---

## 🚀 Deployment Workflow

### Development Mode
```
1. Start Backend:
   cd SaMapViewer
   dotnet run
   → http://localhost:5000

2. Start Frontend:
   cd FrontEnd
   npm run dev
   → http://localhost:5173

3. Start Game:
   Launch GTA SA + SA-MP
   → Script auto-loads
```

### Production Mode
```
1. Build Backend:
   dotnet publish -c Release

2. Build Frontend:
   npm run build
   → dist/ folder

3. Deploy:
   Backend → IIS/Kestrel
   Frontend → Netlify/Vercel
```

---

## 📊 Performance Metrics

### Update Intervals
```
Coordinates:        5 seconds    (normal)
AFK Check:         30 seconds    (background)
Dynamic Location:   3 seconds    (panic/pursuit only)
```

### Network Traffic (per officer)
```
Normal operation:
  - 12 requests/minute (coords)
  - ~500 bytes/request
  - ~6 KB/minute bandwidth

During Panic/Pursuit:
  - +20 requests/minute (location)
  - ~12 KB/minute bandwidth
```

### Memory Usage
```
Lua Script:      ~2-5 MB
Backend:        ~50-100 MB (for 50 players)
Frontend:       ~100-200 MB (browser)
```

---

## 🔄 State Synchronization

### Lua Script State
```lua
state = {
  playerNick: string,
  currentUnit: Unit | null,
  currentSituation: Situation | null,
  trackingTarget: {playerId, situationId} | null,
  isInPanic: boolean,
  isAFK: boolean
}
```

### Backend State (In-memory)
```csharp
PlayerTrackerService:
  Dictionary<string, PlayerPoint> players

UnitsService:
  List<Unit> units

SituationsService:
  List<Situation> situations
```

### Frontend State (React Context)
```typescript
DataContext {
  allPlayers: PlayerPointDto[],
  allUnits: UnitDto[],
  allSituations: SituationDto[],
  tacticalChannels: TacticalChannelDto[]
}
```

---

## ✅ Health Check Points

### 1. Lua Script Health
```
Check: Message in chat
[SAPD Tracker] Tracker started!
```

### 2. Backend Health
```
GET http://localhost:5000/api/players
Response: 200 OK + JSON array
```

### 3. Frontend Health
```
http://localhost:5173
Check: Map loads + no console errors
```

### 4. SignalR Connection
```
Frontend console:
"SignalR Connected"
```

---

**Диаграмма готова! 🎉**
