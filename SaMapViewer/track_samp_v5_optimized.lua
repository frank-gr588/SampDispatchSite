-- ============================================================================
-- SaMapViewer Lua Assistant v5 - SA-MP Unit Control Script
-- ============================================================================
-- Minimal script for unit control without dispatcher
-- All logic on server (C#), script only handles UI + REST calls
-- ============================================================================

local config = {
    serverUrl = "https://dispatcher-tool.stigri.work",  -- API server URL
    apiKey = "changeme-key",  -- API key if required
    heartbeatInterval = 30,  -- Seconds between heartbeats
    retryAttempts = 3,  -- Retry failed requests
    retryDelay = 2,  -- Delay between retries (seconds)
    pursuitUpdateInterval = 3  -- Update pursuit suspect coords every N seconds
}

local state = {
    playerNick = "",  -- Player nickname
    currentUnitId = "",  -- Current unit ID
    currentSituationId = "",  -- Active situation ID
    isLeadUnit = false,  -- Is lead unit flag
    isPanic = false,  -- Panic status
    lastHeartbeat = 0,  -- Last heartbeat timestamp
    pursuitSuspectId = -1,  -- SA-MP ID of pursuit suspect
    lastPursuitUpdate = 0  -- Last pursuit update timestamp
}

-- Status code mapping
local statusCodes = {
    ["0"] = "Code 0 - Officer Down",
    ["1"] = "Code 1 - Officer Under Fire",
    ["2"] = "Code 2 - Response No Lights",
    ["3"] = "Code 3 - Response Lights/Sirens",
    ["4"] = "Code 4 - Assistance Not Needed",
    ["6"] = "Code 6 - Investigation Scene",
    ["7"] = "Code 7 - Break"
}

-- ============================================================================
-- HELPERS & NETWORK
-- ============================================================================

local function log(msg, isError)
    if isError then
        sampAddChatMessage("[{FF0000}ERROR{FFFFFF}] " .. msg, -1)
        print("[ERROR] " .. msg)
    else
        sampAddChatMessage("[{00FF00}UNIT{FFFFFF}] " .. msg, -1)
        print("[INFO] " .. msg)
    end
end

local function logSuccess(msg)
    sampAddChatMessage("[{00FF00}SUCCESS{FFFFFF}] " .. msg, -1)
    print("[SUCCESS] " .. msg)
end

local function debugLog(msg)
    print("[DEBUG] " .. msg)
end

--- Execute HTTP POST request
--- Returns: success (bool), statusCode (int), response (string)
local function httpPost(endpoint, body)
    local url = config.serverUrl .. endpoint
    local headers = {}
    
    if config.apiKey and config.apiKey ~= "" then
        headers["x-api-key"] = config.apiKey
    end
    headers["Content-Type"] = "application/json"
    
    debugLog("POST " .. url)
    debugLog("Body: " .. (body or "empty"))
    
    local success, statusCode, response = false, 0, ""
    
    -- MoonLoader: use requests library
    local ok = pcall(function()
        local req = requests.post(url, {data = body, headers = headers})
        statusCode = req.status_code
        response = req.text
        success = (statusCode >= 200 and statusCode < 300)
    end)
    
    if not ok then
        debugLog("Network error or timeout")
        return false, 0, ""
    end
    
    debugLog("Response status: " .. statusCode)
    debugLog("Response: " .. response)
    
    return success, statusCode, response
end

--- Execute HTTP GET request
--- Returns: success (bool), statusCode (int), response (string)
local function httpGet(endpoint)
    local url = config.serverUrl .. endpoint
    local headers = {}
    
    if config.apiKey and config.apiKey ~= "" then
        headers["x-api-key"] = config.apiKey
    end
    
    debugLog("GET " .. url)
    
    local success, statusCode, response = false, 0, ""
    
    local ok = pcall(function()
        local req = requests.get(url, {headers = headers})
        statusCode = req.status_code
        response = req.text
        success = (statusCode >= 200 and statusCode < 300)
    end)
    
    if not ok then
        debugLog("Network error or timeout")
        return false, 0, ""
    end
    
    debugLog("Response status: " .. statusCode)
    
    return success, statusCode, response
end

--- Convert Lua table to JSON (dkjson or manual)
local function jsonEncode(tbl)
    -- If dkjson is available
    if json and json.encode then
        return json.encode(tbl)
    end
    
    -- Minimal JSON encoder
    local function encode_value(v)
        if v == nil then return "null"
        elseif type(v) == "boolean" then return v and "true" or "false"
        elseif type(v) == "number" then return tostring(v)
        elseif type(v) == "string" then return '"' .. v:gsub('"', '\\"') .. '"'
        elseif type(v) == "table" then
            -- Array
            if #v > 0 then
                local items = {}
                for i = 1, #v do
                    table.insert(items, encode_value(v[i]))
                end
                return "[" .. table.concat(items, ",") .. "]"
            else
                -- Object
                local pairs_str = {}
                for k2, v2 in pairs(v) do
                    table.insert(pairs_str, '"' .. k2 .. '":' .. encode_value(v2))
                end
                return "{" .. table.concat(pairs_str, ",") .. "}"
            end
        else return "null"
        end
    end
    
    local result = "{"
    local first = true
    for k, v in pairs(tbl) do
        if not first then result = result .. "," end
        result = result .. '"' .. k .. '":' .. encode_value(v)
        first = false
    end
    result = result .. "}"
    return result
end

--- Decode JSON (dkjson or manual)
local function jsonDecode(jsonStr)
    if json and json.decode then
        return json.decode(jsonStr)
    end
    -- Minimal decoder - just return empty table
    return {}
end

-- ============================================================================
-- COMMANDS
-- ============================================================================

--- Get status text from code number
local function getStatusFromCode(codeNum)
    return statusCodes[tostring(codeNum)] or "Code " .. codeNum
end

--- /code [number] - Set status by code (0-7)
local function cmdCode(codeNum)
    if codeNum == "" then
        sampAddChatMessage("===== STATUS CODES =====", -1)
        for code, desc in pairs(statusCodes) do
            sampAddChatMessage(desc, -1)
        end
        return
    end
    
    local code = tonumber(codeNum)
    if not code or not statusCodes[tostring(code)] then
        log("Invalid code. Use /code to see all codes.", true)
        return
    end
    
    local statusText = getStatusFromCode(code)
    cmdStatus(statusText)
end

--- /status [text] - Change unit status
local function cmdStatus(text)
    if state.currentUnitId == "" then
        log("You are not in a unit! Create or join one first.", true)
        return
    end
    
    local status = text or "On Scene"
    local body = jsonEncode({
        Status = status,
        Nick = state.playerNick
    })
    
    local success, statusCode, response = httpPost("/api/units/" .. state.currentUnitId .. "/status", body)
    if success then
        logSuccess("Unit status: " .. status)
    else
        log("Error changing status", true)
    end
end

--- /unit create - Create new unit with yourself
local function cmdUnitCreate()
    if state.playerNick == "" then
        log("Nick not detected, reload script.", true)
        return
    end
    
    -- Marking: "A1" for first player nick A, B1, C1, etc.
    local marking = string.sub(state.playerNick, 1, 1) .. "1"
    
    local body = jsonEncode({
        Marking = marking,
        PlayerNicks = {state.playerNick},
        IsLeadUnit = false,
        CreatorNick = state.playerNick
    })
    
    local success, statusCode, response = httpPost("/api/units", body)
    if success and response ~= "" then
        local unit = jsonDecode(response)
        if unit.id or unit.Id then
            state.currentUnitId = unit.id or unit.Id
            logSuccess("Unit created! ID: " .. state.currentUnitId)
        else
            log("Error creating unit (parsing response)", true)
        end
    else
        log("Error creating unit (HTTP " .. statusCode .. ")", true)
    end
end

--- /unit join [unitId] - Join existing unit
local function cmdUnitJoin(unitId)
    if unitId == "" then
        log("Usage: /unit join [unitId]", true)
        return
    end
    
    local body = jsonEncode({
        PlayerNick = state.playerNick
    })
    
    local success = httpPost("/api/units/" .. unitId .. "/players/add", body)
    if success then
        state.currentUnitId = unitId
        logSuccess("You joined the unit!")
    else
        log("Error joining unit", true)
    end
end

--- /unit leave - Leave current unit
local function cmdUnitLeave()
    if state.currentUnitId == "" then
        log("You are not in a unit!", true)
        return
    end
    
    local unitId = state.currentUnitId
    local body = jsonEncode({
        PlayerNick = state.playerNick
    })
    
    local success = httpPost("/api/units/" .. unitId .. "/players/remove", body)
    if success then
        state.currentUnitId = ""
        logSuccess("You left the unit")
    else
        log("Error leaving unit", true)
    end
end

--- /unit lead - Toggle lead unit flag (creator only)
local function cmdUnitLead()
    if state.currentUnitId == "" then
        log("You are not in a unit!", true)
        return
    end
    
    local newLeadState = not state.isLeadUnit
    
    local body = jsonEncode({
        IsLeadUnit = newLeadState,
        Nick = state.playerNick
    })
    
    local success = httpPost("/api/units/" .. state.currentUnitId .. "/lead", body)
    if success then
        state.isLeadUnit = newLeadState
        logSuccess("Lead flag: " .. (newLeadState and "ON" or "OFF"))
    else
        log("Error toggling lead flag", true)
    end
end

--- /unit invite [nick] - Invite player to your unit
local function cmdUnitInvite(nick)
    if state.currentUnitId == "" then
        log("You are not in a unit!", true)
        return
    end
    if nick == "" then
        log("Usage: /unit invite [nick]", true)
        return
    end
    
    sampAddChatMessage("[{FFFF00}INVITE{FFFFFF}] /w " .. nick .. " Join my unit: " .. state.currentUnitId, -1)
    sampSendChat("/w " .. nick .. " [UNIT INVITE] Join unit: " .. state.currentUnitId .. " - Use: /unit join " .. state.currentUnitId)
    logSuccess("Invitation sent to " .. nick)
end

--- /unit request [unitId] - Request to join unit
local function cmdUnitRequest(unitId)
    if unitId == "" then
        log("Usage: /unit request [unitId]", true)
        return
    end
    
    -- Get unit info first to find creator
    local success, statusCode, response = httpGet("/api/units/" .. unitId)
    if success and response ~= "" then
        sampAddChatMessage("[{FFFF00}REQUEST{FFFFFF}] Sent request to unit " .. unitId, -1)
        logSuccess("Request sent for unit " .. unitId .. " - Ask unit members to approve")
    else
        log("Unit not found", true)
    end
end

--- /unit info - Show current unit info
local function cmdUnitInfo()
    if state.currentUnitId == "" then
        log("You are not in a unit!", true)
        return
    end
    
    local success, statusCode, response = httpGet("/api/units/" .. state.currentUnitId)
    if success and response ~= "" then
        local unit = jsonDecode(response)
        sampAddChatMessage("===== UNIT INFO =====", -1)
        sampAddChatMessage("ID: " .. (unit.Id or unit.id or "N/A"), -1)
        sampAddChatMessage("Marking: " .. (unit.Marking or unit.marking or "N/A"), -1)
        sampAddChatMessage("Status: " .. (unit.Status or unit.status or "N/A"), -1)
        sampAddChatMessage("Is Lead: " .. (state.isLeadUnit and "YES" or "NO"), -1)
    else
        log("Error fetching unit info", true)
    end
end

--- /sit create [type] - Create new situation
local function cmdSituationCreate(situationType)
    if situationType == "" then situationType = "code7" end
    
    if state.currentUnitId == "" then
        log("Create or join a unit first!", true)
        return
    end
    
    local x, y, z = getCharCoordinates(PLAYER_PED)
    
    local body = jsonEncode({
        Type = situationType,
        Metadata = {
            x = tostring(x),
            y = tostring(y),
            location = "Scene"
        },
        CreatorNick = state.playerNick
    })
    
    local success, statusCode, response = httpPost("/api/situations/create", body)
    if success and response ~= "" then
        local situation = jsonDecode(response)
        if situation.id or situation.Id then
            state.currentSituationId = situation.id or situation.Id
            logSuccess("Situation created! ID: " .. state.currentSituationId .. " Type: " .. situationType)
            
            -- Auto-attach current unit to situation
            if state.currentUnitId ~= "" then
                local attachBody = jsonEncode({UnitId = state.currentUnitId, AsLeadUnit = state.isLeadUnit})
                httpPost("/api/situations/" .. state.currentSituationId .. "/units/add", attachBody)
            end
        else
            log("Error creating situation (parsing response)", true)
        end
    else
        log("Error creating situation (HTTP " .. statusCode .. ")", true)
    end
end

--- /sit join [id] - Join existing situation
local function cmdSituationJoin(sitId)
    if sitId == "" then
        log("Usage: /sit join [situationId]", true)
        return
    end
    
    if state.currentUnitId == "" then
        log("You need to be in a unit to join a situation!", true)
        return
    end
    
    local body = jsonEncode({
        UnitId = state.currentUnitId,
        AsLeadUnit = false
    })
    
    local success = httpPost("/api/situations/" .. sitId .. "/units/add", body)
    if success then
        state.currentSituationId = sitId
        logSuccess("Unit joined situation!")
    else
        log("Error joining situation", true)
    end
end

--- /sit close - Close current situation (creator only)
local function cmdSituationClose()
    if state.currentSituationId == "" then
        log("No active situation!", true)
        return
    end
    
    local body = jsonEncode({
        Nick = state.playerNick
    })
    
    local success = httpPost("/api/situations/" .. state.currentSituationId .. "/close", body)
    if success then
        state.currentSituationId = ""
        logSuccess("Situation closed")
    else
        log("Error closing situation (maybe not creator?)", true)
    end
end

--- /sit leave - Leave current situation (remove unit from situation)
local function cmdSituationLeave()
    if state.currentSituationId == "" then
        log("No active situation!", true)
        return
    end
    
    if state.currentUnitId == "" then
        log("You are not in a unit!", true)
        return
    end
    
    local body = jsonEncode({
        UnitId = state.currentUnitId
    })
    
    local success = httpPost("/api/situations/" .. state.currentSituationId .. "/units/remove", body)
    if success then
        state.currentSituationId = ""
        logSuccess("You left the situation")
    else
        log("Error leaving situation", true)
    end
end

--- /sit lead - Set your unit as lead unit in situation
local function cmdSituationLead()
    if state.currentSituationId == "" then
        log("No active situation!", true)
        return
    end
    
    if state.currentUnitId == "" then
        log("You are not in a unit!", true)
        return
    end
    
    local body = jsonEncode({
        UnitId = state.currentUnitId
    })
    
    local success = httpPost("/api/situations/" .. state.currentSituationId .. "/lead", body)
    if success then
        logSuccess("Your unit is now the lead unit (Red Unit) in situation")
    else
        log("Error setting lead unit in situation", true)
    end
end

--- /sit list - List active situations
local function cmdSituationList()
    local success, statusCode, response = httpGet("/api/situations")
    if success and response ~= "" then
        local situations = jsonDecode(response)
        if type(situations) == "table" and #situations > 0 then
            sampAddChatMessage("===== ACTIVE SITUATIONS =====", -1)
            for i = 1, math.min(#situations, 10) do
                local sit = situations[i]
                local id = sit.id or sit.Id or "?"
                local typ = sit.type or sit.Type or "?"
                local isActive = sit.isActive or sit.IsActive or false
                if isActive then
                    sampAddChatMessage(i .. ". [" .. typ .. "] ID: " .. id, -1)
                end
            end
        else
            sampAddChatMessage("No active situations", -1)
        end
    else
        log("Error fetching situations", true)
    end
end

--- /panic - Trigger panic button (sets status, creates code7)
local function cmdPanic()
    state.isPanic = not state.isPanic
    
    if state.isPanic then
        sampAddChatMessage("[{FF0000}!!! PANIC ACTIVATED !!!{FFFFFF}]", -1)
        
        -- Set status to "Code 0 - Officer Down"
        if state.currentUnitId ~= "" then
            local body = jsonEncode({Status = "Code 0 - Officer Down", Nick = state.playerNick})
            httpPost("/api/units/" .. state.currentUnitId .. "/status", body)
        end
        
        -- Create Code 0 situation at current position
        local x, y, z = getCharCoordinates(PLAYER_PED)
        local body = jsonEncode({
            Type = "code0",
            Metadata = {
                x = tostring(x),
                y = tostring(y),
                location = "OFFICER DOWN / PANIC"
            },
            CreatorNick = state.playerNick
        })
        
        local success, statusCode, response = httpPost("/api/situations/create", body)
        if success and response ~= "" then
            local situation = jsonDecode(response)
            state.currentSituationId = situation.id or situation.Id or ""
            logSuccess("PANIC - Backup requested! Situation ID: " .. state.currentSituationId)
        end
    else
        sampAddChatMessage("[{00FF00}PANIC DEACTIVATED{FFFFFF}]", -1)
        if state.currentUnitId ~= "" then
            local body = jsonEncode({Status = "Code 4 - Assistance Not Needed", Nick = state.playerNick})
            httpPost("/api/units/" .. state.currentUnitId .. "/status", body)
        end
    end
end

--- /backup - Request backup (creates code7 at your location)
local function cmdBackup()
    local x, y, z = getCharCoordinates(PLAYER_PED)
    
    local body = jsonEncode({
        Type = "code7",
        Metadata = {
            x = tostring(x),
            y = tostring(y),
            location = "Backup requested"
        },
        CreatorNick = state.playerNick
    })
    
    local success, statusCode, response = httpPost("/api/situations/create", body)
    if success and response ~= "" then
        local situation = jsonDecode(response)
        state.currentSituationId = situation.id or situation.Id or ""
        logSuccess("Backup requested! Situation created.")
        
        -- Auto-attach unit
        if state.currentUnitId ~= "" then
            local attachBody = jsonEncode({UnitId = state.currentUnitId, AsLeadUnit = true})
            httpPost("/api/situations/" .. state.currentSituationId .. "/units/add", attachBody)
        end
    else
        log("Error requesting backup", true)
    end
end

--- /prst [playerId] - Start pursuit tracking suspect
local function cmdPursuitStart(playerId)
    local id = tonumber(playerId)
    if not id or id < 0 or id > 999 then
        log("Usage: /prst [playerId] - Start tracking suspect", true)
        return
    end
    
    -- Check if player exists
    local result, handle = sampGetCharHandleBySampPlayerId(id)
    if not result then
        log("Player ID " .. id .. " not found!", true)
        return
    end
    
    state.pursuitSuspectId = id
    
    -- Create pursuit situation
    local x, y, z = getCharCoordinates(handle)
    
    local suspectName = sampGetPlayerNickname(id) or "Unknown"
    
    local body = jsonEncode({
        Type = "pursuit",
        Metadata = {
            x = tostring(x),
            y = tostring(y),
            location = "Pursuit: " .. suspectName .. " (ID: " .. id .. ")",
            suspect = suspectName
        },
        CreatorNick = state.playerNick
    })
    
    local success, statusCode, response = httpPost("/api/situations/create", body)
    if success and response ~= "" then
        local situation = jsonDecode(response)
        state.currentSituationId = situation.id or situation.Id or ""
        logSuccess("PURSUIT started! Tracking: " .. suspectName .. " (ID: " .. id .. ")")
        
        -- Auto-attach unit as lead
        if state.currentUnitId ~= "" then
            local attachBody = jsonEncode({UnitId = state.currentUnitId, AsLeadUnit = true})
            httpPost("/api/situations/" .. state.currentSituationId .. "/units/add", attachBody)
        end
        
        -- Set unit status
        if state.currentUnitId ~= "" then
            local statusBody = jsonEncode({Status = "Code 3 - Response Lights/Sirens", Nick = state.playerNick})
            httpPost("/api/units/" .. state.currentUnitId .. "/status", statusBody)
        end
    else
        log("Error starting pursuit", true)
    end
end

--- /units nearby - Find nearest units to your position
local function cmdUnitsNearby()
    local x, y, z = getCharCoordinates(PLAYER_PED)
    
    local success, statusCode, response = httpGet("/api/units/nearest?x=" .. x .. "&y=" .. y .. "&limit=5")
    if success and response ~= "" then
        local units = jsonDecode(response)
        if type(units) == "table" and #units > 0 then
            sampAddChatMessage("===== NEAREST UNITS =====", -1)
            for i = 1, #units do
                local u = units[i]
                local unit = u.unit or u.Unit or {}
                local dist = u.distance or u.Distance or 0
                local marking = unit.marking or unit.Marking or "?"
                sampAddChatMessage(i .. ". " .. marking .. " - " .. string.format("%.0f", dist) .. "m away", -1)
            end
        else
            sampAddChatMessage("No units nearby", -1)
        end
    else
        log("Error fetching nearby units", true)
    end
end

-- ============================================================================
-- HEARTBEAT & PURSUIT TRACKING
-- ============================================================================

--- Send heartbeat to server (position, AFK status, in vehicle status)
local function sendHeartbeat()
    if state.playerNick == "" then
        return
    end
    
    local x, y, z = getCharCoordinates(PLAYER_PED)
    local isAFK = false
    local isInVehicle = isCharInAnyCar(PLAYER_PED)
    
    local body = jsonEncode({
        nick = state.playerNick,
        x = x,
        y = y,
        isAFK = isAFK,
        isInVehicle = isInVehicle
    })
    
    local _ = httpPost("/api/coords/heartbeat", body)
    state.lastHeartbeat = os.time()
end

--- Update pursuit suspect coordinates
local function updatePursuitTracking()
    if state.pursuitSuspectId < 0 or state.currentSituationId == "" then
        return
    end
    
    -- Check if suspect still exists
    local result, handle = sampGetCharHandleBySampPlayerId(state.pursuitSuspectId)
    if not result then
        log("Pursuit target lost!", true)
        state.pursuitSuspectId = -1
        return
    end
    
    -- Get suspect coordinates
    local x, y, z = getCharCoordinates(handle)
    local suspectName = sampGetPlayerNickname(state.pursuitSuspectId) or "Unknown"
    
    -- Update situation location
    local body = jsonEncode({
        Location = "Pursuit: " .. suspectName,
        X = x,
        Y = y
    })
    
    httpPost("/api/situations/" .. state.currentSituationId .. "/location", body)
    state.lastPursuitUpdate = os.time()
    
    -- Set waypoint to suspect
    placeWaypoint(x, y)
end

-- ============================================================================
-- EVENTS & HOOKS
-- ============================================================================

function onScriptInit()
    -- Get player nickname
    local playerName = sampGetPlayerNickname(select(2, sampGetPlayerIdByCharHandle(PLAYER_PED)))
    if playerName then
        state.playerNick = playerName
        logSuccess("Player nick: " .. state.playerNick)
    end
    
    -- Register commands
    sampRegisterChatCommand("status", function(text) cmdStatus(text) end)
    sampRegisterChatCommand("code", function(text) cmdCode(text) end)
    
    sampRegisterChatCommand("unit", function(text) 
        local parts = split(text, " ")
        local cmd = parts[1] or ""
        if cmd == "create" then
            cmdUnitCreate()
        elseif cmd == "join" then
            cmdUnitJoin(parts[2] or "")
        elseif cmd == "leave" then
            cmdUnitLeave()
        elseif cmd == "lead" then
            cmdUnitLead()
        elseif cmd == "invite" then
            cmdUnitInvite(parts[2] or "")
        elseif cmd == "request" then
            cmdUnitRequest(parts[2] or "")
        elseif cmd == "info" then
            cmdUnitInfo()
        else
            sampAddChatMessage("Usage: /unit create|join [id]|leave|lead|invite [nick]|request [id]|info", -1)
        end
    end)
    
    sampRegisterChatCommand("sit", function(text)
        local parts = split(text, " ")
        local cmd = parts[1] or ""
        if cmd == "create" then
            cmdSituationCreate(parts[2] or "")
        elseif cmd == "join" then
            cmdSituationJoin(parts[2] or "")
        elseif cmd == "close" then
            cmdSituationClose()
        elseif cmd == "leave" then
            cmdSituationLeave()
        elseif cmd == "lead" then
            cmdSituationLead()
        elseif cmd == "list" then
            cmdSituationList()
        else
            sampAddChatMessage("Usage: /sit create [type]|join [id]|close|leave|lead|list", -1)
        end
    end)
    
    sampRegisterChatCommand("panic", function() cmdPanic() end)
    sampRegisterChatCommand("backup", function() cmdBackup() end)
    sampRegisterChatCommand("prst", function(text) cmdPursuitStart(text) end)
    sampRegisterChatCommand("units", function(text)
        if text == "nearby" then
            cmdUnitsNearby()
        else
            sampAddChatMessage("Usage: /units nearby", -1)
        end
    end)
    
    logSuccess("Script initialized! Commands: /status, /code, /unit, /sit, /panic, /backup, /prst, /units")
    sampAddChatMessage("=== UNIT ASSISTANT LOADED ===", -1)
    sampAddChatMessage("Type /unit create to start", -1)
end

function onScriptUpdate()
    -- Heartbeat every N seconds
    local now = os.time()
    if (now - state.lastHeartbeat) >= config.heartbeatInterval then
        sendHeartbeat()
    end
    
    -- Update pursuit tracking if active
    if state.pursuitSuspectId >= 0 and (now - state.lastPursuitUpdate) >= config.pursuitUpdateInterval then
        updatePursuitTracking()
    end
end

function onScriptTerminate()
    logSuccess("Script terminated")
end

-- Split string by delimiter (helper)
function split(str, delimiter)
    local result = {}
    if str == "" then return result end
    
    local pattern = string.format("([^%s]+)", delimiter)
    for part in string.gmatch(str, pattern) do
        table.insert(result, part)
    end
    return result
end

-- Register update hook
if not updateHook then
    updateHook = function()
        onScriptUpdate()
    end
end

-- ============================================================================
-- INITIALIZATION
-- ============================================================================

onScriptInit()
