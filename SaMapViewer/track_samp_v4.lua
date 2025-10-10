-- ============================================================================
-- SA-MP Police Tracking System v4.0
-- Двусторонняя синхронизация с веб-панелью управления
-- ============================================================================

script_name('SAPD Tracker v4')
script_author('Your Name')
script_version('4.0.0')

require 'lib.moonloader'
local encoding = require 'encoding'
local requests = require 'requests'
local json = require 'dkjson'

-- Попытка загрузить ImGui (может не быть установлен)
local imgui_loaded, imgui = pcall(require, 'mimgui')
local ffi_loaded, ffi = false, nil
if imgui_loaded then
    ffi_loaded, ffi = pcall(require, 'ffi')
end

encoding.default = 'CP1251'
u8 = encoding.UTF8

-- Маленькие хелперы
local function joinOrEmpty(tbl, sep)
    if type(tbl) ~= 'table' then return '' end
    if #tbl == 0 then return '' end
    return table.concat(tbl, sep or ', ')
end

-- Простая URL-энкодировка для безопасного использования в путях
local function renderMainWindow()
    -- Minimal safe renderer: depend on the binding to call imgui.Process
    if not imgui_loaded or not ffi_loaded then return end
    if not mainWindow or not mainWindow[0] then return end

    -- Set a sane default position/size on first use
    imgui.SetNextWindowPos(imgui.ImVec2(50, 50), imgui.Cond.FirstUseEver)
    imgui.SetNextWindowSize(imgui.ImVec2(600, 700), imgui.Cond.FirstUseEver)

    local opened = imgui.Begin('SAPD Tracker', mainWindow, imgui.WindowFlags.NoCollapse)
    -- draw contents when opened; always call End to keep stack balanced
    if opened then
        imgui.TextColored(imgui.ImVec4(0.2, 0.8, 1.0, 1.0), 'Officer: ' .. (state.playerNick or 'Unknown'))
        imgui.Separator()

        -- Unit management
        if imgui.CollapsingHeader('Unit Management', imgui.TreeNodeFlags.DefaultOpen) then
            if state.currentUnit then
                imgui.TextColored(imgui.ImVec4(0.2, 1.0, 0.2, 1.0), 'Current Unit: ' .. state.currentUnit.marking)
                imgui.Text('Status: ' .. (state.currentUnit.status or 'Code 5'))
                imgui.Text('Members: ' .. joinOrEmpty(state.currentUnit.playerNicks, ', '))

                imgui.Spacing()
                if imgui.Button('Leave Unit', imgui.ImVec2(200, 30)) then
                    leaveUnit(state.currentUnit.id)
                end

                imgui.Spacing()
                imgui.Text('Quick Status Change:')
                if imgui.Button('Code 2', imgui.ImVec2(90, 25)) then cmd_code2() end
                imgui.SameLine()
                if imgui.Button('Code 3', imgui.ImVec2(90, 25)) then cmd_code3() end
                imgui.SameLine()
                if imgui.Button('Code 4', imgui.ImVec2(90, 25)) then cmd_code4() end

                if imgui.Button('Code 6', imgui.ImVec2(90, 25)) then cmd_code6() end
                imgui.SameLine()
                if imgui.Button('Code 7', imgui.ImVec2(90, 25)) then cmd_code7() end
            else
                imgui.TextColored(imgui.ImVec4(1.0, 0.5, 0.0, 1.0), 'Not in a unit')
                imgui.Spacing()

                imgui.InputText('Unit Marking', inputBuffer.unitMarking, 64)
                if imgui.Button('Create Unit', imgui.ImVec2(200, 30)) then
                    local marking = ffi.string(inputBuffer.unitMarking)
                    if marking ~= '' then
                        createUnit(marking)
                    else
                        notifyError('Enter unit marking!')
                    end
                end
            end
        end

        imgui.Spacing()
        imgui.Separator()

        -- Situations
        if imgui.CollapsingHeader('Situations', imgui.TreeNodeFlags.DefaultOpen) then
            imgui.InputText('Type (911/code6/traffic/backup)', inputBuffer.situationType, 64)
            if imgui.Button('Create Situation', imgui.ImVec2(200, 30)) then
                local sitType = ffi.string(inputBuffer.situationType)
                if sitType ~= '' then
                    cmd_sit(sitType)
                else
                    notifyError('Enter situation type!')
                end
            end

            imgui.Spacing()
            if imgui.Button('PANIC BUTTON', imgui.ImVec2(200, 40)) then
                cmd_panic()
            end

            imgui.Spacing()
            imgui.InputInt('Target ID', inputBuffer.targetId)
            if imgui.Button('Start Pursuit', imgui.ImVec2(200, 30)) then
                local targetId = inputBuffer.targetId[0]
                if targetId > 0 then
                    cmd_prst(tostring(targetId))
                else
                    notifyError('Enter valid player ID!')
                end
            end

            imgui.Spacing()
            if state.isInPanic or state.trackingTarget then
                if imgui.Button('Clear Panic/Pursuit', imgui.ImVec2(200, 30)) then
                    cmd_clear()
                end
            end
        end

        imgui.Spacing()
        imgui.Separator()

        -- Info
        if imgui.CollapsingHeader('Info') then
            imgui.Text('AFK Status: ' .. (state.isAFK and 'AFK' or 'Active'))
            local x, y, z = getCharCoordinates(PLAYER_PED)
            local location = getLocationName(x, y, z)
            imgui.Text('Location: ' .. location)
            imgui.Text('Coords: ' .. string.format('%.1f, %.1f, %.1f', x, y, z))
        end

        imgui.Spacing()
        if imgui.Button('Close Menu', imgui.ImVec2(120, 28)) then
            if mainWindow then mainWindow[0] = false end
        end
    end
    imgui.End()
end
end
if type(logWarn) ~= 'function' and type(writeLog) == 'function' then
    function logWarn(message, data) writeLog(LOG_LEVELS.WARN, message, data) end
end
if type(logError) ~= 'function' and type(writeLog) == 'function' then
    function logError(message, data) writeLog(LOG_LEVELS.ERROR, message, data) end
end

-- Транслитерация русского текста
function transliterate(text)
    local rus = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя"
    local eng = {
        "A","B","V","G","D","E","E","Zh","Z","I","Y","K","L","M","N","O","P","R","S","T","U","F","Kh","Ts","Ch","Sh","Sch","","Y","","E","Yu","Ya",
        "a","b","v","g","d","e","e","zh","z","i","y","k","l","m","n","o","p","r","s","t","u","f","kh","ts","ch","sh","sch","","y","","e","yu","ya"
    }
    local result = text
    for i = 1, #rus do
        local char = rus:sub(i, i)
        result = result:gsub(char, eng[i] or char)
    end
    return result
end

function notify(message)
    sampAddChatMessage('[SAPD Tracker] {FFFFFF}' .. transliterate(message), 0x3498DB)
end

function notifyError(message)
    sampAddChatMessage('[SAPD Tracker] {FF0000}' .. transliterate(message), 0xFF0000)
end

function notifySuccess(message)
    sampAddChatMessage('[SAPD Tracker] {00FF00}' .. transliterate(message), 0x00FF00)
end

function notifyWarning(message)
    sampAddChatMessage('[SAPD Tracker] {FFAA00}' .. transliterate(message), 0xFFAA00)
end

-- Звуковой сигнал
function playSound(soundId)
    local sounds = {
        notification = 1139,  -- Стандартный звук уведомления
        panic = 1149,         -- Тревожный звук
        backup = 1138,        -- Звук рации
    }
    addOneOffSound(0, 0, 0, sounds[soundId] or sounds.notification)
end

-- Дебаг: вывод таблицы в читаемом виде
local function dumpTable(tbl, indent)
    indent = indent or 0
    local result = {}
    for k, v in pairs(tbl) do
        local formatting = string.rep("  ", indent) .. tostring(k) .. ": "
        if type(v) == "table" then
            table.insert(result, formatting)
            table.insert(result, dumpTable(v, indent + 1))
        else
            table.insert(result, formatting .. tostring(v))
        end
    end
    return table.concat(result, "\n")
end

-- Дебаг: показать текущее состояние
function debugShowState()
    if not CONFIG.DEBUG_MODE then
        notify('Debug mode is OFF. Use /debug on to enable')
        return
    end
    
    notify('=== DEBUG: Current State ===')
    notify('Player: ' .. (state.playerNick or 'nil'))
    notify('AFK: ' .. tostring(state.isAFK))
    notify('In Panic: ' .. tostring(state.isInPanic))
    notify('Current Unit: ' .. (state.currentUnit and state.currentUnit.marking or 'nil'))
    notify('Current Situation: ' .. (state.currentSituation and state.currentSituation.type or 'nil'))
    notify('Tracking Target: ' .. (state.trackingTarget and tostring(state.trackingTarget.playerId) or 'nil'))
    
    if state.currentUnit then
        notify('Unit Members: ' .. joinOrEmpty(state.currentUnit.playerNicks, ', '))
        notify('Unit Status: ' .. (state.currentUnit.status or 'nil'))
    end
    
    local x, y, z = getCharCoordinates(PLAYER_PED)
    notify(string.format('Position: %.1f, %.1f, %.1f', x, y, z))
    notify('Location: ' .. getLocationName(x, y, z))
end

-- Дебаг: показать конфигурацию
function debugShowConfig()
    if not CONFIG.DEBUG_MODE then
        notify('Debug mode is OFF. Use /debug on to enable')
        return
    end
    
    notify('=== DEBUG: Configuration ===')
    notify('API URL: ' .. CONFIG.API_URL)
    notify('API Key: ' .. CONFIG.API_KEY)
    notify('Update Interval: ' .. CONFIG.UPDATE_INTERVAL .. ' ms')
    notify('AFK Check: ' .. CONFIG.AFK_CHECK_INTERVAL .. ' ms')
    notify('AFK Threshold: ' .. CONFIG.AFK_THRESHOLD .. ' sec')
    notify('Location Update: ' .. CONFIG.LOCATION_UPDATE_INTERVAL .. ' ms')
    notify('Debug Mode: ' .. tostring(CONFIG.DEBUG_MODE))
    notify('ImGui Loaded: ' .. tostring(imgui_loaded))
end

-- Дебаг: тест API соединения
function debugTestAPI()
    notify('Testing API connection...')
    logDebug('Testing API: ' .. CONFIG.API_URL)
    apiRequest('GET', CONFIG.API_URL:gsub('/api', '') .. '/health', nil, function(err, res)
        if err then
            notifyError('API connection FAILED')
            logError('API Test Failed', err)
            return
        end
        -- When health returns, it's likely a plain text or JSON status
        notifySuccess('API connection OK')
    end)
end

-- Таблица основных зон GTA San Andreas
local SA_ZONES = {
    -- Los Santos
    {name = "Downtown Los Santos", minX = 1370.0, minY = -1577.6, maxX = 1463.9, maxY = -1200.0},
    {name = "Commerce", minX = 1370.0, minY = -1577.6, maxX = 1463.9, maxY = -1384.9},
    {name = "Pershing Square", minX = 1440.9, minY = -1722.3, maxX = 1583.5, maxY = -1577.6},
    {name = "Temple", minX = 1096.5, minY = -1026.3, maxX = 1252.3, maxY = -910.2},
    {name = "Market", minX = 787.5, minY = -1416.2, maxX = 1072.7, maxY = -1310.2},
    {name = "Rodeo", minX = 72.6, minY = -1684.7, maxX = 342.6, maxY = -1544.2},
    {name = "Vinewood", minX = 647.6, minY = -1416.2, maxX = 787.5, maxY = -1227.3},
    {name = "Richman", minX = 72.6, minY = -1404.9, maxX = 342.6, maxY = -1235.1},
    {name = "Mulholland", minX = 1414.1, minY = -600.9, maxX = 1724.8, maxY = -768.0},
    {name = "Ganton", minX = 2222.6, minY = -1722.3, maxX = 2632.8, maxY = -1628.5},
    {name = "Jefferson", minX = 2056.9, minY = -1372.0, maxX = 2281.4, maxY = -1210.7},
    {name = "Idlewood", minX = 1812.6, minY = -1602.3, maxX = 2124.7, maxY = -1449.7},
    {name = "Glen Park", minX = 1812.6, minY = -1449.7, maxX = 1996.9, maxY = -1350.7},
    {name = "East Los Santos", minX = 2421.0, minY = -1628.5, maxX = 2632.8, maxY = -1454.3},
    {name = "Las Colinas", minX = 1994.3, minY = -1100.8, maxX = 2056.9, maxY = -920.8},
    {name = "Verona Beach", minX = 930.2, minY = -2006.8, maxX = 1073.2, maxY = -1804.2},
    {name = "Santa Maria Beach", minX = 342.6, minY = -2173.3, maxX = 647.7, maxY = -1684.7},
    {name = "Marina", minX = 647.7, minY = -2173.3, maxX = 930.2, maxY = -1804.2},
    {name = "Los Santos Airport", minX = 1249.6, minY = -2394.3, maxX = 1852.0, maxY = -2179.2},
    
    -- San Fierro
    {name = "Downtown San Fierro", minX = -2270.0, minY = 458.4, maxX = -1922.0, maxY = 1100.0},
    {name = "Chinatown", minX = -2323.1, minY = 458.4, maxX = -1922.0, maxY = 578.4},
    {name = "Financial", minX = -1871.7, minY = 744.2, maxX = -1701.3, maxY = 1176.4},
    {name = "Calton Heights", minX = -2274.2, minY = 744.2, maxX = -2166.7, maxY = 1075.8},
    {name = "Juniper Hill", minX = -2533.0, minY = 578.4, maxX = -2274.2, maxY = 968.4},
    {name = "Doherty", minX = -2270.0, minY = -324.1, maxX = -1794.9, maxY = -222.6},
    {name = "Ocean Flats", minX = -2994.5, minY = -430.3, maxX = -2831.9, maxY = -222.6},
    {name = "San Fierro Airport", minX = -1499.9, minY = -600.0, maxX = -1242.9, maxY = 15.2},
    
    -- Las Venturas
    {name = "The Strip", minX = 2027.4, minY = 863.2, maxX = 2087.4, maxY = 1703.2},
    {name = "Come-A-Lot", minX = 2087.4, minY = 943.2, maxX = 2623.2, maxY = 1203.2},
    {name = "Starfish Casino", minX = 2437.4, minY = 1203.3, maxX = 2685.2, maxY = 1383.2},
    {name = "Old Venturas Strip", minX = 2162.4, minY = 2012.2, maxX = 2685.2, maxY = 2202.8},
    {name = "Redsands East", minX = 1463.9, minY = 863.2, maxX = 1667.9, maxY = 992.4},
    {name = "Redsands West", minX = 1236.6, minY = 1203.3, maxX = 1457.4, maxY = 1883.1},
    {name = "Julius Thruway", minX = 2623.2, minY = 943.2, maxX = 2749.9, maxY = 1055.9},
    {name = "Las Venturas Airport", minX = 1236.6, minY = 1203.3, maxX = 1457.4, maxY = 1883.1},
    
    -- Сельская местность
    {name = "Red County", minX = -450.0, minY = -1500.0, maxX = 400.0, maxY = -1100.0},
    {name = "Flint County", minX = -1600.0, minY = -2700.0, maxX = -1200.0, maxY = -2400.0},
    {name = "Whetstone", minX = -2900.0, minY = -2700.0, maxX = -2400.0, maxY = -2000.0},
    {name = "Bone County", minX = 400.0, minY = 500.0, maxX = 1000.0, maxY = 1200.0},
    {name = "Tierra Robada", minX = -1600.0, minY = 500.0, maxX = -1000.0, maxY = 1200.0},
}

-- Получить название зоны по координатам
function getLocationName(x, y, z)
    -- Проверяем по таблице зон
    for _, zone in ipairs(SA_ZONES) do
        if x >= zone.minX and x <= zone.maxX and y >= zone.minY and y <= zone.maxY then
            return zone.name
        end
    end
    
    -- Определяем город по грубым координатам
    if x >= 0 and x <= 3000 and y >= -3000 and y <= 0 then
        return "Los Santos"
    elseif x >= -3000 and x <= -1000 and y >= -1000 and y <= 2000 then
        return "San Fierro"
    elseif x >= 500 and x <= 3000 and y >= 500 and y <= 3000 then
        return "Las Venturas"
    else
        -- В крайнем случае возвращаем координаты
        return string.format("Coords: %.0f, %.0f", x, y)
    end
end

-- Проверка позиции для AFK
function hasPlayerMoved()
    if not isSampAvailable() or not isSampfuncsLoaded() then return false end
    
    local result, id = sampGetPlayerIdByCharHandle(PLAYER_PED)
    if not result then return false end
    
    local x, y, z = getCharCoordinates(PLAYER_PED)
    local distance = getDistanceBetweenCoords3d(
        x, y, z,
        state.lastPosition.x, state.lastPosition.y, state.lastPosition.z
    )
    
    if distance > 5.0 then  -- Переместился больше чем на 5 метров
        logDebug(string.format('Player moved: %.1fm', distance))
        state.lastPosition = {x = x, y = y, z = z}
        state.lastActivity = os.clock()
        if state.isAFK then
            state.isAFK = false
            notify('You are no longer AFK')
            logDebug('AFK status cleared (player moved)')
            sendAFKStatus(false)
        end
        return true
    end
    
    logDebug(string.format('Player stationary: %.1fm', distance))
    return false
end

-- ============================================================================
-- API ЗАПРОСЫ
-- ============================================================================

function apiRequest(method, endpoint, data, callback)

    local url
    if type(endpoint) == 'string' and endpoint:match('^https?://') then
        url = endpoint
    else
        url = CONFIG.API_URL .. endpoint
    end
    local headers = {
        ['Content-Type'] = 'application/json',
        ['X-API-Key'] = CONFIG.API_KEY
    }
    
    logDebug(string.format('API Request: %s %s', method, endpoint))
    if data and CONFIG.DEBUG_MODE then
        logDebug('Request Data: ' .. json.encode(data))
    end
    
    lua_thread.create(function()
        local startTime = os.clock()
        local response

        if method == 'GET' then
            response = requests.get(url, {headers = headers})
        elseif method == 'POST' then
            response = requests.post(url, {
                headers = headers,
                data = json.encode(data)
            })
        elseif method == 'PUT' then
            response = requests.put(url, {
                headers = headers,
                data = json.encode(data)
            })
        elseif method == 'DELETE' then
            response = requests.delete(url, {headers = headers})
        end

        local elapsed = (os.clock() - startTime) * 1000

        if response then
            logDebug(string.format('API Response: %s %s - Status: %d (%.0fms)', 
                method, endpoint, response.status_code, elapsed))

            if response.status_code == 200 or response.status_code == 201 or response.status_code == 204 then
                if response.text and response.text ~= '' and CONFIG.DEBUG_MODE then
                    logDebug('Response Body: ' .. response.text:sub(1, 200))
                end
                if type(callback) == 'function' then
                    local ok, parsed = pcall(json.decode, response.text or '')
                    callback(nil, parsed)
                end
            else
                logError(string.format('API Error: %s %s', endpoint, response.status_code))
                if response.text and CONFIG.DEBUG_MODE then
                    logError('Error Body', response.text)
                end
                if type(callback) == 'function' then callback({status = response.status_code}, nil) end
            end
        else
            logError(string.format('API No Response: %s %s (%.0fms)', method, endpoint, elapsed))
            if type(callback) == 'function' then callback({status = 0}, nil) end
        end
    end)
end

-- Отправка координат
function sendCoordinates()
    if not state.playerNick then 
        logDebug('sendCoordinates: playerNick not set')
        return 
    end
    
    local result, id = sampGetPlayerIdByCharHandle(PLAYER_PED)
    if not result then 
        logDebug('sendCoordinates: failed to get player ID')
        return 
    end
    
    local x, y, z = getCharCoordinates(PLAYER_PED)
    local location = getLocationName(x, y, z)
    
    logDebug(string.format('Sending coords: %.1f, %.1f, %.1f (%s) AFK=%s', 
        x, y, z, location, tostring(state.isAFK)))
    
    local data = {
        nick = state.playerNick,
        x = x,
        y = y,
        z = z,
        isAFK = state.isAFK
    }
    
    apiRequest('POST', '/coords', data)
end

-- Отправка статуса AFK
function sendAFKStatus(isAFK)
    if not state.playerNick then return end
    apiRequest('PUT', '/players/' .. urlEncode(state.playerNick) .. '/afk', {
        isAFK = isAFK
    }, function(err, res)
        if err then
            logError('Failed to update AFK status', err)
        else
            logDebug('AFK status updated')
        end
    end)
end

-- ============================================================================
-- УПРАВЛЕНИЕ ЮНИТАМИ
-- ============================================================================

function createUnit(marking, playerIds)
    local playerNicks = {state.playerNick}  -- Создатель всегда первый
    
    -- Добавляем других игроков по ID
    for _, playerId in ipairs(playerIds) do
        local nick = sampGetPlayerNickname(playerId)
        if nick and nick ~= state.playerNick then
            table.insert(playerNicks, nick)
        end
    end
    
    local data = {
        marking = marking,
        playerNicks = playerNicks,
        isLeadUnit = false
    }

    apiRequest('POST', '/units', data, function(err, resp)
        if err or not resp then
            notifyError('Failed to create unit')
            logError('createUnit failed', err)
            return
        end
        state.currentUnit = resp
        notifySuccess('Unit ' .. marking .. ' created! Status: Code 4')
        refreshUnits()
    end)
end

function updateUnitStatus(unitId, newStatus)
    apiRequest('PUT', '/units/' .. unitId .. '/status', { status = newStatus }, function(err, res)
        if err then
            notifyError('Failed to change status')
            logError('updateUnitStatus failed', err)
            return
        end
        notifySuccess('Status changed to ' .. newStatus)
        if state.currentUnit then state.currentUnit.status = newStatus end
    end)
end

function deleteUnit(unitId)
    apiRequest('DELETE', '/units/' .. unitId, nil, function(err, res)
        if err then
            notifyError('Failed to delete unit')
            logError('deleteUnit failed', err)
            return
        end
        notifySuccess('Unit deleted')
        state.currentUnit = nil
    end)
end

-- Покинуть юнит (быстрая реализация)
function leaveUnit(unitId)
    if not unitId then
        notifyError('No unit id provided')
        return
    end

    if not state.playerNick then
        notifyError('Player nick not set')
        return
    end

    apiRequest('POST', '/units/' .. unitId .. '/players/remove', { playerNick = state.playerNick }, function(err, res)
        if err then
            notifyError('Failed to leave unit')
            logError('leaveUnit failed', err)
            return
        end
        notifySuccess('You left the unit')
        -- Refresh units to update local state
        refreshUnits()
    end)
end

function refreshUnits()
    apiRequest('GET', '/units', nil, function(err, resp)
        if err then
            logError('refreshUnits failed', err)
            return
        end
        state.allUnits = resp or {}
        state.currentUnit = nil
        for _, unit in ipairs(state.allUnits) do
            local nicks = unit.playerNicks or unit.PlayerNicks or {}
            for _, nick in ipairs(nicks) do
                if nick == state.playerNick then
                    state.currentUnit = unit
                    break
                end
            end
            if state.currentUnit then break end
        end
    end)
end

-- ============================================================================
-- УПРАВЛЕНИЕ СИТУАЦИЯМИ
-- ============================================================================

-- Обновление локации для динамических ситуаций (Panic/Pursuit)
function updateSituationLocation(situationId, x, y, z)
    local locationName = getLocationName(x, y, z)
    apiRequest('PUT', '/situations/' .. situationId .. '/location', {
        location = locationName,
        x = x,
        y = y,
        z = z
    }, function(err, res)
        if err then
            logError('updateSituationLocation failed', err)
            return
        end
        log('Локация обновлена: ' .. locationName)
    end)
end

function createSituation(situationType, metadata)
    local data = { type = situationType, metadata = metadata or {} }
    apiRequest('POST', '/situations/create', data, function(err, resp)
        if err or not resp then
            notifyError('Failed to create situation')
            logError('createSituation failed', err)
            return
        end
        state.currentSituation = resp
        if state.currentUnit then joinSituation(resp.id) end
        notifySuccess('Situation "' .. situationType .. '" created!')
        playSound('notification')
    end)
end

function createPursuit(targetPlayerId)
    local targetNick = sampGetPlayerNickname(targetPlayerId)
    if not targetNick then
        notifyError('Player not found')
        return
    end
    
    -- Получаем координаты цели
    local targetHandle = select(2, sampGetCharHandleBySampPlayerId(targetPlayerId))
    local x, y, z = 0, 0, 0
    if targetHandle then
        x, y, z = getCharCoordinates(targetHandle)
    end
    
    -- Получаем название зоны
    local locationName = getLocationName(x, y, z)
    
    local metadata = {
        target = targetNick,
        location = locationName,
        priority = 'High',
        x = tostring(x),
        y = tostring(y),
        z = tostring(z)
    }
    
    apiRequest('POST', '/situations/create', { type = 'Pursuit', metadata = metadata }, function(err, resp)
        if err or not resp then
            notifyError('Failed to create pursuit')
            logError('createPursuit failed', err)
            return
        end
        state.currentSituation = resp
        state.trackingTarget = { playerId = targetPlayerId, situationId = resp.id }
        if state.currentUnit then joinSituation(resp.id) end
        notifySuccess('Pursuit started for ' .. targetNick .. '!')
        playSound('backup')
        notifyWarning('PURSUIT: ' .. targetNick .. ' in ' .. locationName .. '!')
    end)
end

function createPanic()
    local x, y, z = getCharCoordinates(PLAYER_PED)
    
    -- Получаем название зоны
    local locationName = getLocationName(x, y, z)
    
    local metadata = {
        location = locationName,
        priority = 'Critical',
        officer = state.playerNick,
        x = tostring(x),
        y = tostring(y),
        z = tostring(z)
    }
    
    apiRequest('POST', '/situations/create', { type = 'Panic', metadata = metadata }, function(err, resp)
        if err or not resp then
            notifyError('Failed to activate panic')
            logError('createPanic failed', err)
            return
        end
        state.currentSituation = resp
        state.isInPanic = true
        if state.currentUnit then joinSituation(resp.id) end
        notifySuccess('Panic button activated!')
        playSound('panic')
        notifyError('PANIC! Officer ' .. state.playerNick .. ' in danger at ' .. locationName .. '!')
    end)
end

function joinSituation(situationId)
    if not state.currentUnit then
        notifyError('You must be in a unit!')
        return
    end
    apiRequest('POST', '/situations/' .. situationId .. '/units/add', { unitId = state.currentUnit.id, asLeadUnit = false }, function(err, res)
        if err then
            notifyError('Failed to join situation')
            logError('joinSituation failed', err)
            return
        end
        updateUnitStatus(state.currentUnit.id, 'Code 3')
        notifySuccess('Joined situation')
    end)
end

-- ============================================================================
-- IMGUI МЕНЮ
-- ============================================================================

local function renderMainWindow()
    if not imgui_loaded or not mainWindow then return end

    -- If menu is open, force position/size every frame so it appears on-screen
    if mainWindow[0] then
        pcall(function()
            imgui.SetNextWindowPos(imgui.ImVec2(50, 50), imgui.Cond.Always)
            imgui.SetNextWindowSize(imgui.ImVec2(600, 700), imgui.Cond.Always)
        end)
    else
        -- ensure first-use size preserved when closed
        imgui.SetNextWindowSize(imgui.ImVec2(500, 600), imgui.Cond.FirstUseEver)
    end

    -- Call Begin in pcall to avoid crashing if ImGui has issues; capture returned 'opened' boolean
    local ok, opened = pcall(imgui.Begin, 'SAPD Tracker', mainWindow, imgui.WindowFlags.NoCollapse)
    if not ok then
        logError('renderMainWindow: imgui.Begin call failed: ' .. tostring(opened))
        return
    end

    -- One-time notify to confirm render is invoked and whether Begin allowed drawing
    if not render_state.notified then
        render_state.notified = true
        logDebug('renderMainWindow: imgui.Begin returned: ' .. tostring(opened))
        notify('renderMainWindow invoked (Begin returned: ' .. tostring(opened) .. ')')
    end

    -- If debug mode is on, also show a minimal debug window to verify ImGui output
    if CONFIG.DEBUG_MODE then
        local ok2, dbgOpened = pcall(imgui.Begin, 'SAPD Tracker Debug', imgui.new.bool(true), imgui.WindowFlags.AlwaysAutoResize + imgui.WindowFlags.NoCollapse)
        if ok2 and dbgOpened then
            imgui.Text('Debug window visible - ImGui rendering works')
        end
        if ok2 then imgui.End() end
    end

    if opened then
        -- Информация о текущем статусе
        imgui.TextColored(imgui.ImVec4(0.2, 0.8, 1.0, 1.0), 'Officer: ' .. (state.playerNick or 'Unknown'))
        imgui.Separator()
        
        -- Секция Unit
        if imgui.CollapsingHeader('Unit Management', imgui.TreeNodeFlags.DefaultOpen) then
            if state.currentUnit then
                imgui.TextColored(imgui.ImVec4(0.2, 1.0, 0.2, 1.0), 'Current Unit: ' .. state.currentUnit.marking)
                imgui.Text('Status: ' .. (state.currentUnit.status or 'Code 5'))
                imgui.Text('Members: ' .. joinOrEmpty(state.currentUnit.playerNicks, ', '))
                
                imgui.Spacing()
                if imgui.Button('Leave Unit', imgui.ImVec2(200, 30)) then
                    leaveUnit(state.currentUnit.id)
                end
                
                imgui.Spacing()
                imgui.Text('Quick Status Change:')
                if imgui.Button('Code 2', imgui.ImVec2(90, 25)) then cmd_code2() end
                imgui.SameLine()
                if imgui.Button('Code 3', imgui.ImVec2(90, 25)) then cmd_code3() end
                imgui.SameLine()
                if imgui.Button('Code 4', imgui.ImVec2(90, 25)) then cmd_code4() end
                
                if imgui.Button('Code 6', imgui.ImVec2(90, 25)) then cmd_code6() end
                imgui.SameLine()
                if imgui.Button('Code 7', imgui.ImVec2(90, 25)) then cmd_code7() end
            else
                imgui.TextColored(imgui.ImVec4(1.0, 0.5, 0.0, 1.0), 'Not in a unit')
                imgui.Spacing()
                
                imgui.InputText('Unit Marking', inputBuffer.unitMarking, 64)
                if imgui.Button('Create Unit', imgui.ImVec2(200, 30)) then
                    local marking = ffi.string(inputBuffer.unitMarking)
                    if marking ~= '' then
                        createUnit(marking)
                    else
                        notifyError('Enter unit marking!')
                    end
                end
            end
        end
        
        imgui.Spacing()
        imgui.Separator()
        
        -- Секция Situations
        if imgui.CollapsingHeader('Situations', imgui.TreeNodeFlags.DefaultOpen) then
            imgui.InputText('Type (911/code6/traffic/backup)', inputBuffer.situationType, 64)
            if imgui.Button('Create Situation', imgui.ImVec2(200, 30)) then
                local sitType = ffi.string(inputBuffer.situationType)
                if sitType ~= '' then
                    cmd_sit(sitType)
                else
                    notifyError('Enter situation type!')
                end
            end
            
            imgui.Spacing()
            if imgui.Button('PANIC BUTTON', imgui.ImVec2(200, 40)) then
                cmd_panic()
            end
            
            imgui.Spacing()
            imgui.InputInt('Target ID', inputBuffer.targetId)
            if imgui.Button('Start Pursuit', imgui.ImVec2(200, 30)) then
                local targetId = inputBuffer.targetId[0]
                if targetId > 0 then
                    cmd_prst(tostring(targetId))
                else
                    notifyError('Enter valid player ID!')
                end
            end
            
            imgui.Spacing()
            if state.isInPanic or state.trackingTarget then
                if imgui.Button('Clear Panic/Pursuit', imgui.ImVec2(200, 30)) then
                    cmd_clear()
                end
            end
        end
        
        imgui.Spacing()
        imgui.Separator()
        
        -- Информация
        if imgui.CollapsingHeader('Info') then
            imgui.Text('AFK Status: ' .. (state.isAFK and 'AFK' or 'Active'))
            local x, y, z = getCharCoordinates(PLAYER_PED)
            local location = getLocationName(x, y, z)
            imgui.Text('Location: ' .. location)
            imgui.Text('Coords: ' .. string.format('%.1f, %.1f, %.1f', x, y, z))
        end

        imgui.Spacing()
        -- Close button at the bottom
        if imgui.Button('Close Menu', imgui.ImVec2(120, 28)) then
            if mainWindow then mainWindow[0] = false end
        end
        
        imgui.End()
    end
end

-- ============================================================================
-- КОМАНДЫ
-- ============================================================================

function cmd_unit(param)
    if imgui_loaded then
        -- Try to lazily initialize ImGui UI state if necessary
        if not ffi_loaded then
            notifyError('ImGui present but FFI not available. UI cannot be opened.')
            logWarn('cmd_unit: ImGui present but ffi not loaded')
            return
        end

        if not mainWindow then
            -- Create UI state lazily (in case it wasn't possible during startup)
            logDebug('cmd_unit: initializing ImGui UI state')
            notify('Initializing UI state...')
            mainWindow = imgui.new.bool(false)
            inputBuffer = {
                unitMarking = imgui.new.char[64](),
                situationType = imgui.new.char[64](),
                targetId = imgui.new.int(0),
            }
            -- Ensure render function is registered
            imgui.Process = renderMainWindow
            logDebug('cmd_unit: ImGui.Process set to renderMainWindow')
            notify('UI initialized (menu is hidden by default). Use /unit to open it.')
        else
            logDebug('cmd_unit: ImGui UI state already initialized')
        end

        -- Toggle the UI window
        mainWindow[0] = not mainWindow[0]
        if mainWindow[0] then
            logDebug('cmd_unit: menu opened')
            notify('SAPD Tracker menu opened')
        else
            logDebug('cmd_unit: menu closed')
            notify('SAPD Tracker menu closed')
        end
        return
    end
    
    -- Текстовая версия команды
    if not param or param == '' then
        -- Показываем информацию
        notify('=== UNIT MENU ===')
        if state.currentUnit then
            notify('Current Unit: ' .. state.currentUnit.marking)
            notify('Status: ' .. (state.currentUnit.status or 'Code 5'))
            notify('Members: ' .. joinOrEmpty(state.currentUnit.playerNicks, ', '))
            notify('Commands:')
            notify('  /unit leave - Leave unit')
            notify('  /code2-7 - Change status')
        else
            notify('You are not in a unit')
            notify('Usage: /unit create [marking]')
            notify('Example: /unit create 1-A-12')
        end
        return
    end
    
    -- Разбираем параметры
    local args = {}
    for word in param:gmatch("%S+") do
        table.insert(args, word)
    end
    
    local action = args[1]:lower()
    
    if action == 'create' then
        local marking = args[2]
        if marking then
            createUnit(marking, {})
        else
            notifyError('Usage: /unit create [marking]')
        end
    elseif action == 'leave' then
        if state.currentUnit then
            leaveUnit(state.currentUnit.id)
        else
            notifyError('You are not in a unit!')
        end
    else
        notifyError('Unknown action. Use: create, leave')
    end
end

function cmd_sit(param)
    -- Если параметр не указан, показываем помощь
    if not param or param == '' then
        notify('Usage: /sit [type]')
        notify('Types: 911, code6, traffic, backup')
        return
    end
    
    -- Получаем текущую локацию
    local x, y, z = getCharCoordinates(PLAYER_PED)
    local locationName = getLocationName(x, y, z)
    
    local situationType = param:lower()
    local metadata = {
        location = locationName,
        priority = 'Medium'
    }
    
    -- Определяем тип ситуации
    if situationType == '911' then
        createSituation('911 Call', metadata)
    elseif situationType == 'code6' or situationType == 'c6' then
        createSituation('Code 6', metadata)
    elseif situationType == 'traffic' or situationType == 'ts' then
        createSituation('Traffic Stop', metadata)
    elseif situationType == 'backup' or situationType == 'bk' then
        metadata.priority = 'High'
        createSituation('Backup Request', metadata)
    else
        -- Создаем с произвольным типом
        createSituation(param, metadata)
    end
end

function cmd_prst(param)
    local targetId = tonumber(param)
    if not targetId then
        notifyError('Usage: /prst [player ID]')
        return
    end
    
    if not sampIsPlayerConnected(targetId) then
        notifyError('Player is not online')
        return
    end
    
    createPursuit(targetId)
end

function cmd_panic(param)
    createPanic()
end

-- Быстрые команды статусов
function cmd_code2() 
    if not state.currentUnit then notifyError('You are not in a unit!') return end
    updateUnitStatus(state.currentUnit.id, 'Code 2') 
end

function cmd_code3() 
    if not state.currentUnit then notifyError('You are not in a unit!') return end
    updateUnitStatus(state.currentUnit.id, 'Code 3') 
end

function cmd_code4() 
    if not state.currentUnit then notifyError('You are not in a unit!') return end
    updateUnitStatus(state.currentUnit.id, 'Code 4') 
end

function cmd_code6() 
    if not state.currentUnit then notifyError('You are not in a unit!') return end
    updateUnitStatus(state.currentUnit.id, 'Code 6') 
end

function cmd_code7() 
    if not state.currentUnit then notifyError('You are not in a unit!') return end
    updateUnitStatus(state.currentUnit.id, 'Code 7') 
end

-- Завершить активную панику/погоню
function cmd_clear()
    if state.isInPanic then
        state.isInPanic = false
        notifySuccess('Panic cleared')
    end
    
    if state.trackingTarget then
        state.trackingTarget = nil
        notifySuccess('Pursuit ended')
    end
    
    if not state.isInPanic and not state.trackingTarget then
        notify('No active panic or pursuit')
    end
end

-- Список активных ситуаций
function cmd_situations()
    apiRequest('GET', '/situations/all', nil, function(err, situations)
        if err or not situations then
            notifyError('Failed to load situations')
            logError('cmd_situations failed', err)
            return
        end
        if #situations == 0 then
            notify('No active situations')
            return
        end
        notify('=== Active Situations ===')
        for i, sit in ipairs(situations) do
            local metadata = sit.metadata or sit.Metadata or {}
            local location = metadata.location or 'Unknown'
            local t = sit.type or sit.Type or 'Unknown'
            notify(string.format('%d. %s - %s', i, t, location))
        end
    end)
end

-- Команда отладки
function cmd_debug(param)
    if not param or param == '' then
        notify('=== DEBUG COMMANDS ===')
        notify('/debug on         - Enable debug mode')
        notify('/debug off        - Disable debug mode')
        notify('/debug state      - Show current state')
        notify('/debug config     - Show configuration')
        notify('/debug api        - Test API connection')
        notify('/debug level [1-4]- Set log level (1=DEBUG, 2=INFO, 3=WARN, 4=ERROR)')
        notify('Current: DEBUG=' .. (CONFIG.DEBUG_MODE and 'ON' or 'OFF') .. ', Level=' .. currentLogLevel)
        return
    end
    
    local args = {}
    for word in param:gmatch("%S+") do
        table.insert(args, word)
    end
    
    local action = args[1]:lower()
    
    if action == 'on' then
        CONFIG.DEBUG_MODE = true
        currentLogLevel = LOG_LEVELS.DEBUG
        notifySuccess('Debug mode ENABLED')
        logDebug('Debug mode activated by user')
    elseif action == 'off' then
        CONFIG.DEBUG_MODE = false
        currentLogLevel = LOG_LEVELS.INFO
        notifySuccess('Debug mode DISABLED')
        log('Debug mode deactivated')
    elseif action == 'state' then
        debugShowState()
    elseif action == 'config' then
        debugShowConfig()
    elseif action == 'api' then
        debugTestAPI()
    elseif action == 'level' then
        local level = tonumber(args[2])
        if level and level >= 1 and level <= 4 then
            currentLogLevel = level
            local levelNames = {"DEBUG", "INFO", "WARN", "ERROR"}
            notifySuccess('Log level set to: ' .. levelNames[level])
        else
            notifyError('Usage: /debug level [1-4]')
            notify('1=DEBUG, 2=INFO, 3=WARN, 4=ERROR')
        end
    else
        notifyError('Unknown debug command. Use /debug for help')
    end
end

-- UI status diagnostic
function cmd_ui_status()
    notify('=== UI STATUS ===')
    notify('ImGui loaded: ' .. tostring(imgui_loaded))
    notify('FFI loaded: ' .. tostring(ffi_loaded))
    if mainWindow[0] then
        pcall(function()
            imgui.SetNextWindowPos(imgui.ImVec2(50, 50), imgui.Cond.Always)
            imgui.SetNextWindowSize(imgui.ImVec2(600, 700), imgui.Cond.Always)
        end)
        render_state.positioned = true
    else
        -- ensure first-use size preserved when closed
        imgui.SetNextWindowSize(imgui.ImVec2(500, 600), imgui.Cond.FirstUseEver)
    end
end
-- ГЛАВНЫЙ ЦИКЛ
-- ============================================================================

function main()
    -- Ждём загрузки SA-MP и функций sampfuncs
    while not isSampLoaded() or not isSampfuncsLoaded() do wait(100) end
    while not isSampAvailable() do wait(100) end
    
    -- Получаем ник игрока
    state.playerNick = sampGetPlayerNickname(select(2, sampGetPlayerIdByCharHandle(PLAYER_PED)))
    log('Initializing for player: ' .. tostring(state.playerNick))
    
    -- Регистрируем команды
    sampRegisterChatCommand('unit', cmd_unit)
    sampRegisterChatCommand('sit', cmd_sit)
    sampRegisterChatCommand('situations', cmd_situations)
    sampRegisterChatCommand('prst', cmd_prst)
    sampRegisterChatCommand('panic', cmd_panic)
    sampRegisterChatCommand('clear', cmd_clear)
    sampRegisterChatCommand('code2', cmd_code2)
    sampRegisterChatCommand('code3', cmd_code3)
    sampRegisterChatCommand('code4', cmd_code4)
    sampRegisterChatCommand('code6', cmd_code6)
    sampRegisterChatCommand('code7', cmd_code7)
    sampRegisterChatCommand('debug', cmd_debug)
    sampRegisterChatCommand('ui_status', cmd_ui_status)
    
        if imgui_loaded then
            -- If ImGui was loaded but FFI wasn't available at the top of the script
            -- we can't create the cdata buffers. Inform the user and only enable
            -- the interactive UI when FFI is available.
            if not ffi_loaded then
                notify('Tracker started! ImGui found but FFI is missing — UI disabled')
                notifyWarning('ImGui present but FFI not loaded - install LuaJIT/ffi or mimgui with FFI support')
                logWarn('ImGui present but ffi not loaded; interactive UI disabled')
            else
                notify('Tracker started! Use /unit to open menu')
                logDebug('ImGui loaded successfully')
                -- Ensure ImGui state is initialized (in case it wasn't earlier)
                if not mainWindow then
                    mainWindow = imgui.new.bool(false)
                    inputBuffer = {
                        unitMarking = imgui.new.char[64](),
                        situationType = imgui.new.char[64](),
                        targetId = imgui.new.int(0),
                    }
                end
                -- Регистрируем функцию рендера один раз
                imgui.Process = renderMainWindow
            end
        else
            notify('Tracker started! Use /unit create [marking] to create unit')
            notifyWarning('ImGui not loaded - using text commands only')
            logDebug('ImGui not available - text mode enabled')
        end
    
    log('Debug mode: Use /debug on to enable detailed logging')
    logDebug('Configuration loaded: API=' .. CONFIG.API_URL)
    
    -- Начальная загрузка данных
    refreshUnits()

    -- Основной цикл
    while true do
        wait(0)
        
        local currentTime = os.clock() * 1000
        
        -- Отправка координат
        if currentTime - timers.lastUpdate >= CONFIG.UPDATE_INTERVAL then
            sendCoordinates()
            timers.lastUpdate = currentTime
        end
        
        -- Проверка AFK
        if currentTime - timers.lastAFKCheck >= CONFIG.AFK_CHECK_INTERVAL then
            hasPlayerMoved()
            
            local inactiveTime = os.clock() - state.lastActivity
            logDebug(string.format('AFK Check: inactive for %.0f sec (threshold: %d sec)', 
                inactiveTime, CONFIG.AFK_THRESHOLD))
            
            -- Если давно не двигался - помечаем AFK
            if not state.isAFK and inactiveTime >= CONFIG.AFK_THRESHOLD then
                state.isAFK = true
                notifyWarning('You are marked as AFK (no activity for 5 minutes)')
                logWarn('Player marked as AFK')
                sendAFKStatus(true)
            end
            
            timers.lastAFKCheck = currentTime
        end
        
        -- Обновление локации для активной паники или погони
        if currentTime - timers.lastLocationUpdate >= CONFIG.LOCATION_UPDATE_INTERVAL then
            -- Обновляем локацию при активной панике
            if state.isInPanic and state.currentSituation then
                local x, y, z = getCharCoordinates(PLAYER_PED)
                local location = getLocationName(x, y, z)
                logDebug('Updating PANIC location: ' .. location)
                updateSituationLocation(state.currentSituation.id, x, y, z)
            end
            
            -- Обновляем локацию цели при погоне
            if state.trackingTarget and sampIsPlayerConnected(state.trackingTarget.playerId) then
                local targetHandle = select(2, sampGetCharHandleBySampPlayerId(state.trackingTarget.playerId))
                if targetHandle then
                    local x, y, z = getCharCoordinates(targetHandle)
                    local location = getLocationName(x, y, z)
                    logDebug('Updating PURSUIT target location: ' .. location)
                    updateSituationLocation(state.trackingTarget.situationId, x, y, z)
                else
                    logWarn('PURSUIT: Target handle not found (ID=' .. state.trackingTarget.playerId .. ')')
                end
            end
            
            timers.lastLocationUpdate = currentTime
        end
        
        -- Rendering handled by mimgui binding via imgui.Process (renderMainWindow registered earlier)
    end
end
