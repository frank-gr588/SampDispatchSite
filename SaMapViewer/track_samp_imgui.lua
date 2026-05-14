-- ============================================================================
-- SaMapViewer ImGui Assistant - SA-MP Unit Control with ImGui
-- ============================================================================
-- Modern GUI for unit/situation management without dispatcher
-- All logic on server (C#), script only handles ImGui UI + REST calls
-- ============================================================================

local config = {
    serverUrl = "http://localhost:80",
    apiKey = "",
    heartbeatInterval = 30,
    pursuitUpdateInterval = 3
}

local state = {
    playerNick = "",
    currentUnitId = "",
    currentSituationId = "",
    isLeadUnit = false,
    isPanic = false,
    lastHeartbeat = 0,
    pursuitSuspectId = -1,
    lastPursuitUpdate = 0
}

local gui = {
    mainWindow = {show = true, pos = {400, 200}, size = {900, 600}},
    activeTab = 0,  -- 0=Units, 1=Situations, 2=Status, 3=Emergency
    
    -- Unit Management
    units = {},
    selectedUnitIdx = 0,
    newUnitMarking = "",
    newUnitPlayerNicks = "",
    
    -- Situation Management
    situations = {},
    selectedSituationIdx = 0,
    newSituationType = "code7",
    newSituationLocation = "",
    situationX = 0,
    situationY = 0,
    
    -- Status
    statusText = "",
    selectedCodeIdx = 0,
    
    -- Emergency
    pursuitSuspectId = ""
}

local statusCodes = {
    "Code 0 - Officer Down",
    "Code 1 - Officer Under Fire",
    "Code 2 - Response No Lights",
    "Code 3 - Response Lights/Sirens",
    "Code 4 - Assistance Not Needed",
    "Code 6 - Investigation Scene",
    "Code 7 - Break"
}

local statusCodesMap = {
    ["0"] = "Code 0 - Officer Down",
    ["1"] = "Code 1 - Officer Under Fire",
    ["2"] = "Code 2 - Response No Lights",
    ["3"] = "Code 3 - Response Lights/Sirens",
    ["4"] = "Code 4 - Assistance Not Needed",
    ["6"] = "Code 6 - Investigation Scene",
    ["7"] = "Code 7 - Break"
}

-- ============================================================================
-- HELPERS
-- ============================================================================

local function log(msg, isError)
    if isError then
        sampAddChatMessage("[{FF0000}ERROR{FFFFFF}] " .. msg, -1)
    else
        sampAddChatMessage("[{00FF00}UNIT{FFFFFF}] " .. msg, -1)
    end
end

local function logSuccess(msg)
    sampAddChatMessage("[{00FF00}✓{FFFFFF}] " .. msg, -1)
end

local function debugLog(msg)
    print("[DISPATCH] " .. msg)
end

-- ============================================================================
-- NETWORK FUNCTIONS
-- ============================================================================

local function httpPost(endpoint, body)
    local url = config.serverUrl .. endpoint
    local headers = {["Content-Type"] = "application/json"}
    
    if config.apiKey and config.apiKey ~= "" then
        headers["x-api-key"] = config.apiKey
    end
    
    local ok = pcall(function()
        local req = requests.post(url, {data = body, headers = headers})
        return (req.status_code >= 200 and req.status_code < 300), req.text
    end)
    
    return ok
end

local function httpGet(endpoint)
    local url = config.serverUrl .. endpoint
    local ok = pcall(function()
        local req = requests.get(url)
        return (req.status_code >= 200 and req.status_code < 300), req.text
    end)
    
    return ok
end

-- ============================================================================
-- JSON HELPERS
-- ============================================================================

local function jsonEncode(tbl)
    if type(tbl) == "string" then return '"' .. tbl .. '"' end
    if type(tbl) == "number" then return tostring(tbl) end
    if type(tbl) == "boolean" then return tbl and "true" or "false" end
    
    if type(tbl) ~= "table" then return "null" end
    
    local isArray = true
    for k in pairs(tbl) do
        if type(k) ~= "number" then
            isArray = false
            break
        end
    end
    
    if isArray then
        local result = "["
        for i, v in ipairs(tbl) do
            if i > 1 then result = result .. "," end
            result = result .. jsonEncode(v)
        end
        return result .. "]"
    else
        local result = "{"
        local first = true
        for k, v in pairs(tbl) do
            if not first then result = result .. "," end
            result = result .. '"' .. tostring(k) .. '":' .. jsonEncode(v)
            first = false
        end
        return result .. "}"
    end
end

-- ============================================================================
-- API CALLS
-- ============================================================================

local function apiCreateUnit()
    if gui.newUnitMarking == "" then
        log("Unit marking required", true)
        return
    end
    
    local body = jsonEncode({
        Marking = gui.newUnitMarking,
        PlayerNicks = {state.playerNick},
        CreatorNick = state.playerNick
    })
    
    if httpPost("/api/units", body) then
        logSuccess("Unit created: " .. gui.newUnitMarking)
        gui.newUnitMarking = ""
        apiGetUnits()
    else
        log("Failed to create unit", true)
    end
end

local function apiJoinUnit(unitId)
    local body = jsonEncode({PlayerNick = state.playerNick})
    
    if httpPost("/api/units/" .. unitId .. "/players/add", body) then
        state.currentUnitId = unitId
        logSuccess("Joined unit")
        apiGetUnits()
    else
        log("Failed to join unit", true)
    end
end

local function apiLeaveUnit()
    if state.currentUnitId == "" then
        log("Not in a unit", true)
        return
    end
    
    local body = jsonEncode({PlayerNick = state.playerNick})
    if httpPost("/api/units/" .. state.currentUnitId .. "/players/remove", body) then
        state.currentUnitId = ""
        logSuccess("Left unit")
        apiGetUnits()
    else
        log("Failed to leave unit", true)
    end
end

local function apiSetUnitStatus(status)
    if state.currentUnitId == "" then
        log("Not in a unit", true)
        return
    end
    
    local body = jsonEncode({Status = status, Nick = state.playerNick})
    if httpPost("/api/units/" .. state.currentUnitId .. "/status", body) then
        logSuccess("Status updated: " .. status)
    else
        log("Failed to update status", true)
    end
end

local function apiGetUnits()
    if httpGet("/api/units") then
        -- TODO: Parse units list from response
    end
end

local function apiCreateSituation(situationType)
    local x, y, z = getCharCoordinates(PLAYER_PED)
    
    local body = jsonEncode({
        Type = situationType,
        Metadata = {
            LocationName = gui.newSituationLocation or "Unknown",
            X = tostring(x),
            Y = tostring(y)
        },
        CreatorNick = state.playerNick
    })
    
    if httpPost("/api/situations/create", body) then
        logSuccess("Situation created: " .. situationType)
        gui.newSituationType = "code7"
        gui.newSituationLocation = ""
    else
        log("Failed to create situation", true)
    end
end

local function apiJoinSituation(situationId)
    if state.currentUnitId == "" then
        log("You need to be in a unit first", true)
        return
    end
    
    local body = jsonEncode({UnitId = state.currentUnitId})
    if httpPost("/api/situations/" .. situationId .. "/units/add", body) then
        state.currentSituationId = situationId
        logSuccess("Joined situation")
    else
        log("Failed to join situation", true)
    end
end

local function apiLeaveSituation()
    if state.currentSituationId == "" then
        log("Not in a situation", true)
        return
    end
    
    local body = jsonEncode({UnitId = state.currentUnitId})
    if httpPost("/api/situations/" .. state.currentSituationId .. "/units/remove", body) then
        state.currentSituationId = ""
        logSuccess("Left situation")
    else
        log("Failed to leave situation", true)
    end
end

local function apiSetLeadUnit()
    if state.currentSituationId == "" then
        log("Not in a situation", true)
        return
    end
    
    local body = jsonEncode({UnitId = state.currentUnitId})
    if httpPost("/api/situations/" .. state.currentSituationId .. "/lead", body) then
        logSuccess("Your unit is now the lead unit")
    else
        log("Failed to set lead unit", true)
    end
end

-- ============================================================================
-- HEARTBEAT
-- ============================================================================

local function sendHeartbeat()
    if os.time() - state.lastHeartbeat < config.heartbeatInterval then
        return
    end
    
    state.lastHeartbeat = os.time()
    
    local x, y, z = getCharCoordinates(PLAYER_PED)
    local inCar = isCharInAnyCar(PLAYER_PED)
    
    local body = jsonEncode({
        PlayerNick = state.playerNick,
        X = x,
        Y = y,
        Z = z,
        InCar = inCar,
        UnitId = state.currentUnitId
    })
    
    local ok = pcall(function()
        requests.post(config.serverUrl .. "/api/coords/update", {
            data = body,
            headers = {["Content-Type"] = "application/json"}
        })
    end)
end

-- ============================================================================
-- ImGui RENDERING
-- ============================================================================

local function drawUnitsTab()
    ImGui.Text("Active Unit: " .. (state.currentUnitId == "" and "None" or state.currentUnitId))
    ImGui.Spacing()
    
    ImGui.Text("Create New Unit:")
    ImGui.InputText("Unit Marking##marking", gui.newUnitMarking)
    gui.newUnitMarking = ImGui.GetInputTextValue()
    
    if ImGui.Button("Create Unit##btn", 150, 25) then
        apiCreateUnit()
    end
    
    ImGui.Separator()
    ImGui.Text("Available Units:")
    ImGui.BeginListBox("##unitsList", 400, 200)
    
    for i = 1, 10 do
        if ImGui.Selectable("Unit #" .. i .. "##u" .. i, gui.selectedUnitIdx == i) then
            gui.selectedUnitIdx = i
        end
    end
    
    ImGui.EndListBox()
    
    ImGui.Spacing()
    if ImGui.Button("Join Selected##join", 150, 25) then
        if gui.selectedUnitIdx > 0 then
            -- apiJoinUnit()
        end
    end
    
    ImGui.SameLine()
    if ImGui.Button("Leave Unit##leave", 150, 25) then
        apiLeaveUnit()
    end
end

local function drawSituationsTab()
    ImGui.Text("Active Situation: " .. (state.currentSituationId == "" and "None" or state.currentSituationId))
    ImGui.Spacing()
    
    ImGui.Text("Create New Situation:")
    
    local typeItems = {"code7", "code0", "pursuit", "code6"}
    if ImGui.BeginCombo("Situation Type##type", typeItems[gui.selectedCodeIdx + 1] or "code7") then
        for i, v in ipairs(typeItems) do
            if ImGui.Selectable(v, i - 1 == gui.selectedCodeIdx) then
                gui.selectedCodeIdx = i - 1
            end
        end
        ImGui.EndCombo()
    end
    
    ImGui.InputText("Location##loc", gui.newSituationLocation)
    gui.newSituationLocation = ImGui.GetInputTextValue()
    
    if ImGui.Button("Create Situation##btn", 150, 25) then
        apiCreateSituation(typeItems[gui.selectedCodeIdx + 1] or "code7")
    end
    
    ImGui.Separator()
    ImGui.Text("Situations on Scene:")
    ImGui.BeginListBox("##situationsList", 400, 200)
    
    for i = 1, 10 do
        if ImGui.Selectable("Situation #" .. i .. "##s" .. i, gui.selectedSituationIdx == i) then
            gui.selectedSituationIdx = i
        end
    end
    
    ImGui.EndListBox()
    
    ImGui.Spacing()
    if ImGui.Button("Join Situation##jsit", 150, 25) then
        if gui.selectedSituationIdx > 0 then
            apiJoinSituation()
        end
    end
    
    ImGui.SameLine()
    if ImGui.Button("Leave Situation##lsit", 150, 25) then
        apiLeaveSituation()
    end
    
    ImGui.SameLine()
    if ImGui.Button("Set as Lead##lead", 150, 25) then
        apiSetLeadUnit()
    end
end

local function drawStatusTab()
    ImGui.Text("Set Unit Status Code:")
    ImGui.Spacing()
    
    for i, code in ipairs(statusCodes) do
        local codeNum = tostring(i - 1)
        if i == 5 then codeNum = "4" end
        if i == 6 then codeNum = "6" end
        if i == 7 then codeNum = "7" end
        
        if ImGui.Button(code .. "##code" .. i, 300, 25) then
            apiSetUnitStatus(code)
        end
    end
    
    ImGui.Separator()
    ImGui.Text("Custom Status:")
    ImGui.InputText("Status Text##custom", gui.statusText)
    gui.statusText = ImGui.GetInputTextValue()
    
    if ImGui.Button("Set Custom Status##setcustom", 150, 25) then
        if gui.statusText ~= "" then
            apiSetUnitStatus(gui.statusText)
        end
    end
end

local function drawEmergencyTab()
    ImGui.TextColored(255, 0, 0, 255, "EMERGENCY ACTIONS", true)
    ImGui.Spacing()
    
    if ImGui.Button("PANIC BUTTON - Code 0", 300, 40) then
        apiCreateSituation("code0")
        state.isPanic = not state.isPanic
    end
    
    ImGui.Spacing()
    
    if ImGui.Button("REQUEST BACKUP - Code 7", 300, 40) then
        apiCreateSituation("code7")
    end
    
    ImGui.Spacing()
    ImGui.Separator()
    ImGui.Text("Start Pursuit Tracking:")
    ImGui.InputText("Suspect ID##suspect", gui.pursuitSuspectId)
    gui.pursuitSuspectId = ImGui.GetInputTextValue()
    
    if ImGui.Button("Start Pursuit##pursuit", 150, 25) then
        if gui.pursuitSuspectId ~= "" then
            state.pursuitSuspectId = tonumber(gui.pursuitSuspectId) or -1
        end
    end
end

-- ============================================================================
-- MAIN ImGui WINDOW
-- ============================================================================

function showMainWindow()
    local res, draw = ImGui.Begin("Dispatch Assistant", gui.mainWindow.show, 
        ImGui.WindowFlags.AlwaysAutoResize)
    
    gui.mainWindow.show = res
    
    if draw then
        if ImGui.BeginTabBar("tabs") then
            
            if ImGui.BeginTabItem("Units", true) then
                drawUnitsTab()
                ImGui.EndTabItem()
            end
            
            if ImGui.BeginTabItem("Situations", false) then
                drawSituationsTab()
                ImGui.EndTabItem()
            end
            
            if ImGui.BeginTabItem("Status", false) then
                drawStatusTab()
                ImGui.EndTabItem()
            end
            
            if ImGui.BeginTabItem("Emergency", false) then
                drawEmergencyTab()
                ImGui.EndTabItem()
            end
            
            ImGui.EndTabBar()
        end
    end
    
    ImGui.End()
end

-- ============================================================================
-- MAIN LOOP
-- ============================================================================

function main()
    if not isSampLoaded() then return end
    while not isSampConnected() do wait(100) end
    
    state.playerNick = sampGetPlayerNickname(select(2, sampGetPlayerIdByCharHandle(PLAYER_PED)))
    debugLog("Player: " .. state.playerNick)
    
    while true do
        wait(0)
        
        -- Toggle window with Alt+D
        if isKeyJustPressed(VK_D) and isKeyDown(VK_MENU) then
            gui.mainWindow.show = not gui.mainWindow.show
        end
        
        sendHeartbeat()
        
        local wndMsg = getGamekeyPressedCount("toggle_submissions")
        ImGui.ShowCursor(gui.mainWindow.show)
        
        if gui.mainWindow.show then
            showMainWindow()
        end
    end
end

sampRegisterChatCommand("dispatch", function()
    gui.mainWindow.show = not gui.mainWindow.show
end)
