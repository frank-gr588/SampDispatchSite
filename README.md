# sampMap - Real-Time Law Enforcement Operations Management System

## Overview

**sampMap** is a comprehensive real-time operations management and tracking system designed specifically for law enforcement role-play scenarios in San Andreas Multiplayer (SA-MP). The system provides live player tracking, unit management, incident coordination, and tactical communications for multiplayer gaming communities that simulate police operations.

### What Problem Does It Solve?

In large-scale multiplayer police role-play environments, coordination between multiple officers, units, and ongoing situations becomes challenging. sampMap solves this by:

1. **Real-Time Coordination**: Live tracking of all active police units and their locations on an interactive map
2. **Incident Management**: Creating and managing multiple concurrent situations (pursuits, Code 7s, traffic stops, 911 calls)
3. **Unit Organization**: Forming tactical units from individual players with lead unit designation (red/green unit system)
4. **Tactical Communication**: Assigning tactical radio channels to units and situations
5. **Role-Based Operations**: Supporting officer ranks (Officer, Supervisor, SuperSupervisor) with different operational capabilities
6. **Historical Tracking**: Event logging for post-operation analysis and review

### Main Purpose

The system acts as a Computer-Aided Dispatch (CAD) and Automatic Vehicle Location (AVL) system, giving dispatchers and supervisors a real-time "god's eye view" of all field operations, enabling better coordination, faster response times, and more immersive gameplay experiences.

---

## Architecture

sampMap follows a **client-server architecture** with real-time communication capabilities:

```
┌─────────────────────────────────────────────────────────────────┐
│                        SA-MP Game Client                         │
│                     (with Lua script/MoonLoader)                 │
└───────────────────────┬─────────────────────────────────────────┘
                        │ HTTP POST (coordinates, status)
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│                   C# Backend (ASP.NET Core 9)                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Controllers (REST API Endpoints)            │   │
│  │  • CoordsController    • PlayersController              │   │
│  │  • UnitsController     • SituationsController           │   │
│  │  • ChannelsController                                   │   │
│  └──────────────────────┬──────────────────────────────────┘   │
│                         ↓                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Services Layer                        │   │
│  │  • PlayerTrackerService   • UnitsService                │   │
│  │  • SituationsService      • TacticalChannelsService     │   │
│  │  • HistoryService                                       │   │
│  └──────────────────────┬──────────────────────────────────┘   │
│                         ↓                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Data Models                           │   │
│  │  • PlayerPoint    • Unit                                │   │
│  │  • Situation      • TacticalChannel                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                         │                                        │
│                         │ SignalR Hub (Real-time Push)           │
│                         ↓                                        │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ↓ WebSocket/SignalR
┌─────────────────────────────────────────────────────────────────┐
│                React Frontend (TypeScript + Vite)                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Dashboard Components                   │   │
│  │  • OperationsMap       • PlayersTable                   │   │
│  │  • SituationsPanel     • UnitsManagement                │   │
│  │  • AssignmentBoard     • ManagementDashboard            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Uses: React 18, React Router 6, TailwindCSS, Radix UI,        │
│        React Query, SignalR Client                              │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow and Control Flow

#### 1. **Player Position Updates (Game → Backend)**
   - Lua script running in SA-MP client captures player coordinates every 2 seconds
   - HTTP POST to `/api/coords` with `{Nick, X, Y}`
   - `CoordsController` → `PlayerTrackerService.Update()`
   - Updates in-memory `ConcurrentDictionary<string, PlayerPoint>`
   - SignalR broadcasts `UpdatePlayer` event to all connected web clients

#### 2. **Unit Creation (Frontend → Backend → Frontend)**
   - User creates unit through React UI
   - API POST to `/api/unitscontrollernew` with player list
   - `UnitsController` → `UnitsService.CreateUnit()`
   - Validates players, creates `Unit` object, assigns players to unit
   - Updates `PlayerTrackerService` to mark players as assigned
   - SignalR broadcasts `UnitCreated` event
   - React frontend receives update via SignalR, re-renders UI

#### 3. **Situation Management (Frontend → Backend → Frontend)**
   - User creates situation (Code 7, Pursuit, etc.)
   - API POST to `/api/situations/create`
   - `SituationsController` → `SituationsService.Create()`
   - Creates `Situation` object in memory
   - Units can be attached to situations
   - Lead units (red units) are automatically assigned for supervisors
   - SignalR broadcasts situation updates
   - Frontend displays active situations with assigned units

#### 4. **Real-Time Synchronization**
   - SignalR hub (`CoordsHub`) maintains persistent WebSocket connections
   - All state changes trigger SignalR broadcasts
   - Frontend subscribes to events: `UpdatePlayer`, `UnitCreated`, `UnitUpdated`, `SituationCreated`, etc.
   - React components re-render automatically on state updates

---

## Core Entities

### 1. **PlayerPoint** (`SaMapViewer/Models/PlayerPoint.cs`)

Represents an individual player/officer in the system.

**Properties:**
- `Nick` (string): Player username/nickname
- `X`, `Y` (float): 2D map coordinates
- `Status` (PlayerStatus enum): Current duty status
  - `OutOfDuty` (0): Not on duty
  - `OnDuty` (1): On duty without unit
  - `OnDutyLeadUnit` (2): On duty as unit leader
  - `OnDutyOutOfUnit` (3): On duty but not in a unit
- `Role` (PlayerRole enum): Officer rank
  - `Officer` (0): Regular officer
  - `Supervisor` (1): Supervisor
  - `SuperSupervisor` (2): High-level supervisor
- `UnitId` (Guid?): ID of assigned unit (null if not in a unit)
- `LastUpdate` (DateTime): Timestamp of last coordinate update

**Key Methods:**
- `Update(x, y)`: Updates position and timestamp
- `SetStatus(status)`: Changes duty status
- `SetRole(role)`: Changes officer rank
- `AssignToUnit(unitId)`: Assigns to a unit
- `RemoveFromUnit()`: Removes from unit, sets status to `OnDutyOutOfUnit`

### 2. **Unit** (`SaMapViewer/Models/Unit.cs`)

Represents a tactical unit composed of one or more players.

**Properties:**
- `Id` (Guid): Unique identifier
- `Name` (string): Unit name (e.g., "1-Adam-12")
- `Marking` (string): Unit marking/callsign
- `PlayerNicks` (HashSet<string>): Players in the unit
- `PlayerCount` (int): Number of players
- `Status` (string): Current status (set from frontend)
- `SituationId` (Guid?): Attached situation (null if available)
- `IsLeadUnit` (bool): Red unit flag (lead unit in situations)
- `TacticalChannelId` (Guid?): Assigned tactical radio channel
- `CreatedAt` (DateTime): Creation timestamp

### 3. **Situation** (`SaMapViewer/Models/Situation.cs`)

Represents an active incident or operation.

**Properties:**
- `Id` (Guid): Unique identifier
- `Type` (string): Situation type
  - `"code7"`: Officer needs assistance
  - `"pursuit"`: Vehicle pursuit
  - `"trafficstop"`: Traffic stop
  - `"code6"`: Out for investigation
  - `"911"`: Emergency call
- `Metadata` (Dictionary<string, string>): Additional data
  - For pursuits: `mode` (passive/active/foot), `tac` (1/2/3)
  - For traffic stops: `risk` (high/low)
- `Units` (HashSet<Guid>): All units assigned to situation
- `LeadUnitId` (Guid?): Red unit (primary responding unit)
- `GreenUnits` (HashSet<Guid>): Supporting units
- `IsActive` (bool): Whether situation is still active
- `CreatedAt` (DateTime): Creation timestamp

**Key Methods:**
- `AddUnit(unitId, isLead)`: Adds unit to situation
- `RemoveUnit(unitId)`: Removes unit from situation
- `SetLeadUnit(unitId)`: Designates a unit as lead

### 4. **TacticalChannel** (`SaMapViewer/Models/TacticalChannel.cs`)

Represents a tactical radio channel that can be assigned to situations.

**Properties:**
- `Id` (Guid): Unique identifier
- `Name` (string): Channel name (e.g., "TAC-1")
- `IsBusy` (bool): Whether channel is in use
- `SituationId` (Guid?): Linked situation

---

## Services Layer

### **PlayerTrackerService**

**Responsibilities:**
- Maintains in-memory store of all players (`ConcurrentDictionary<string, PlayerPoint>`)
- Updates player positions from Lua script
- Tracks player timeout (removes inactive players based on `PlayerTtlSeconds` config)
- Provides queries for available players, players by status/role
- Handles manual player creation (for testing/simulation)

**Key Methods:**
- `UpdatePlayer(nick, x, y)`: Updates coordinates
- `GetAlivePlayers()`: Returns players updated recently (within timeout)
- `GetAvailablePlayersForUnit()`: Players available to join units
- `AssignPlayerToUnit(nick, unitId)`: Links player to unit
- `RemovePlayerFromUnit(nick)`: Unlinks player from unit

**Special Note:** Players created manually (not from Lua script) have coordinates `(-10000, -10000)` as a marker and are always considered "alive" regardless of timeout.

### **UnitsService**

**Responsibilities:**
- Manages all units in the system
- Creates units from player lists
- Adds/removes players from units
- Tracks unit status and assignments
- Integrates with `PlayerTrackerService` to update player states

**Key Methods:**
- `CreateUnit(name, marking, playerNicks, isLeadUnit)`: Creates a new unit
- `CreateUnitFromSinglePlayer(...)`: Helper for single-player units
- `AddPlayerToUnit(unitId, playerNick)`: Adds player to existing unit
- `RemovePlayerFromUnit(unitId, playerNick)`: Removes player; deletes unit if empty
- `AttachToSituation(unitId, situationId)`: Links unit to situation
- `SetLeadUnit(unitId, isLeadUnit)`: Designates as lead unit
- `GetAvailableUnits()`: Units not assigned to situations
- `GetUnitsBySituation(situationId)`: Units on a specific situation

**Validation:**
- Ensures player exists before adding to unit
- Prevents adding players already in another unit
- Automatically removes empty units

### **SituationsService**

**Responsibilities:**
- Creates and manages situations
- Assigns units to situations with lead/green designation
- Automatically promotes supervisor units to lead units
- Maintains backward compatibility with old player-based system (deprecated)

**Key Methods:**
- `Create(type, metadata)`: Creates new situation
- `AddUnitToSituation(situationId, unitId, asLeadUnit)`: Assigns unit
- `RemoveUnitFromSituation(situationId, unitId)`: Removes unit
- `SetLeadUnit(situationId, unitId)`: Changes lead unit
- `GetUnitsInSituation(situationId)`: All units on situation
- `CloseSituation(situationId)`: Deactivates and releases units

**Lead Unit Logic:**
- Supervisors and SuperSupervisors are automatically designated as lead units
- Only one lead unit per situation
- Other units become green (supporting) units

### **TacticalChannelsService**

**Responsibilities:**
- Manages tactical radio channels
- Links channels to situations
- Tracks channel busy status

**Key Methods:**
- `Create(name)`: Creates new channel
- `SetBusy(id, busy)`: Updates busy flag
- `AttachSituation(id, situationId)`: Links to situation

### **HistoryService**

**Responsibilities:**
- Logs all events to JSONL file for audit trail
- Appends events asynchronously with thread-safe semaphore

**Event Types Logged:**
- `coords`: Position updates
- `status`: Status changes
- `unit_create`, `unit_delete`, `unit_update`: Unit operations
- `unit_add_player`, `unit_remove_player`: Player assignments
- `situation_*`: Situation operations
- `channel_*`: Channel operations

Each event includes timestamp (`ts`) and event data (`ev`).

---

## API Endpoints

### **CoordsController** (`/api/coords`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/coords` | Update player coordinates from Lua script | Yes (API Key) |
| POST | `/api/coords/status` | Update player status from Lua script | Yes (API Key) |
| GET | `/api/coords/all` | Get all alive players | No |

### **PlayersController** (`/api/players`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/players` | Get all players | No |
| GET | `/api/players/{nick}` | Get specific player | No |
| POST | `/api/players` | Create player manually | No |
| PUT | `/api/players/{nick}/status` | Update player status | No |
| PUT | `/api/players/{nick}/role` | Update player role | No |
| DELETE | `/api/players/{nick}` | Delete player | No |
| GET | `/api/players/by-status/{status}` | Filter by status | No |
| GET | `/api/players/by-role/{role}` | Filter by role | No |
| GET | `/api/players/available-for-unit` | Get unassigned players | No |

### **UnitsController** (`/api/units` - legacy)

Older controller for single-player units. Prefer `/api/unitscontrollernew`.

### **UnitsControllerNew** (`/api/unitscontrollernew`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/unitscontrollernew` | Create unit | Yes (API Key) |
| GET | `/api/unitscontrollernew` | Get all units | No |
| GET | `/api/unitscontrollernew/{id}` | Get specific unit | No |
| DELETE | `/api/unitscontrollernew/{id}` | Delete unit | Yes (API Key) |
| PUT | `/api/unitscontrollernew/{id}` | Update unit name/marking | Yes (API Key) |
| PUT | `/api/unitscontrollernew/{id}/status` | Set unit status | Yes (API Key) |
| PUT | `/api/unitscontrollernew/{id}/situation` | Attach to situation | Yes (API Key) |
| PUT | `/api/unitscontrollernew/{id}/lead` | Set as lead unit | Yes (API Key) |
| PUT | `/api/unitscontrollernew/{id}/channel` | Assign tactical channel | Yes (API Key) |
| POST | `/api/unitscontrollernew/{id}/players/add` | Add player to unit | Yes (API Key) |
| POST | `/api/unitscontrollernew/{id}/players/remove` | Remove player from unit | Yes (API Key) |
| GET | `/api/unitscontrollernew/{id}/players` | Get unit players | No |
| GET | `/api/unitscontrollernew/{id}/lead-player` | Get lead player nick | No |
| GET | `/api/unitscontrollernew/available` | Get unassigned units | No |
| GET | `/api/unitscontrollernew/by-situation/{id}` | Get units on situation | No |

### **SituationsController** (`/api/situations`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/situations/create` | Create situation | Yes (API Key) |
| POST | `/api/situations/{id}/join` | Join situation (deprecated) | Yes (API Key) |
| POST | `/api/situations/{id}/leave` | Leave situation (deprecated) | Yes (API Key) |
| GET | `/api/situations/all` | Get all situations | No |
| POST | `/api/situations/panic` | Set panic button | Yes (API Key) |
| GET | `/api/situations/history` | Get situation history | No |

### **ChannelsController** (`/api/channels`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/channels` | Create channel | Yes (API Key) |
| GET | `/api/channels/all` | Get all channels | No |
| PUT | `/api/channels/{id}/busy` | Set busy status | Yes (API Key) |
| POST | `/api/channels/{id}/attach-situation` | Link to situation | Yes (API Key) |

### **Authentication**

API endpoints that modify data require an API key passed via the `x-api-key` header. The key is configured in `appsettings.json`:

```json
{
  "SaMap": {
    "ApiKey": "changeme-key"
  }
}
```

If `ApiKey` is empty, authentication is disabled.

---

## SignalR Real-Time Events

The backend broadcasts real-time events via SignalR WebSocket hub (`/coordshub`):

| Event Name | Payload | Description |
|------------|---------|-------------|
| `UpdatePlayer` | `{nick, x, y}` | Player moved |
| `UpdatePlayerStatus` | `{nick, status}` | Player status changed |
| `UnitCreated` | `Unit` object | New unit created |
| `UnitUpdated` | `Unit` object | Unit modified |
| `UnitDeleted` | `{id}` | Unit deleted |
| `SituationCreated` | `Situation` object | New situation |
| `SituationUpdated` | `Situation` object | Situation modified |
| `ChannelCreated` | `TacticalChannel` object | New channel |
| `ChannelUpdated` | `TacticalChannel` object | Channel modified |

Frontend subscribes to these events to maintain real-time synchronization.

---

## Frontend Components

The React frontend (`FrontEnd/client/`) provides a comprehensive dashboard with multiple views:

### **Main Dashboard** (`pages/Index.tsx`)

The primary interface with tabbed navigation:

1. **Overview Tab** - Summary statistics and key metrics
2. **Tactical Operations Tab** - Map view with units and situations
3. **Players Tab** - Player management and monitoring
4. **Units Tab** - Unit creation and management
5. **Situations Tab** - Situation/incident management
6. **Dispatch Tab** - Assignment board for coordinating units

**Data Loading:**
- Polls `/api/coords/all` every 5 seconds for player updates
- Polls `/api/unitscontrollernew` for unit list
- Subscribes to SignalR for real-time updates (when implemented)

### **OperationsMap** (`components/dashboard/OperationsMap.tsx`)

Interactive 2D map component that displays:
- Player positions as markers with color-coded status
- Unit groupings with labels
- Situation heat rings
- San Andreas Multiplayer world coordinates mapped to screen space

**Coordinate Transformation:**
- SA-MP world: -3000 to +3000 (X and Y)
- Maps to screen coordinates proportionally
- Supports zoom and pan interactions

### **PlayersTable** (`components/dashboard/PlayersTable.tsx`)

Displays all active players in a sortable, filterable table with:
- Nickname, status, role, assigned unit
- Color-coded badges for status and role
- Actions for updating player properties

### **UnitsManagement** (`components/dashboard/UnitsManagement.tsx`)

UI for creating and managing units:
- Create new units from available players
- View all units with player lists
- Delete units
- Assign units to situations

### **SituationsPanel** (`components/dashboard/SituationsPanel.tsx`)

Manages active situations:
- Create new situations with type and metadata
- View active situations with assigned units
- Close/resolve situations

### **AssignmentBoard** (`components/dashboard/AssignmentBoard.tsx`)

Drag-and-drop interface for:
- Assigning units to situations
- Designating lead units
- Managing tactical channel assignments

### **ManagementDashboard** (`components/dashboard/ManagementDashboard.tsx`)

Administrative controls for:
- System configuration
- Player management
- Unit oversight
- Situation monitoring

---

## Features

### 1. **Real-Time Player Tracking**

- Lua script in SA-MP client sends coordinates every 2 seconds
- Backend stores positions in memory with automatic timeout (default 30s)
- Frontend displays all players on interactive map
- Position updates broadcast via SignalR for instant UI updates

**How It Works:**
1. Player joins SA-MP server
2. Lua script activates (auto-start or `/trackon` command)
3. Script captures `getCharCoordinates(PLAYER_PED)`
4. HTTP POST to `/api/coords` with player nick and coordinates
5. Backend updates `PlayerTrackerService`
6. SignalR broadcasts to all connected web clients
7. React map component renders updated marker positions

### 2. **Unit Formation and Management**

- Create tactical units from multiple players
- Single-player units supported
- Units maintain cohesion on map display
- Automatic player availability tracking (prevents double-assignment)

**How It Works:**
1. User selects available players from dropdown
2. Frontend POST to `/api/unitscontrollernew` with player list
3. Backend validates each player exists and is available
4. Creates `Unit` object, updates each player's `UnitId`
5. Unit appears in unit list and on map
6. Removing players from unit automatically deletes unit if empty

### 3. **Incident/Situation Management**

- Create situations with type-specific metadata
- Support for multiple concurrent situations
- Lead unit (red) and supporting units (green) designation
- Automatic lead unit assignment for supervisor ranks

**Situation Types:**
- **Code 7**: Officer needs assistance (high priority)
- **Pursuit**: Vehicle/foot pursuit with modes (passive, active, foot)
- **Traffic Stop**: Traffic stops with risk levels (high, low)
- **Code 6**: Out for investigation
- **911**: Emergency call

**How It Works:**
1. User creates situation via UI
2. Backend generates unique situation ID
3. Units can be assigned to situation
4. Lead unit automatically set if unit contains supervisor
5. Map displays situation with color-coded heat ring
6. Closing situation releases all units

### 4. **Tactical Channel Management**

- Create named tactical channels (TAC-1, TAC-2, etc.)
- Assign channels to situations for coordination
- Track channel busy status
- Link channels to units

**How It Works:**
1. Admin creates channels (e.g., "TAC-1", "TAC-2")
2. Channels can be attached to situations
3. Units assigned to situation can reference the channel
4. Provides reference for in-game radio communication

### 5. **Role-Based Operations**

Three officer ranks with different capabilities:

- **Officer (0)**: Regular patrol officer, joins units as regular member
- **Supervisor (1)**: Can lead units, automatically becomes red unit on situations
- **SuperSupervisor (2)**: High-level command, automatically becomes red unit

**How It Works:**
- Player role set via `/api/players/{nick}/role`
- When unit with supervisor joins situation, `SituationsService.AddUnitToSituation()` checks role
- If supervisor/supersupervisor, unit becomes lead unit automatically

### 6. **Event History and Audit Trail**

- All operations logged to JSONL file (`history.jsonl`)
- Each event includes timestamp and full event data
- Enables post-operation review and analytics

**Logged Events:**
- Player position updates
- Player status changes
- Unit creation, modification, deletion
- Player assignments to units
- Situation creation and updates
- Channel operations

**File Format:**
```json
{"ts":"2024-01-15T10:30:45.123Z","ev":{"type":"unit_create","id":"guid","Name":"1-Adam-12","playerNick":"Officer_Smith"}}
{"ts":"2024-01-15T10:31:02.456Z","ev":{"type":"coords","nick":"Officer_Smith","x":1523.45,"y":-1678.23}}
```

### 7. **Player Timeout and Cleanup**

- Inactive players (no coordinate updates) automatically expire
- Configurable timeout via `PlayerTtlSeconds` (default 30 seconds)
- Manual players (created via API) never expire
- Prevents stale data from cluttering UI

**How It Works:**
- `PlayerTrackerService.GetAlivePlayers()` filters by `LastUpdate` timestamp
- Players with `(current_time - LastUpdate) > timeout` are excluded
- Exception: Manual players with coordinates `(-10000, -10000)` always included
- Frontend polls alive players only, keeping UI clean

---

## Process Explanation

### **Typical Operational Flow**

#### **Phase 1: System Initialization**

1. **Backend Startup**
   - ASP.NET Core application starts on `http://localhost:5000`
   - Dependency injection configures singleton services
   - SignalR hub `/coordshub` becomes available
   - Configuration loaded from `appsettings.json`

2. **Frontend Startup**
   - React SPA loads in browser
   - Connects to backend API
   - Establishes SignalR WebSocket connection
   - Begins polling `/api/coords/all` every 5 seconds

3. **Player Connection**
   - Player joins SA-MP server
   - Lua script (`track_samp_Version2.lua`) loads via MoonLoader
   - Auto-start triggers if enabled
   - Script begins sending coordinates every 2 seconds

#### **Phase 2: Active Operations**

4. **Player Tracking**
   - Lua script continuously posts to `/api/coords`
   - Backend updates position in `PlayerTrackerService`
   - SignalR broadcasts `UpdatePlayer` event
   - Frontend map updates marker position in real-time

5. **Unit Formation**
   - Dispatcher views available players in frontend
   - Selects 2 officers and creates unit "1-Adam-12"
   - Backend creates unit, assigns players
   - Unit appears on map with group visualization

6. **Incident Response**
   - Officer reports "Code 7" via radio
   - Dispatcher creates Code 7 situation in frontend
   - Situation appears with red heat ring on map
   - Dispatcher assigns "1-Adam-12" as lead unit (red)
   - Additional units assigned as green units

7. **Tactical Coordination**
   - Dispatcher assigns "TAC-1" channel to situation
   - All units see channel assignment
   - Officers switch to TAC-1 for situation-specific comms

#### **Phase 3: Resolution**

8. **Situation Closure**
   - Officer reports "Code 4" (situation resolved)
   - Dispatcher closes situation in frontend
   - Units released, return to available status
   - Tactical channel freed
   - Event logged to history

9. **Shift End**
   - Officers go off-duty
   - Lua script stops sending coordinates
   - Players timeout after 30 seconds
   - Units with no active players auto-delete
   - Map clears inactive markers

---

## Dependencies

### **Backend (C# .NET 9)**

**Runtime:** .NET 9.0 SDK

**Framework:**
- **ASP.NET Core 9.0**: Web framework and REST API
- **Microsoft.AspNetCore.SignalR**: Real-time WebSocket communication

**NuGet Packages:**
- `Microsoft.AspNetCore.OpenApi` (implicit): API documentation
- No external dependencies - uses built-in .NET libraries

**Key .NET Features Used:**
- `System.Collections.Concurrent.ConcurrentDictionary`: Thread-safe in-memory storage
- `System.Text.Json`: JSON serialization
- `System.IO`: File operations for history logging
- `System.Linq`: LINQ queries for data filtering

### **Frontend (React + TypeScript)**

**Runtime:** Node.js (via PNPM)

**Core:**
- **React 18.3.1**: UI library
- **React Router 6.30.1**: SPA routing
- **TypeScript 5.9.2**: Type-safe JavaScript
- **Vite 7.1.2**: Build tool and dev server

**UI Libraries:**
- **TailwindCSS 3.4.17**: Utility-first CSS
- **Radix UI**: Unstyled accessible component primitives
  - Dialog, Dropdown, Popover, Tabs, Tooltip, etc.
- **Lucide React 0.539.0**: Icon library
- **class-variance-authority**: Type-safe variant styling
- **tailwind-merge**: Utility for merging Tailwind classes

**State Management:**
- **@tanstack/react-query 5.84.2**: Server state synchronization
- React hooks (useState, useEffect, useMemo)

**3D Visualization:**
- **Three.js 0.176.0**: 3D graphics library
- **@react-three/fiber 8.18.0**: React renderer for Three.js
- **@react-three/drei 9.122.0**: Three.js helpers

**Form Handling:**
- **react-hook-form 7.62.0**: Form state management
- **@hookform/resolvers 5.2.1**: Validation resolvers
- **zod 3.25.76**: Schema validation

**Charts:**
- **recharts 2.12.7**: Charting library

**Notifications:**
- **sonner 1.7.4**: Toast notifications

**Backend Integration:**
- **express 5.1.0**: Node.js server (integrated with Vite)
- **cors 2.8.5**: CORS middleware
- **dotenv 17.2.1**: Environment variables

**Build Tools:**
- **@vitejs/plugin-react-swc 4.0.0**: React plugin with SWC
- **@swc/core 1.13.3**: Fast TypeScript/JavaScript compiler
- **PostCSS 8.5.6**: CSS processing
- **Autoprefixer 10.4.21**: CSS vendor prefixes

**Testing:**
- **Vitest 3.2.4**: Unit testing framework

**Deployment:**
- **serverless-http 3.2.0**: AWS Lambda adapter

### **Game Client (Lua)**

**Runtime:** MoonLoader (SA-MP Lua framework)

**Libraries:**
- **lib.sampfuncs**: SA-MP function bindings
- **lib.moonloader**: MoonLoader core
- **socket.http**: HTTP client (from LuaSocket)
- **ltn12**: Data pumping (from LuaSocket)

---

## Build and Run Instructions

### **Prerequisites**

1. **.NET 9 SDK**: Download from https://dotnet.microsoft.com/download
2. **Node.js 20+** and **PNPM**: For frontend
   ```bash
   npm install -g pnpm
   ```
3. **SA-MP Client** with **MoonLoader**: For game integration

### **Backend Setup**

```bash
# Navigate to backend directory
cd SaMapViewer

# Restore dependencies (optional, automatic on build)
dotnet restore

# Build the project
dotnet build

# Run the backend server
dotnet run

# Server starts on http://localhost:5000
```

**Configuration:**

Edit `appsettings.json`:
```json
{
  "SaMap": {
    "ApiKey": "your-secret-key",       // API key for protected endpoints
    "PlayerTtlSeconds": 30,             // Player timeout in seconds
    "HistoryPath": "history.jsonl"      // Path to event log file
  }
}
```

**For Production:**

```bash
# Publish self-contained executable
dotnet publish -c Release -r win-x64 --self-contained

# Output in bin/Release/net9.0/win-x64/publish/
```

### **Frontend Setup**

```bash
# Navigate to frontend directory
cd FrontEnd

# Install dependencies
pnpm install

# Run development server (Vite + Express)
pnpm dev

# Development server starts on http://localhost:5173
# API proxied to backend on http://localhost:5000
```

**Build for Production:**

```bash
# Build client and server
pnpm build

# Outputs to dist/ directory
# - dist/spa/ - Static frontend files
# - dist/server/ - Express server bundle

# Run production build
pnpm start

# Serves on http://localhost:5173
```

**Environment Variables:**

Create `.env` file:
```bash
VITE_API_BASE=http://localhost:5000
```

### **SA-MP Lua Script Setup**

1. Install **MoonLoader** in your SA-MP directory
2. Copy `track_samp_Version2.lua` to `moonloader/` folder
3. Configure script:
   ```lua
   local API_BASE = 'http://127.0.0.1:5000'  -- Backend URL
   local API_KEY = 'your-secret-key'          -- Match appsettings.json
   local AUTO_START = true                    -- Auto-enable on join
   ```
4. Join SA-MP server
5. Script auto-starts or use commands:
   - `/trackon` - Enable tracking
   - `/trackoff` - Disable tracking
   - `/status <text>` - Set custom status

### **Running the Complete System**

**Terminal 1 - Backend:**
```bash
cd SaMapViewer
dotnet run
```

**Terminal 2 - Frontend:**
```bash
cd FrontEnd
pnpm dev
```

**Terminal 3 - SA-MP:**
```bash
# Launch SA-MP with MoonLoader
# Script will auto-connect to backend
```

**Access Dashboard:**
- Open browser to `http://localhost:5173`
- View real-time player positions and operations

### **Testing**

**Backend:**
```bash
cd SaMapViewer
dotnet test
```

**Frontend:**
```bash
cd FrontEnd
pnpm test
```

---

## Possible Bugs or Weak Points

### 🔴 **Critical Issues**

#### 1. **No Persistent Storage**
**Problem:** All data stored in memory (ConcurrentDictionary). Server restart loses all:
- Player positions
- Units
- Situations
- Tactical channels

**Why It's Bad:** 
- Operations data lost on crash/restart
- No recovery mechanism
- Cannot scale horizontally (multi-instance)

**Solution:**
- Add database (PostgreSQL, SQL Server, Redis)
- Implement repository pattern
- Persist critical entities (Units, Situations, Channels)
- Keep player positions in memory for performance, but with DB backup

#### 2. **Race Conditions in Unit Management**
**Problem:** `UnitsService.RemovePlayerFromUnit()` deletes unit if empty, but no transaction guarantees:
```csharp
unit.PlayerNicks.Remove(playerNick);
if (unit.PlayerCount == 0)
{
    _units.TryRemove(id, out _);  // What if another thread adds player here?
}
```

**Why It's Bad:**
- Concurrent requests could leave orphaned players or units
- Player might be added to unit between check and delete

**Solution:**
- Use locking mechanisms (e.g., `lock` statement or `SemaphoreSlim`)
- Implement optimistic concurrency with version stamps
- Make operations atomic

#### 3. **No API Rate Limiting**
**Problem:** Lua script sends coordinates every 2 seconds per player. With 100 players = 50 req/sec. No rate limiting on endpoints.

**Why It's Bad:**
- DDoS vulnerability
- Resource exhaustion
- Single malicious client can overwhelm server

**Solution:**
- Implement rate limiting middleware (AspNetCoreRateLimit)
- Per-IP throttling
- Separate rate limits for authenticated vs unauthenticated requests

#### 4. **Weak Authentication**
**Problem:** Single shared API key in header. No user authentication, no authorization levels.

**Why It's Bad:**
- Key compromise exposes all write operations
- No audit trail of who did what
- Cannot revoke access for specific users

**Solution:**
- Implement JWT authentication
- Role-based access control (RBAC)
- Per-user API keys with permissions
- OAuth2 for frontend user auth

### 🟡 **Moderate Issues**

#### 5. **Inefficient Polling**
**Problem:** Frontend polls `/api/coords/all` every 5 seconds instead of using SignalR consistently.

**Why It's Bad:**
- Wastes bandwidth
- Increases server load
- Delays up to 5 seconds for updates

**Solution:**
- Migrate fully to SignalR for all real-time data
- Use SignalR streaming for continuous updates
- Implement exponential backoff for reconnection

#### 6. **No Input Validation on Coordinates**
**Problem:** Backend accepts any X/Y values without bounds checking.

**Why It's Bad:**
- Out-of-bounds coordinates break map rendering
- Could cause overflow in calculations
- Malicious client can send invalid data

**Solution:**
- Add validation in `CoordsController`:
```csharp
if (data.X < -3000 || data.X > 3000 || data.Y < -3000 || data.Y > 3000)
    return BadRequest("Coordinates out of bounds");
```

#### 7. **History Log File Issues**
**Problem:** 
- `HistoryService` appends to file indefinitely, no rotation
- File can grow unbounded
- No error handling if disk full

**Why It's Bad:**
- Disk space exhaustion
- Performance degradation with large files
- Data loss if write fails

**Solution:**
- Implement log rotation (daily, by size)
- Use structured logging (Serilog, NLog)
- Add error handling and logging to file operations
- Consider using database for history instead

#### 8. **SignalR Hub Not Fully Utilized**
**Problem:** `CoordsHub` is empty class with no methods. All broadcasts done via `IHubContext` from controllers.

**Why It's Bad:**
- No client-to-server RPC methods
- Cannot implement client-initiated actions via SignalR
- Frontend must use REST + SignalR instead of pure SignalR

**Solution:**
- Add hub methods for common operations:
```csharp
public class CoordsHub : Hub
{
    public async Task SubscribeToUnit(Guid unitId) { ... }
    public async Task RequestPlayerUpdate(string nick) { ... }
}
```

#### 9. **No Error Handling in Lua Script**
**Problem:** Lua script has minimal error handling. Network failures silently ignored.

**Why It's Bad:**
- Players don't know if tracking stopped
- No retry logic
- Silent failures make debugging hard

**Solution:**
- Add retry logic with exponential backoff
- Display status messages in SA-MP chat
- Log errors to file for debugging

#### 10. **Manual Player Coordinate Hack**
**Problem:** Manual players use `(-10000, -10000)` as marker. This is a magic number antipattern.

**Why It's Bad:**
- Not documented in code
- Could conflict with future valid coordinates
- Fragile design that breaks if assumption changes

**Solution:**
- Add explicit `IsManualPlayer` boolean property to `PlayerPoint`
- Remove magic number reliance
- Update logic to check flag instead of coordinates

### 🟢 **Minor Issues**

#### 11. **Inconsistent Naming**
**Problem:** `UnitsController` vs `UnitsControllerNew`. Old controller still exists.

**Why It's Bad:**
- Confusing for developers
- API documentation unclear
- Maintenance burden

**Solution:**
- Remove old `UnitsController` or mark as deprecated
- Rename `UnitsControllerNew` to `UnitsController`
- Add versioning (e.g., `/api/v1/units`, `/api/v2/units`)

#### 12. **No Health Check Endpoint**
**Problem:** No `/health` endpoint for monitoring.

**Why It's Bad:**
- Cannot monitor backend status
- Load balancer cannot detect failures
- No readiness probe for Kubernetes

**Solution:**
```csharp
app.MapGet("/health", () => Results.Ok(new { status = "healthy", time = DateTime.UtcNow }));
```

#### 13. **CORS Wide Open**
**Problem:** `AllowAnyOrigin()` in CORS policy.

**Why It's Bad:**
- Any website can access API
- CSRF vulnerability
- Security risk

**Solution:**
- Restrict to specific origins:
```csharp
policy.WithOrigins("http://localhost:5173", "https://yourdomain.com")
```

#### 14. **No Logging Levels Configuration**
**Problem:** Logging configured but not extensively used in services.

**Why It's Bad:**
- Hard to debug production issues
- Cannot trace request flow
- Missing performance insights

**Solution:**
- Add structured logging throughout services
- Log entry/exit of critical operations
- Log performance metrics

#### 15. **Frontend Shared Types Duplication**
**Problem:** Types defined in both `FrontEnd/shared/api.ts` and backend models, but not auto-synced.

**Why It's Bad:**
- Manual sync required when models change
- Type drift between frontend/backend
- Breaking changes not caught until runtime

**Solution:**
- Use OpenAPI/Swagger to generate TypeScript types
- NSwag or similar tool for automatic type generation
- Single source of truth for contracts

---

## Extensibility Ideas

### **1. Database Integration**

**Current:** In-memory storage with no persistence

**Enhancement:**
- Add Entity Framework Core with PostgreSQL/SQL Server
- Implement repositories: `IPlayerRepository`, `IUnitRepository`, etc.
- Use Redis for caching frequently accessed data
- Maintain hot path performance with hybrid memory+DB approach

**Benefits:**
- Data persistence across restarts
- Historical queries and analytics
- Scalability to multiple server instances
- Backup and disaster recovery

### **2. Advanced Analytics Dashboard**

**Current:** Basic real-time view

**Enhancement:**
- Add `/analytics` route with dashboard
- Metrics:
  - Average response times by situation type
  - Officer activity heatmaps
  - Unit efficiency scores
  - Peak hours analysis
- Integration with Recharts or similar for visualizations
- Time-series data for trends

**Benefits:**
- Supervisor insights into operations
- Performance monitoring
- Resource allocation optimization

### **3. Automated Dispatch Recommendation**

**Current:** Manual unit assignment

**Enhancement:**
- Machine learning model for optimal unit selection
- Factors: distance, unit availability, officer rank, current workload
- Suggest best units for situation
- API: `POST /api/dispatch/recommend` with situation details

**Benefits:**
- Faster response times
- Better resource utilization
- Reduced dispatcher workload

### **4. Geofencing and Zones**

**Current:** No zone concept

**Enhancement:**
- Define patrol zones on map (LSPD divisions, beats)
- Track which units are in which zones
- Alerts when zone left unpatrolled
- Automatic backup requests when zone incident occurs

**Benefits:**
- Better area coverage
- Jurisdiction clarity
- Improved coordination

### **5. Voice Integration**

**Current:** Text-only

**Enhancement:**
- Integrate with Discord or TeamSpeak API
- Automatically move officers to tactical channel voice rooms
- Status updates via voice synthesis
- Voice-to-text for logging communications

**Benefits:**
- Seamless voice coordination
- Reduced manual channel switching
- Enhanced immersion

### **6. Mobile App**

**Current:** Desktop web only

**Enhancement:**
- React Native or Progressive Web App (PWA)
- Mobile-optimized UI for supervisors on the go
- Push notifications for Code 7, panic buttons
- Simplified unit status updates

**Benefits:**
- Flexibility for on-duty supervisors
- Faster response to critical situations
- Better accessibility

### **7. Multi-Server Support**

**Current:** Single SA-MP server

**Enhancement:**
- Track players across multiple SA-MP servers
- Server selection in frontend
- Cross-server unit coordination
- Aggregated statistics

**Benefits:**
- Scalability to server networks
- Community-wide operations
- Centralized dispatch

### **8. Automated Reporting**

**Current:** Manual history review

**Enhancement:**
- Generate daily/weekly operation reports
- PDF export with charts and statistics
- Email delivery to supervisors
- Incident after-action reports

**Benefits:**
- Accountability
- Performance tracking
- Documentation for training

### **9. Webhooks and Integrations**

**Current:** Closed system

**Enhancement:**
- Webhook support for external systems
- Discord bot integration for notifications
- REST API for third-party tools
- Zapier/IFTTT integration

**Benefits:**
- Ecosystem expansion
- Community customization
- Enhanced notifications

### **10. Replay and Simulation**

**Current:** Live only

**Enhancement:**
- Record all operations for replay
- Timeline scrubber to review past incidents
- Simulation mode for training
- Playback at variable speeds

**Benefits:**
- Training tool for new officers
- Incident review for improvement
- Documentation for policy decisions

---

## License

*(Specify your license here, e.g., MIT, Apache 2.0, proprietary, etc.)*

## Contributing

*(Add contribution guidelines if accepting contributions)*

## Support

*(Add contact information, issue tracker links, or community Discord/forum)*

## Credits

- **Backend:** ASP.NET Core 9, C#
- **Frontend:** React, TypeScript, Vite, TailwindCSS, Radix UI
- **Game Integration:** SA-MP, MoonLoader, Lua
- **Real-Time Communication:** SignalR
- **Icons:** Lucide React

---

**Project Status:** Active Development

**Version:** 1.0.0 (Inferred from repository state)