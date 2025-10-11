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
local mainWindow, inputBuffer

if imgui_loaded then
    ffi_loaded, ffi = pcall(require, 'ffi')
    
    if ffi_loaded then
        -- Инициализируем UI state сразу при загрузке
        mainWindow = imgui.new.bool(false)
        inputBuffer = {
            unitMarking = imgui.new.char[64](),
            situationType = imgui.new.char[64](),
            targetId = imgui.new.int(0),
        }
    end
end

-- ПОЛЕ ДЛЯ СТАТА РЕНДЕРА
local render_state = {
    notified = false,
    positioned = false
}

-- Глобальное состояние скрипта (защита от nil при раннем вызове)
local state = state or {
    playerNick = nil,
    isAFK = false,
    isInPanic = false,
    currentUnit = nil,
    currentSituation = nil,
    trackingTarget = nil,
    lastPosition = { x = 0, y = 0, z = 0 },
    lastActivity = os.clock(),
    allUnits = {},
}

-- Таймеры для периодических задач
local timers = timers or {
    lastUpdate = 0,
    lastAFKCheck = 0,
    lastLocationUpdate = 0,
}

encoding.default = 'CP1251'
u8 = encoding.UTF8

-- Safety guards / fallbacks for commonly used globals to avoid runtime errors
CONFIG = CONFIG or {
    API_URL = 'http://localhost:5000/api',
    API_KEY = 'changeme-key',
    UPDATE_INTERVAL = 5000,
    AFK_CHECK_INTERVAL = 60000,
    AFK_THRESHOLD = 300,
    LOCATION_UPDATE_INTERVAL = 5000,
    DEBUG_MODE = false,
}

-- Normalize API_URL: remove trailing slash and ensure it ends with /api
do
    if type(CONFIG.API_URL) == 'string' then
        -- strip trailing slash
        CONFIG.API_URL = CONFIG.API_URL:gsub('/+$', '')
        -- if it doesn't end with /api, append it
        if not CONFIG.API_URL:match('/api$') then
            CONFIG.API_URL = CONFIG.API_URL .. '/api'
        end
    end
end

-- Ensure common libs exist (requests/json may not be present in some environments)
requests = requests or {}
if type(requests.get) ~= 'function' then
    requests.get = function() return nil end
end
if type(requests.post) ~= 'function' then
    requests.post = function() return nil end
end
if type(requests.put) ~= 'function' then
    requests.put = function() return nil end
end
if type(requests.delete) ~= 'function' then
    requests.delete = function() return nil end
end

json = json or { encode = function(v) return tostring(v) end, decode = function(s) return s end }

-- Ensure lua_thread helper exists
lua_thread = lua_thread or { create = function(f) pcall(f) end }

-- Ensure sampAddChatMessage exists as fallback (avoid crashes when not running in SA-MP)
sampAddChatMessage = sampAddChatMessage or function(text, color) print(text) end

-- UTF-8 helper: safe decode/encode wrappers
local function safe_u8_decode(s)
    if type(u8) == 'table' and type(u8.decode) == 'function' then
        return u8:decode(s)
    elseif type(u8) == 'function' then
        -- some bindings expose u8 as function
        local ok, out = pcall(u8, s)
        return ok and out or s
    end
    return s
end

-- Override notify functions to use UTF-8 when available
local _sampAddChat = sampAddChatMessage
function notify(msg)
    local text = '[SAPD Tracker] {FFFFFF}' .. safe_u8_decode(tostring(msg or ''))
    _sampAddChat(text, 0x3498DB)
end
function notifyError(msg)
    local text = '[SAPD Tracker] {FF0000}' .. safe_u8_decode(tostring(msg or ''))
    _sampAddChat(text, 0xFF0000)
end
function notifySuccess(msg)
    local text = '[SAPD Tracker] {00FF00}' .. safe_u8_decode(tostring(msg or ''))
    _sampAddChat(text, 0x00FF00)
end
function notifyWarning(msg)
    local text = '[SAPD Tracker] {FFAA00}' .. safe_u8_decode(tostring(msg or ''))
    _sampAddChat(text, 0xFFAA00)
end

-- Logging fallback and convenience wrappers
if type(log) ~= 'function' then
    function log(message)
        local text = '[SAPD Tracker] ' .. tostring(message or '')
        -- Prefer in-game chat if available for visibility, otherwise print
        if CONFIG and CONFIG.DEBUG_MODE then
            if type(sampAddChatMessage) == 'function' then
                sampAddChatMessage(text, 0xAAAAAA)
            else
                print(text)
            end
        else
            -- When not in debug mode, print to console to avoid spamming chat
            if type(sampAddChatMessage) ~= 'function' then
                print(text)
            end
        end
    end
end

if type(logDebug) ~= 'function' then
    function logDebug(msg)
        if CONFIG and CONFIG.DEBUG_MODE then log('[DEBUG] ' .. tostring(msg)) end
    end
end
if type(logInfo) ~= 'function' then
    function logInfo(msg) log('[INFO] ' .. tostring(msg)) end
end
if type(logWarn) ~= 'function' then
    function logWarn(msg) log('[WARN] ' .. tostring(msg)) end
end
if type(logError) ~= 'function' then
    function logError(msg) log('[ERROR] ' .. tostring(msg)) end
end

-- Log level definitions and fallback writeLog implementation
LOG_LEVELS = LOG_LEVELS or { DEBUG = 1, INFO = 2, WARN = 3, ERROR = 4 }
currentLogLevel = currentLogLevel or (CONFIG and CONFIG.DEBUG_MODE and LOG_LEVELS.DEBUG or LOG_LEVELS.INFO)

if type(writeLog) ~= 'function' then
    function writeLog(level, message, data)
        if not level or not message then return end
        -- only print messages at or above the configured log level
        if level < (currentLogLevel or LOG_LEVELS.INFO) then return end
        local levelName = ({[LOG_LEVELS.DEBUG] = 'DEBUG', [LOG_LEVELS.INFO] = 'INFO', [LOG_LEVELS.WARN] = 'WARN', [LOG_LEVELS.ERROR] = 'ERROR'})[level] or 'LOG'
        local text = string.format('[SAPD Tracker] [%s] %s', levelName, tostring(message))
        if type(sampAddChatMessage) == 'function' and CONFIG and CONFIG.DEBUG_MODE then
            sampAddChatMessage(text, 0xAAAAAA)
        else
            print(text)
        end
    end
end

-- Маленькие хелперы
local function joinOrEmpty(tbl, sep)
    if type(tbl) ~= 'table' then return '' end
    if #tbl == 0 then return '' end
    return table.concat(tbl, sep or ', ')
end

-- Простая URL-энкодировка для безопасного использования в путях
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

-- Note: notification wrappers using safe UTF-8 decoding are defined earlier
-- (they prefer u8.decode when available, and fall back to transliterate)

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
-- Replace SA_ZONES with a detailed provided set (each entry includes minX,minY,minZ,maxX,maxY,maxZ)
local SA_ZONES = {
    { name = "The Big Ear", minX = -410.00, minY = 1403.30, minZ = -3.00, maxX = -137.90, maxY = 1681.20, maxZ = 200.00 },
    { name = "Aldea Malvada", minX = -1372.10, minY = 2498.50, minZ = 0.00, maxX = -1277.50, maxY = 2615.30, maxZ = 200.00 },
    { name = "Angel Pine", minX = -2324.90, minY = -2584.20, minZ = -6.10, maxX = -1964.20, maxY = -2212.10, maxZ = 200.00 },
    { name = "Arco del Oeste", minX = -901.10, minY = 2221.80, minZ = 0.00, maxX = -592.00, maxY = 2571.90, maxZ = 200.00 },
    { name = "Avispa Country Club", minX = -2646.40, minY = -355.40, minZ = 0.00, maxX = -2270.00, maxY = -222.50, maxZ = 200.00 },
    { name = "Avispa Country Club", minX = -2831.80, minY = -430.20, minZ = -6.10, maxX = -2646.40, maxY = -222.50, maxZ = 200.00 },
    { name = "Avispa Country Club", minX = -2361.50, minY = -417.10, minZ = 0.00, maxX = -2270.00, maxY = -355.40, maxZ = 200.00 },
    { name = "Avispa Country Club", minX = -2667.80, minY = -302.10, minZ = -28.80, maxX = -2646.40, maxY = -262.30, maxZ = 71.10 },
    { name = "Avispa Country Club", minX = -2470.00, minY = -355.40, minZ = 0.00, maxX = -2270.00, maxY = -318.40, maxZ = 46.10 },
    { name = "Avispa Country Club", minX = -2550.00, minY = -355.40, minZ = 0.00, maxX = -2470.00, maxY = -318.40, maxZ = 39.70 },
    { name = "Back o Beyond", minX = -1166.90, minY = -2641.10, minZ = 0.00, maxX = -321.70, maxY = -1856.00, maxZ = 200.00 },
    { name = "Battery Point", minX = -2741.00, minY = 1268.40, minZ = -4.50, maxX = -2533.00, maxY = 1490.40, maxZ = 200.00 },
    { name = "Bayside", minX = -2741.00, minY = 2175.10, minZ = 0.00, maxX = -2353.10, maxY = 2722.70, maxZ = 200.00 },
    { name = "Bayside Marina", minX = -2353.10, minY = 2275.70, minZ = 0.00, maxX = -2153.10, maxY = 2475.70, maxZ = 200.00 },
    { name = "Beacon Hill", minX = -399.60, minY = -1075.50, minZ = -1.40, maxX = -319.00, maxY = -977.50, maxZ = 198.50 },
    { name = "Blackfield", minX = 964.30, minY = 1203.20, minZ = -89.00, maxX = 1197.30, maxY = 1403.20, maxZ = 110.90 },
    { name = "Blackfield", minX = 964.30, minY = 1403.20, minZ = -89.00, maxX = 1197.30, maxY = 1726.20, maxZ = 110.90 },
    { name = "Blackfield Chapel", minX = 1375.60, minY = 596.30, minZ = -89.00, maxX = 1558.00, maxY = 823.20, maxZ = 110.90 },
    { name = "Blackfield Chapel", minX = 1325.60, minY = 596.30, minZ = -89.00, maxX = 1375.60, maxY = 795.00, maxZ = 110.90 },
    { name = "Blackfield Intersection", minX = 1197.30, minY = 1044.60, minZ = -89.00, maxX = 1277.00, maxY = 1163.30, maxZ = 110.90 },
    { name = "Blackfield Intersection", minX = 1166.50, minY = 795.00, minZ = -89.00, maxX = 1375.60, maxY = 1044.60, maxZ = 110.90 },
    { name = "Blackfield Intersection", minX = 1277.00, minY = 1044.60, minZ = -89.00, maxX = 1315.30, maxY = 1087.60, maxZ = 110.90 },
    { name = "Blackfield Intersection", minX = 1375.60, minY = 823.20, minZ = -89.00, maxX = 1457.30, maxY = 919.40, maxZ = 110.90 },
    { name = "Blueberry", minX = 104.50, minY = -220.10, minZ = 2.30, maxX = 349.60, maxY = 152.20, maxZ = 200.00 },
    { name = "Blueberry", minX = 19.60, minY = -404.10, minZ = 3.80, maxX = 349.60, maxY = -220.10, maxZ = 200.00 },
    { name = "Blueberry Acres", minX = -319.60, minY = -220.10, minZ = 0.00, maxX = 104.50, maxY = 293.30, maxZ = 200.00 },
    { name = "Caligula's Palace", minX = 2087.30, minY = 1543.20, minZ = -89.00, maxX = 2437.30, maxY = 1703.20, maxZ = 110.90 },
    { name = "Caligula's Palace", minX = 2137.40, minY = 1703.20, minZ = -89.00, maxX = 2437.30, maxY = 1783.20, maxZ = 110.90 },
    { name = "Calton Heights", minX = -2274.10, minY = 744.10, minZ = -6.10, maxX = -1982.30, maxY = 1358.90, maxZ = 200.00 },
    { name = "Chinatown", minX = -2274.10, minY = 578.30, minZ = -7.60, maxX = -2078.60, maxY = 744.10, maxZ = 200.00 },
    { name = "City Hall", minX = -2867.80, minY = 277.40, minZ = -9.10, maxX = -2593.40, maxY = 458.40, maxZ = 200.00 },
    { name = "Come-A-Lot", minX = 2087.30, minY = 943.20, minZ = -89.00, maxX = 2623.10, maxY = 1203.20, maxZ = 110.90 },
    { name = "Commerce", minX = 1323.90, minY = -1842.20, minZ = -89.00, maxX = 1701.90, maxY = -1722.20, maxZ = 110.90 },
    { name = "Commerce", minX = 1323.90, minY = -1722.20, minZ = -89.00, maxX = 1440.90, maxY = -1577.50, maxZ = 110.90 },
    { name = "Commerce", minX = 1370.80, minY = -1577.50, minZ = -89.00, maxX = 1463.90, maxY = -1384.90, maxZ = 110.90 },
    { name = "Commerce", minX = 1463.90, minY = -1577.50, minZ = -89.00, maxX = 1667.90, maxY = -1430.80, maxZ = 110.90 },
    { name = "Commerce", minX = 1583.50, minY = -1722.20, minZ = -89.00, maxX = 1758.90, maxY = -1577.50, maxZ = 110.90 },
    { name = "Commerce", minX = 1667.90, minY = -1577.50, minZ = -89.00, maxX = 1812.60, maxY = -1430.80, maxZ = 110.90 },
    { name = "Conference Center", minX = 1046.10, minY = -1804.20, minZ = -89.00, maxX = 1323.90, maxY = -1722.20, maxZ = 110.90 },
    { name = "Conference Center", minX = 1073.20, minY = -1842.20, minZ = -89.00, maxX = 1323.90, maxY = -1804.20, maxZ = 110.90 },
    { name = "Cranberry Station", minX = -2007.80, minY = 56.30, minZ = 0.00, maxX = -1922.00, maxY = 224.70, maxZ = 100.00 },
    { name = "Creek", minX = 2749.90, minY = 1937.20, minZ = -89.00, maxX = 2921.60, maxY = 2669.70, maxZ = 110.90 },
    { name = "Dillimore", minX = 580.70, minY = -674.80, minZ = -9.50, maxX = 861.00, maxY = -404.70, maxZ = 200.00 },
    { name = "Doherty", minX = -2270.00, minY = -324.10, minZ = -0.00, maxX = -1794.90, maxY = -222.50, maxZ = 200.00 },
    { name = "Doherty", minX = -2173.00, minY = -222.50, minZ = -0.00, maxX = -1794.90, maxY = 265.20, maxZ = 200.00 },
    { name = "Downtown", minX = -1982.30, minY = 744.10, minZ = -6.10, maxX = -1871.70, maxY = 1274.20, maxZ = 200.00 },
    { name = "Downtown", minX = -1871.70, minY = 1176.40, minZ = -4.50, maxX = -1620.30, maxY = 1274.20, maxZ = 200.00 },
    { name = "Downtown", minX = -1700.00, minY = 744.20, minZ = -6.10, maxX = -1580.00, maxY = 1176.50, maxZ = 200.00 },
    { name = "Downtown", minX = -1580.00, minY = 744.20, minZ = -6.10, maxX = -1499.80, maxY = 1025.90, maxZ = 200.00 },
    { name = "Downtown", minX = -2078.60, minY = 578.30, minZ = -7.60, maxX = -1499.80, maxY = 744.20, maxZ = 200.00 },
    { name = "Downtown", minX = -1993.20, minY = 265.20, minZ = -9.10, maxX = -1794.90, maxY = 578.30, maxZ = 200.00 },
    { name = "Downtown Los Santos", minX = 1463.90, minY = -1430.80, minZ = -89.00, maxX = 1724.70, maxY = -1290.80, maxZ = 110.90 },
    { name = "Downtown Los Santos", minX = 1724.70, minY = -1430.80, minZ = -89.00, maxX = 1812.60, maxY = -1250.90, maxZ = 110.90 },
    { name = "Downtown Los Santos", minX = 1463.90, minY = -1290.80, minZ = -89.00, maxX = 1724.70, maxY = -1150.80, maxZ = 110.90 },
    { name = "Downtown Los Santos", minX = 1370.80, minY = -1384.90, minZ = -89.00, maxX = 1463.90, maxY = -1170.80, maxZ = 110.90 },
    { name = "Downtown Los Santos", minX = 1724.70, minY = -1250.90, minZ = -89.00, maxX = 1812.60, maxY = -1150.80, maxZ = 110.90 },
    { name = "Downtown Los Santos", minX = 1370.80, minY = -1170.80, minZ = -89.00, maxX = 1463.90, maxY = -1130.80, maxZ = 110.90 },
    { name = "Downtown Los Santos", minX = 1378.30, minY = -1130.80, minZ = -89.00, maxX = 1463.90, maxY = -1026.30, maxZ = 110.90 },
    { name = "Downtown Los Santos", minX = 1391.00, minY = -1026.30, minZ = -89.00, maxX = 1463.90, maxY = -926.90, maxZ = 110.90 },
    { name = "Downtown Los Santos", minX = 1507.50, minY = -1385.20, minZ = 110.90, maxX = 1582.50, maxY = -1325.30, maxZ = 335.90 },
    { name = "East Beach", minX = 2632.80, minY = -1852.80, minZ = -89.00, maxX = 2959.30, maxY = -1668.10, maxZ = 110.90 },
    { name = "East Beach", minX = 2632.80, minY = -1668.10, minZ = -89.00, maxX = 2747.70, maxY = -1393.40, maxZ = 110.90 },
    { name = "East Beach", minX = 2747.70, minY = -1668.10, minZ = -89.00, maxX = 2959.30, maxY = -1498.60, maxZ = 110.90 },
    { name = "East Beach", minX = 2747.70, minY = -1498.60, minZ = -89.00, maxX = 2959.30, maxY = -1120.00, maxZ = 110.90 },
    { name = "East Los Santos", minX = 2421.00, minY = -1628.50, minZ = -89.00, maxX = 2632.80, maxY = -1454.30, maxZ = 110.90 },
    { name = "East Los Santos", minX = 2222.50, minY = -1628.50, minZ = -89.00, maxX = 2421.00, maxY = -1494.00, maxZ = 110.90 },
    { name = "East Los Santos", minX = 2266.20, minY = -1494.00, minZ = -89.00, maxX = 2381.60, maxY = -1372.00, maxZ = 110.90 },
    { name = "East Los Santos", minX = 2381.60, minY = -1494.00, minZ = -89.00, maxX = 2421.00, maxY = -1454.30, maxZ = 110.90 },
    { name = "East Los Santos", minX = 2281.40, minY = -1372.00, minZ = -89.00, maxX = 2381.60, maxY = -1135.00, maxZ = 110.90 },
    { name = "East Los Santos", minX = 2381.60, minY = -1454.30, minZ = -89.00, maxX = 2462.10, maxY = -1135.00, maxZ = 110.90 },
    { name = "East Los Santos", minX = 2462.10, minY = -1454.30, minZ = -89.00, maxX = 2581.70, maxY = -1135.00, maxZ = 110.90 },
    { name = "Easter Basin", minX = -1794.90, minY = 249.90, minZ = -9.10, maxX = -1242.90, maxY = 578.30, maxZ = 200.00 },
    { name = "Easter Basin", minX = -1794.90, minY = -50.00, minZ = -0.00, maxX = -1499.80, maxY = 249.90, maxZ = 200.00 },
    { name = "Easter Bay Airport", minX = -1499.80, minY = -50.00, minZ = -0.00, maxX = -1242.90, maxY = 249.90, maxZ = 200.00 },
    { name = "Easter Bay Airport", minX = -1794.90, minY = -730.10, minZ = -3.00, maxX = -1213.90, maxY = -50.00, maxZ = 200.00 },
    { name = "Easter Bay Airport", minX = -1213.90, minY = -730.10, minZ = 0.00, maxX = -1132.80, maxY = -50.00, maxZ = 200.00 },
    { name = "Easter Bay Airport", minX = -1242.90, minY = -50.00, minZ = 0.00, maxX = -1213.90, maxY = 578.30, maxZ = 200.00 },
    { name = "Easter Bay Airport", minX = -1213.90, minY = -50.00, minZ = -4.50, maxX = -947.90, maxY = 578.30, maxZ = 200.00 },
    { name = "Easter Bay Airport", minX = -1315.40, minY = -405.30, minZ = 15.40, maxX = -1264.40, maxY = -209.50, maxZ = 25.40 },
    { name = "Easter Bay Airport", minX = -1354.30, minY = -287.30, minZ = 15.40, maxX = -1315.40, maxY = -209.50, maxZ = 25.40 },
    { name = "Easter Bay Airport", minX = -1490.30, minY = -209.50, minZ = 15.40, maxX = -1264.40, maxY = -148.30, maxZ = 25.40 },
    { name = "Easter Bay Chemicals", minX = -1132.80, minY = -768.00, minZ = 0.00, maxX = -956.40, maxY = -578.10, maxZ = 200.00 },
    { name = "Easter Bay Chemicals", minX = -1132.80, minY = -787.30, minZ = 0.00, maxX = -956.40, maxY = -768.00, maxZ = 200.00 },
    { name = "El Castillo del Diablo", minX = -464.50, minY = 2217.60, minZ = 0.00, maxX = -208.50, maxY = 2580.30, maxZ = 200.00 },
    { name = "El Castillo del Diablo", minX = -208.50, minY = 2123.00, minZ = -7.60, maxX = 114.00, maxY = 2337.10, maxZ = 200.00 },
    { name = "El Castillo del Diablo", minX = -208.50, minY = 2337.10, minZ = 0.00, maxX = 8.40, maxY = 2487.10, maxZ = 200.00 },
    { name = "El Corona", minX = 1812.60, minY = -2179.20, minZ = -89.00, maxX = 1970.60, maxY = -1852.80, maxZ = 110.90 },
    { name = "El Corona", minX = 1692.60, minY = -2179.20, minZ = -89.00, maxX = 1812.60, maxY = -1842.20, maxZ = 110.90 },
    { name = "El Quebrados", minX = -1645.20, minY = 2498.50, minZ = 0.00, maxX = -1372.10, maxY = 2777.80, maxZ = 200.00 },
    { name = "Esplanade East", minX = -1620.30, minY = 1176.50, minZ = -4.50, maxX = -1580.00, maxY = 1274.20, maxZ = 200.00 },
    { name = "Esplanade East", minX = -1580.00, minY = 1025.90, minZ = -6.10, maxX = -1499.80, maxY = 1274.20, maxZ = 200.00 },
    { name = "Esplanade East", minX = -1499.80, minY = 578.30, minZ = -79.60, maxX = -1339.80, maxY = 1274.20, maxZ = 20.30 },
    { name = "Esplanade North", minX = -2533.00, minY = 1358.90, minZ = -4.50, maxX = -1996.60, maxY = 1501.20, maxZ = 200.00 },
    { name = "Esplanade North", minX = -1996.60, minY = 1358.90, minZ = -4.50, maxX = -1524.20, maxY = 1592.50, maxZ = 200.00 },
    { name = "Esplanade North", minX = -1982.30, minY = 1274.20, minZ = -4.50, maxX = -1524.20, maxY = 1358.90, maxZ = 200.00 },
    { name = "Fallen Tree", minX = -792.20, minY = -698.50, minZ = -5.30, maxX = -452.40, maxY = -380.00, maxZ = 200.00 },
    { name = "Fallow Bridge", minX = 434.30, minY = 366.50, minZ = 0.00, maxX = 603.00, maxY = 555.60, maxZ = 200.00 },
    { name = "Fern Ridge", minX = 508.10, minY = -139.20, minZ = 0.00, maxX = 1306.60, maxY = 119.50, maxZ = 200.00 },
    { name = "Financial", minX = -1871.70, minY = 744.10, minZ = -6.10, maxX = -1701.30, maxY = 1176.40, maxZ = 300.00 },
    { name = "Fisher's Lagoon", minX = 1916.90, minY = -233.30, minZ = -100.00, maxX = 2131.70, maxY = 13.80, maxZ = 200.00 },
    { name = "Flint Intersection", minX = -187.70, minY = -1596.70, minZ = -89.00, maxX = 17.00, maxY = -1276.60, maxZ = 110.90 },
    { name = "Flint Range", minX = -594.10, minY = -1648.50, minZ = 0.00, maxX = -187.70, maxY = -1276.60, maxZ = 200.00 },
    { name = "Fort Carson", minX = -376.20, minY = 826.30, minZ = -3.00, maxX = 123.70, maxY = 1220.40, maxZ = 200.00 },
    { name = "Foster Valley", minX = -2270.00, minY = -430.20, minZ = -0.00, maxX = -2178.60, maxY = -324.10, maxZ = 200.00 },
    { name = "Foster Valley", minX = -2178.60, minY = -599.80, minZ = -0.00, maxX = -1794.90, maxY = -324.10, maxZ = 200.00 },
    { name = "Foster Valley", minX = -2178.60, minY = -1115.50, minZ = 0.00, maxX = -1794.90, maxY = -599.80, maxZ = 200.00 },
    { name = "Foster Valley", minX = -2178.60, minY = -1250.90, minZ = 0.00, maxX = -1794.90, maxY = -1115.50, maxZ = 200.00 },
    { name = "Frederick Bridge", minX = 2759.20, minY = 296.50, minZ = 0.00, maxX = 2774.20, maxY = 594.70, maxZ = 200.00 },
    { name = "Gant Bridge", minX = -2741.40, minY = 1659.60, minZ = -6.10, maxX = -2616.40, maxY = 2175.10, maxZ = 200.00 },
    { name = "Gant Bridge", minX = -2741.00, minY = 1490.40, minZ = -6.10, maxX = -2616.40, maxY = 1659.60, maxZ = 200.00 },
    { name = "Ganton", minX = 2222.50, minY = -1852.80, minZ = -89.00, maxX = 2632.80, maxY = -1722.30, maxZ = 110.90 },
    { name = "Ganton", minX = 2222.50, minY = -1722.30, minZ = -89.00, maxX = 2632.80, maxY = -1628.50, maxZ = 110.90 },
    { name = "Garcia", minX = -2411.20, minY = -222.50, minZ = -0.00, maxX = -2173.00, maxY = 265.20, maxZ = 200.00 },
    { name = "Garcia", minX = -2395.10, minY = -222.50, minZ = -5.30, maxX = -2354.00, maxY = -204.70, maxZ = 200.00 },
    { name = "Garver Bridge", minX = -1339.80, minY = 828.10, minZ = -89.00, maxX = -1213.90, maxY = 1057.00, maxZ = 110.90 },
    { name = "Garver Bridge", minX = -1213.90, minY = 950.00, minZ = -89.00, maxX = -1087.90, maxY = 1178.90, maxZ = 110.90 },
    { name = "Garver Bridge", minX = -1499.80, minY = 696.40, minZ = -179.60, maxX = -1339.80, maxY = 925.30, maxZ = 20.30 },
    { name = "Glen Park", minX = 1812.60, minY = -1449.60, minZ = -89.00, maxX = 1996.90, maxY = -1350.70, maxZ = 110.90 },
    { name = "Glen Park", minX = 1812.60, minY = -1100.80, minZ = -89.00, maxX = 1994.30, maxY = -973.30, maxZ = 110.90 },
    { name = "Glen Park", minX = 1812.60, minY = -1350.70, minZ = -89.00, maxX = 2056.80, maxY = -1100.80, maxZ = 110.90 },
    { name = "Green Palms", minX = 176.50, minY = 1305.40, minZ = -3.00, maxX = 338.60, maxY = 1520.70, maxZ = 200.00 },
    { name = "Greenglass College", minX = 964.30, minY = 1044.60, minZ = -89.00, maxX = 1197.30, maxY = 1203.20, maxZ = 110.90 },
    { name = "Greenglass College", minX = 964.30, minY = 930.80, minZ = -89.00, maxX = 1166.50, maxY = 1044.60, maxZ = 110.90 },
    { name = "Hampton Barns", minX = 603.00, minY = 264.30, minZ = 0.00, maxX = 761.90, maxY = 366.50, maxZ = 200.00 },
    { name = "Hankypanky Point", minX = 2576.90, minY = 62.10, minZ = 0.00, maxX = 2759.20, maxY = 385.50, maxZ = 200.00 },
    { name = "Harry Gold Parkway", minX = 1777.30, minY = 863.20, minZ = -89.00, maxX = 1817.30, maxY = 2342.80, maxZ = 110.90 },
    { name = "Hashbury", minX = -2593.40, minY = -222.50, minZ = -0.00, maxX = -2411.20, maxY = 54.70, maxZ = 200.00 },
    { name = "Hilltop Farm", minX = 967.30, minY = -450.30, minZ = -3.00, maxX = 1176.70, maxY = -217.90, maxZ = 200.00 },
    { name = "Hunter Quarry", minX = 337.20, minY = 710.80, minZ = -115.20, maxX = 860.50, maxY = 1031.70, maxZ = 203.70 },
    { name = "Idlewood", minX = 1812.60, minY = -1852.80, minZ = -89.00, maxX = 1971.60, maxY = -1742.30, maxZ = 110.90 },
    { name = "Idlewood", minX = 1812.60, minY = -1742.30, minZ = -89.00, maxX = 1951.60, maxY = -1602.30, maxZ = 110.90 },
    { name = "Idlewood", minX = 1951.60, minY = -1742.30, minZ = -89.00, maxX = 2124.60, maxY = -1602.30, maxZ = 110.90 },
    { name = "Idlewood", minX = 1812.60, minY = -1602.30, minZ = -89.00, maxX = 2124.60, maxY = -1449.60, maxZ = 110.90 },
    { name = "Idlewood", minX = 2124.60, minY = -1742.30, minZ = -89.00, maxX = 2222.50, maxY = -1494.00, maxZ = 110.90 },
    { name = "Idlewood", minX = 1971.60, minY = -1852.80, minZ = -89.00, maxX = 2222.50, maxY = -1742.30, maxZ = 110.90 },
    { name = "Jefferson", minX = 1996.90, minY = -1449.60, minZ = -89.00, maxX = 2056.80, maxY = -1350.70, maxZ = 110.90 },
    { name = "Jefferson", minX = 2124.60, minY = -1494.00, minZ = -89.00, maxX = 2266.20, maxY = -1449.60, maxZ = 110.90 },
    { name = "Jefferson", minX = 2056.80, minY = -1372.00, minZ = -89.00, maxX = 2281.40, maxY = -1210.70, maxZ = 110.90 },
    { name = "Jefferson", minX = 2056.80, minY = -1210.70, minZ = -89.00, maxX = 2185.30, maxY = -1126.30, maxZ = 110.90 },
    { name = "Jefferson", minX = 2185.30, minY = -1210.70, minZ = -89.00, maxX = 2281.40, maxY = -1154.50, maxZ = 110.90 },
    { name = "Jefferson", minX = 2056.80, minY = -1449.60, minZ = -89.00, maxX = 2266.20, maxY = -1372.00, maxZ = 110.90 },
    { name = "Julius Thruway East", minX = 2623.10, minY = 943.20, minZ = -89.00, maxX = 2749.90, maxY = 1055.90, maxZ = 110.90 },
    { name = "Julius Thruway East", minX = 2685.10, minY = 1055.90, minZ = -89.00, maxX = 2749.90, maxY = 2626.50, maxZ = 110.90 },
    { name = "Julius Thruway East", minX = 2536.40, minY = 2442.50, minZ = -89.00, maxX = 2685.10, maxY = 2542.50, maxZ = 110.90 },
    { name = "Julius Thruway East", minX = 2625.10, minY = 2202.70, minZ = -89.00, maxX = 2685.10, maxY = 2442.50, maxZ = 110.90 },
    { name = "Julius Thruway North", minX = 2498.20, minY = 2542.50, minZ = -89.00, maxX = 2685.10, maxY = 2626.50, maxZ = 110.90 },
    { name = "Julius Thruway North", minX = 2237.40, minY = 2542.50, minZ = -89.00, maxX = 2498.20, maxY = 2663.10, maxZ = 110.90 },
    { name = "Julius Thruway North", minX = 2121.40, minY = 2508.20, minZ = -89.00, maxX = 2237.40, maxY = 2663.10, maxZ = 110.90 },
    { name = "Julius Thruway North", minX = 1938.80, minY = 2508.20, minZ = -89.00, maxX = 2121.40, maxY = 2624.20, maxZ = 110.90 },
    { name = "Julius Thruway North", minX = 1534.50, minY = 2433.20, minZ = -89.00, maxX = 1848.40, maxY = 2583.20, maxZ = 110.90 },
    { name = "Julius Thruway North", minX = 1848.40, minY = 2478.40, minZ = -89.00, maxX = 1938.80, maxY = 2553.40, maxZ = 110.90 },
    { name = "Julius Thruway North", minX = 1704.50, minY = 2342.80, minZ = -89.00, maxX = 1848.40, maxY = 2433.20, maxZ = 110.90 },
    { name = "Julius Thruway North", minX = 1377.30, minY = 2433.20, minZ = -89.00, maxX = 1534.50, maxY = 2507.20, maxZ = 110.90 },
    { name = "Julius Thruway South", minX = 1457.30, minY = 823.20, minZ = -89.00, maxX = 2377.30, maxY = 863.20, maxZ = 110.90 },
    { name = "Julius Thruway South", minX = 2377.30, minY = 788.80, minZ = -89.00, maxX = 2537.30, maxY = 897.90, maxZ = 110.90 },
    { name = "Julius Thruway West", minX = 1197.30, minY = 1163.30, minZ = -89.00, maxX = 1236.60, maxY = 2243.20, maxZ = 110.90 },
    { name = "Julius Thruway West", minX = 1236.60, minY = 2142.80, minZ = -89.00, maxX = 1297.40, maxY = 2243.20, maxZ = 110.90 },
    { name = "Juniper Hill", minX = -2533.00, minY = 578.30, minZ = -7.60, maxX = -2274.10, maxY = 968.30, maxZ = 200.00 },
    { name = "Juniper Hollow", minX = -2533.00, minY = 968.30, minZ = -6.10, maxX = -2274.10, maxY = 1358.90, maxZ = 200.00 },
    { name = "K.A.C.C. Military Fuels", minX = 2498.20, minY = 2626.50, minZ = -89.00, maxX = 2749.90, maxY = 2861.50, maxZ = 110.90 },
    { name = "Kincaid Bridge", minX = -1339.80, minY = 599.20, minZ = -89.00, maxX = -1213.90, maxY = 828.10, maxZ = 110.90 },
    { name = "Kincaid Bridge", minX = -1213.90, minY = 721.10, minZ = -89.00, maxX = -1087.90, maxY = 950.00, maxZ = 110.90 },
    { name = "Kincaid Bridge", minX = -1087.90, minY = 855.30, minZ = -89.00, maxX = -961.90, maxY = 986.20, maxZ = 110.90 },
    { name = "King's", minX = -2329.30, minY = 458.40, minZ = -7.60, maxX = -1993.20, maxY = 578.30, maxZ = 200.00 },
    { name = "King's", minX = -2411.20, minY = 265.20, minZ = -9.10, maxX = -1993.20, maxY = 373.50, maxZ = 200.00 },
    { name = "King's", minX = -2253.50, minY = 373.50, minZ = -9.10, maxX = -1993.20, maxY = 458.40, maxZ = 200.00 },
    { name = "LVA Freight Depot", minX = 1457.30, minY = 863.20, minZ = -89.00, maxX = 1777.40, maxY = 1143.20, maxZ = 110.90 },
    { name = "LVA Freight Depot", minX = 1375.60, minY = 919.40, minZ = -89.00, maxX = 1457.30, maxY = 1203.20, maxZ = 110.90 },
    { name = "LVA Freight Depot", minX = 1277.00, minY = 1087.60, minZ = -89.00, maxX = 1375.60, maxY = 1203.20, maxZ = 110.90 },
    { name = "LVA Freight Depot", minX = 1315.30, minY = 1044.60, minZ = -89.00, maxX = 1375.60, maxY = 1087.60, maxZ = 110.90 },
    { name = "LVA Freight Depot", minX = 1236.60, minY = 1163.40, minZ = -89.00, maxX = 1277.00, maxY = 1203.20, maxZ = 110.90 },
    { name = "Las Barrancas", minX = -926.10, minY = 1398.70, minZ = -3.00, maxX = -719.20, maxY = 1634.60, maxZ = 200.00 },
    { name = "Las Brujas", minX = -365.10, minY = 2123.00, minZ = -3.00, maxX = -208.50, maxY = 2217.60, maxZ = 200.00 },
    { name = "Las Colinas", minX = 1994.30, minY = -1100.80, minZ = -89.00, maxX = 2056.80, maxY = -920.80, maxZ = 110.90 },
    { name = "Las Colinas", minX = 2056.80, minY = -1126.30, minZ = -89.00, maxX = 2126.80, maxY = -920.80, maxZ = 110.90 },
    { name = "Las Colinas", minX = 2185.30, minY = -1154.50, minZ = -89.00, maxX = 2281.40, maxY = -934.40, maxZ = 110.90 },
    { name = "Las Colinas", minX = 2126.80, minY = -1126.30, minZ = -89.00, maxX = 2185.30, maxY = -934.40, maxZ = 110.90 },
    { name = "Las Colinas", minX = 2747.70, minY = -1120.00, minZ = -89.00, maxX = 2959.30, maxY = -945.00, maxZ = 110.90 },
    { name = "Las Colinas", minX = 2632.70, minY = -1135.00, minZ = -89.00, maxX = 2747.70, maxY = -945.00, maxZ = 110.90 },
    { name = "Las Colinas", minX = 2281.40, minY = -1135.00, minZ = -89.00, maxX = 2632.70, maxY = -945.00, maxZ = 110.90 },
    { name = "Las Payasadas", minX = -354.30, minY = 2580.30, minZ = 2.00, maxX = -133.60, maxY = 2816.80, maxZ = 200.00 },
    { name = "Las Venturas Airport", minX = 1236.60, minY = 1203.20, minZ = -89.00, maxX = 1457.30, maxY = 1883.10, maxZ = 110.90 },
    { name = "Las Venturas Airport", minX = 1457.30, minY = 1203.20, minZ = -89.00, maxX = 1777.30, maxY = 1883.10, maxZ = 110.90 },
    { name = "Las Venturas Airport", minX = 1457.30, minY = 1143.20, minZ = -89.00, maxX = 1777.40, maxY = 1203.20, maxZ = 110.90 },
    { name = "Las Venturas Airport", minX = 1515.80, minY = 1586.40, minZ = -12.50, maxX = 1729.90, maxY = 1714.50, maxZ = 87.50 },
    { name = "Last Dime Motel", minX = 1823.00, minY = 596.30, minZ = -89.00, maxX = 1997.20, maxY = 823.20, maxZ = 110.90 },
    { name = "Leafy Hollow", minX = -1166.90, minY = -1856.00, minZ = 0.00, maxX = -815.60, maxY = -1602.00, maxZ = 200.00 },
    { name = "Liberty City", minX = -1000.00, minY = 400.00, minZ = 1300.00, maxX = -700.00, maxY = 600.00, maxZ = 1400.00 },
    { name = "Lil' Probe Inn", minX = -90.20, minY = 1286.80, minZ = -3.00, maxX = 153.80, maxY = 1554.10, maxZ = 200.00 },
    { name = "Linden Side", minX = 2749.90, minY = 943.20, minZ = -89.00, maxX = 2923.30, maxY = 1198.90, maxZ = 110.90 },
    { name = "Linden Station", minX = 2749.90, minY = 1198.90, minZ = -89.00, maxX = 2923.30, maxY = 1548.90, maxZ = 110.90 },
    { name = "Linden Station", minX = 2811.20, minY = 1229.50, minZ = -39.50, maxX = 2861.20, maxY = 1407.50, maxZ = 60.40 },
    { name = "Little Mexico", minX = 1701.90, minY = -1842.20, minZ = -89.00, maxX = 1812.60, maxY = -1722.20, maxZ = 110.90 },
    { name = "Little Mexico", minX = 1758.90, minY = -1722.20, minZ = -89.00, maxX = 1812.60, maxY = -1577.50, maxZ = 110.90 },
    { name = "Los Flores", minX = 2581.70, minY = -1454.30, minZ = -89.00, maxX = 2632.80, maxY = -1393.40, maxZ = 110.90 },
    { name = "Los Flores", minX = 2581.70, minY = -1393.40, minZ = -89.00, maxX = 2747.70, maxY = -1135.00, maxZ = 110.90 },
    { name = "Los Santos International", minX = 1249.60, minY = -2394.30, minZ = -89.00, maxX = 1852.00, maxY = -2179.20, maxZ = 110.90 },
    { name = "Los Santos International", minX = 1852.00, minY = -2394.30, minZ = -89.00, maxX = 2089.00, maxY = -2179.20, maxZ = 110.90 },
    { name = "Los Santos International", minX = 1382.70, minY = -2730.80, minZ = -89.00, maxX = 2201.80, maxY = -2394.30, maxZ = 110.90 },
    { name = "Los Santos International", minX = 1974.60, minY = -2394.30, minZ = -39.00, maxX = 2089.00, maxY = -2256.50, maxZ = 60.90 },
    { name = "Los Santos International", minX = 1400.90, minY = -2669.20, minZ = -39.00, maxX = 2189.80, maxY = -2597.20, maxZ = 60.90 },
    { name = "Los Santos International", minX = 2051.60, minY = -2597.20, minZ = -39.00, maxX = 2152.40, maxY = -2394.30, maxZ = 60.90 },
    { name = "Marina", minX = 647.70, minY = -1804.20, minZ = -89.00, maxX = 851.40, maxY = -1577.50, maxZ = 110.90 },
    { name = "Marina", minX = 647.70, minY = -1577.50, minZ = -89.00, maxX = 807.90, maxY = -1416.20, maxZ = 110.90 },
    { name = "Marina", minX = 807.90, minY = -1577.50, minZ = -89.00, maxX = 926.90, maxY = -1416.20, maxZ = 110.90 },
    { name = "Market", minX = 787.40, minY = -1416.20, minZ = -89.00, maxX = 1072.60, maxY = -1310.20, maxZ = 110.90 },
    { name = "Market", minX = 952.60, minY = -1310.20, minZ = -89.00, maxX = 1072.60, maxY = -1130.80, maxZ = 110.90 },
    { name = "Market", minX = 1072.60, minY = -1416.20, minZ = -89.00, maxX = 1370.80, maxY = -1130.80, maxZ = 110.90 },
    { name = "Market", minX = 926.90, minY = -1577.50, minZ = -89.00, maxX = 1370.80, maxY = -1416.20, maxZ = 110.90 },
    { name = "Market Station", minX = 787.40, minY = -1410.90, minZ = -34.10, maxX = 866.00, maxY = -1310.20, maxZ = 65.80 },
    { name = "Martin Bridge", minX = -222.10, minY = 293.30, minZ = 0.00, maxX = -122.10, maxY = 476.40, maxZ = 200.00 },
    { name = "Missionary Hill", minX = -2994.40, minY = -811.20, minZ = 0.00, maxX = -2178.60, maxY = -430.20, maxZ = 200.00 },
    { name = "Montgomery", minX = 1119.50, minY = 119.50, minZ = -3.00, maxX = 1451.40, maxY = 493.30, maxZ = 200.00 },
    { name = "Montgomery", minX = 1451.40, minY = 347.40, minZ = -6.10, maxX = 1582.40, maxY = 420.80, maxZ = 200.00 },
    { name = "Montgomery Intersection", minX = 1546.60, minY = 208.10, minZ = 0.00, maxX = 1745.80, maxY = 347.40, maxZ = 200.00 },
    { name = "Montgomery Intersection", minX = 1582.40, minY = 347.40, minZ = 0.00, maxX = 1664.60, maxY = 401.70, maxZ = 200.00 },
    { name = "Mulholland", minX = 1414.00, minY = -768.00, minZ = -89.00, maxX = 1667.60, maxY = -452.40, maxZ = 110.90 },
    { name = "Mulholland", minX = 1281.10, minY = -452.40, minZ = -89.00, maxX = 1641.10, maxY = -290.90, maxZ = 110.90 },
    { name = "Mulholland", minX = 1269.10, minY = -768.00, minZ = -89.00, maxX = 1414.00, maxY = -452.40, maxZ = 110.90 },
    { name = "Mulholland", minX = 1357.00, minY = -926.90, minZ = -89.00, maxX = 1463.90, maxY = -768.00, maxZ = 110.90 },
    { name = "Mulholland", minX = 1318.10, minY = -910.10, minZ = -89.00, maxX = 1357.00, maxY = -768.00, maxZ = 110.90 },
    { name = "Mulholland", minX = 1169.10, minY = -910.10, minZ = -89.00, maxX = 1318.10, maxY = -768.00, maxZ = 110.90 },
    { name = "Mulholland", minX = 768.60, minY = -954.60, minZ = -89.00, maxX = 952.60, maxY = -860.60, maxZ = 110.90 },
    { name = "Mulholland", minX = 687.80, minY = -860.60, minZ = -89.00, maxX = 911.80, maxY = -768.00, maxZ = 110.90 },
    { name = "Mulholland", minX = 737.50, minY = -768.00, minZ = -89.00, maxX = 1142.20, maxY = -674.80, maxZ = 110.90 },
    { name = "Mulholland", minX = 1096.40, minY = -910.10, minZ = -89.00, maxX = 1169.10, maxY = -768.00, maxZ = 110.90 },
    { name = "Mulholland", minX = 952.60, minY = -937.10, minZ = -89.00, maxX = 1096.40, maxY = -860.60, maxZ = 110.90 },
    { name = "Mulholland", minX = 911.80, minY = -860.60, minZ = -89.00, maxX = 1096.40, maxY = -768.00, maxZ = 110.90 },
    { name = "Mulholland", minX = 861.00, minY = -674.80, minZ = -89.00, maxX = 1156.50, maxY = -600.80, maxZ = 110.90 },
    { name = "Mulholland Intersection", minX = 1463.90, minY = -1150.80, minZ = -89.00, maxX = 1812.60, maxY = -768.00, maxZ = 110.90 },
    { name = "North Rock", minX = 2285.30, minY = -768.00, minZ = 0.00, maxX = 2770.50, maxY = -269.70, maxZ = 200.00 },
    { name = "Ocean Docks", minX = 2373.70, minY = -2697.00, minZ = -89.00, maxX = 2809.20, maxY = -2330.40, maxZ = 110.90 },
    { name = "Ocean Docks", minX = 2201.80, minY = -2418.30, minZ = -89.00, maxX = 2324.00, maxY = -2095.00, maxZ = 110.90 },
    { name = "Ocean Docks", minX = 2324.00, minY = -2302.30, minZ = -89.00, maxX = 2703.50, maxY = -2145.10, maxZ = 110.90 },
    { name = "Ocean Docks", minX = 2089.00, minY = -2394.30, minZ = -89.00, maxX = 2201.80, maxY = -2235.80, maxZ = 110.90 },
    { name = "Ocean Docks", minX = 2201.80, minY = -2730.80, minZ = -89.00, maxX = 2324.00, maxY = -2418.30, maxZ = 110.90 },
    { name = "Ocean Docks", minX = 2703.50, minY = -2302.30, minZ = -89.00, maxX = 2959.30, maxY = -2126.90, maxZ = 110.90 },
    { name = "Ocean Docks", minX = 2324.00, minY = -2145.10, minZ = -89.00, maxX = 2703.50, maxY = -2059.20, maxZ = 110.90 },
    { name = "Ocean Flats", minX = -2994.40, minY = 277.40, minZ = -9.10, maxX = -2867.80, maxY = 458.40, maxZ = 200.00 },
    { name = "Ocean Flats", minX = -2994.40, minY = -222.50, minZ = -0.00, maxX = -2593.40, maxY = 277.40, maxZ = 200.00 },
    { name = "Ocean Flats", minX = -2994.40, minY = -430.20, minZ = -0.00, maxX = -2831.80, maxY = -222.50, maxZ = 200.00 },
    { name = "Octane Springs", minX = 338.60, minY = 1228.50, minZ = 0.00, maxX = 664.30, maxY = 1655.00, maxZ = 200.00 },
    { name = "Old Venturas Strip", minX = 2162.30, minY = 2012.10, minZ = -89.00, maxX = 2685.10, maxY = 2202.70, maxZ = 110.90 },
    { name = "Palisades", minX = -2994.40, minY = 458.40, minZ = -6.10, maxX = -2741.00, maxY = 1339.60, maxZ = 200.00 },
    { name = "Palomino Creek", minX = 2160.20, minY = -149.00, minZ = 0.00, maxX = 2576.90, maxY = 228.30, maxZ = 200.00 },
    { name = "Paradiso", minX = -2741.00, minY = 793.40, minZ = -6.10, maxX = -2533.00, maxY = 1268.40, maxZ = 200.00 },
    { name = "Pershing Square", minX = 1440.90, minY = -1722.20, minZ = -89.00, maxX = 1583.50, maxY = -1577.50, maxZ = 110.90 },
    { name = "Pilgrim", minX = 2437.30, minY = 1383.20, minZ = -89.00, maxX = 2624.40, maxY = 1783.20, maxZ = 110.90 },
    { name = "Pilgrim", minX = 2624.40, minY = 1383.20, minZ = -89.00, maxX = 2685.10, maxY = 1783.20, maxZ = 110.90 },
    { name = "Pilson Intersection", minX = 1098.30, minY = 2243.20, minZ = -89.00, maxX = 1377.30, maxY = 2507.20, maxZ = 110.90 },
    { name = "Pirates in Men's Pants", minX = 1817.30, minY = 1469.20, minZ = -89.00, maxX = 2027.40, maxY = 1703.20, maxZ = 110.90 },
    { name = "Playa del Seville", minX = 2703.50, minY = -2126.90, minZ = -89.00, maxX = 2959.30, maxY = -1852.80, maxZ = 110.90 },
    { name = "Prickle Pine", minX = 1534.50, minY = 2583.20, minZ = -89.00, maxX = 1848.40, maxY = 2863.20, maxZ = 110.90 },
    { name = "Prickle Pine", minX = 1117.40, minY = 2507.20, minZ = -89.00, maxX = 1534.50, maxY = 2723.20, maxZ = 110.90 },
    { name = "Prickle Pine", minX = 1848.40, minY = 2553.40, minZ = -89.00, maxX = 1938.80, maxY = 2863.20, maxZ = 110.90 },
    { name = "Prickle Pine", minX = 1938.80, minY = 2624.20, minZ = -89.00, maxX = 2121.40, maxY = 2861.50, maxZ = 110.90 },
    { name = "Queens", minX = -2533.00, minY = 458.40, minZ = 0.00, maxX = -2329.30, maxY = 578.30, maxZ = 200.00 },
    { name = "Queens", minX = -2593.40, minY = 54.70, minZ = 0.00, maxX = -2411.20, maxY = 458.40, maxZ = 200.00 },
    { name = "Queens", minX = -2411.20, minY = 373.50, minZ = 0.00, maxX = -2253.50, maxY = 458.40, maxZ = 200.00 },
    { name = "Randolph Industrial Estate", minX = 1558.00, minY = 596.30, minZ = -89.00, maxX = 1823.00, maxY = 823.20, maxZ = 110.90 },
    { name = "Redsands East", minX = 1817.30, minY = 2011.80, minZ = -89.00, maxX = 2106.70, maxY = 2202.70, maxZ = 110.90 },
    { name = "Redsands East", minX = 1817.30, minY = 2202.70, minZ = -89.00, maxX = 2011.90, maxY = 2342.80, maxZ = 110.90 },
    { name = "Redsands East", minX = 1848.40, minY = 2342.80, minZ = -89.00, maxX = 2011.90, maxY = 2478.40, maxZ = 110.90 },
    { name = "Redsands West", minX = 1236.60, minY = 1883.10, minZ = -89.00, maxX = 1777.30, maxY = 2142.80, maxZ = 110.90 },
    { name = "Redsands West", minX = 1297.40, minY = 2142.80, minZ = -89.00, maxX = 1777.30, maxY = 2243.20, maxZ = 110.90 },
    { name = "Redsands West", minX = 1377.30, minY = 2243.20, minZ = -89.00, maxX = 1704.50, maxY = 2433.20, maxZ = 110.90 },
    { name = "Redsands West", minX = 1704.50, minY = 2243.20, minZ = -89.00, maxX = 1777.30, maxY = 2342.80, maxZ = 110.90 },
    { name = "Regular Tom", minX = -405.70, minY = 1712.80, minZ = -3.00, maxX = -276.70, maxY = 1892.70, maxZ = 200.00 },
    { name = "Richman", minX = 647.50, minY = -1118.20, minZ = -89.00, maxX = 787.40, maxY = -954.60, maxZ = 110.90 },
    { name = "Richman", minX = 647.50, minY = -954.60, minZ = -89.00, maxX = 768.60, maxY = -860.60, maxZ = 110.90 },
    { name = "Richman", minX = 225.10, minY = -1369.60, minZ = -89.00, maxX = 334.50, maxY = -1292.00, maxZ = 110.90 },
    { name = "Richman", minX = 225.10, minY = -1292.00, minZ = -89.00, maxX = 466.20, maxY = -1235.00, maxZ = 110.90 },
    { name = "Richman", minX = 72.60, minY = -1404.90, minZ = -89.00, maxX = 225.10, maxY = -1235.00, maxZ = 110.90 },
    { name = "Richman", minX = 72.60, minY = -1235.00, minZ = -89.00, maxX = 321.30, maxY = -1008.10, maxZ = 110.90 },
    { name = "Richman", minX = 321.30, minY = -1235.00, minZ = -89.00, maxX = 647.50, maxY = -1044.00, maxZ = 110.90 },
    { name = "Richman", minX = 321.30, minY = -1044.00, minZ = -89.00, maxX = 647.50, maxY = -860.60, maxZ = 110.90 },
    { name = "Richman", minX = 321.30, minY = -860.60, minZ = -89.00, maxX = 687.80, maxY = -768.00, maxZ = 110.90 },
    { name = "Richman", minX = 321.30, minY = -768.00, minZ = -89.00, maxX = 700.70, maxY = -674.80, maxZ = 110.90 },
    { name = "Robada Intersection", minX = -1119.00, minY = 1178.90, minZ = -89.00, maxX = -862.00, maxY = 1351.40, maxZ = 110.90 },
    { name = "Roca Escalante", minX = 2237.40, minY = 2202.70, minZ = -89.00, maxX = 2536.40, maxY = 2542.50, maxZ = 110.90 },
    { name = "Roca Escalante", minX = 2536.40, minY = 2202.70, minZ = -89.00, maxX = 2625.10, maxY = 2442.50, maxZ = 110.90 },
    { name = "Rockshore East", minX = 2537.30, minY = 676.50, minZ = -89.00, maxX = 2902.30, maxY = 943.20, maxZ = 110.90 },
    { name = "Rockshore West", minX = 1997.20, minY = 596.30, minZ = -89.00, maxX = 2377.30, maxY = 823.20, maxZ = 110.90 },
    { name = "Rockshore West", minX = 2377.30, minY = 596.30, minZ = -89.00, maxX = 2537.30, maxY = 788.80, maxZ = 110.90 },
    { name = "Rodeo", minX = 72.60, minY = -1684.60, minZ = -89.00, maxX = 225.10, maxY = -1544.10, maxZ = 110.90 },
    { name = "Rodeo", minX = 72.60, minY = -1544.10, minZ = -89.00, maxX = 225.10, maxY = -1404.90, maxZ = 110.90 },
    { name = "Rodeo", minX = 225.10, minY = -1684.60, minZ = -89.00, maxX = 312.80, maxY = -1501.90, maxZ = 110.90 },
    { name = "Rodeo", minX = 225.10, minY = -1501.90, minZ = -89.00, maxX = 334.50, maxY = -1369.60, maxZ = 110.90 },
    { name = "Rodeo", minX = 334.50, minY = -1501.90, minZ = -89.00, maxX = 422.60, maxY = -1406.00, maxZ = 110.90 },
    { name = "Rodeo", minX = 312.80, minY = -1684.60, minZ = -89.00, maxX = 422.60, maxY = -1501.90, maxZ = 110.90 },
    { name = "Rodeo", minX = 422.60, minY = -1684.60, minZ = -89.00, maxX = 558.00, maxY = -1570.20, maxZ = 110.90 },
    { name = "Rodeo", minX = 558.00, minY = -1684.60, minZ = -89.00, maxX = 647.50, maxY = -1384.90, maxZ = 110.90 },
    { name = "Rodeo", minX = 466.20, minY = -1570.20, minZ = -89.00, maxX = 558.00, maxY = -1385.00, maxZ = 110.90 },
    { name = "Rodeo", minX = 422.60, minY = -1570.20, minZ = -89.00, maxX = 466.20, maxY = -1406.00, maxZ = 110.90 },
    { name = "Rodeo", minX = 466.20, minY = -1385.00, minZ = -89.00, maxX = 647.50, maxY = -1235.00, maxZ = 110.90 },
    { name = "Rodeo", minX = 334.50, minY = -1406.00, minZ = -89.00, maxX = 466.20, maxY = -1292.00, maxZ = 110.90 },
    { name = "Royal Casino", minX = 2087.30, minY = 1383.20, minZ = -89.00, maxX = 2437.30, maxY = 1543.20, maxZ = 110.90 },
    { name = "San Andreas Sound", minX = 2450.30, minY = 385.50, minZ = -100.00, maxX = 2759.20, maxY = 562.30, maxZ = 200.00 },
    { name = "Santa Flora", minX = -2741.00, minY = 458.40, minZ = -7.60, maxX = -2533.00, maxY = 793.40, maxZ = 200.00 },
    { name = "Santa Maria Beach", minX = 342.60, minY = -2173.20, minZ = -89.00, maxX = 647.70, maxY = -1684.60, maxZ = 110.90 },
    { name = "Santa Maria Beach", minX = 72.60, minY = -2173.20, minZ = -89.00, maxX = 342.60, maxY = -1684.60, maxZ = 110.90 },
    { name = "Shady Cabin", minX = -1632.80, minY = -2263.40, minZ = -3.00, maxX = -1601.30, maxY = -2231.70, maxZ = 200.00 },
    { name = "Shady Creeks", minX = -1820.60, minY = -2643.60, minZ = -8.00, maxX = -1226.70, maxY = -1771.60, maxZ = 200.00 },
    { name = "Shady Creeks", minX = -2030.10, minY = -2174.80, minZ = -6.10, maxX = -1820.60, maxY = -1771.60, maxZ = 200.00 },
    { name = "Sobell Rail Yards", minX = 2749.90, minY = 1548.90, minZ = -89.00, maxX = 2923.30, maxY = 1937.20, maxZ = 110.90 },
    { name = "Spinybed", minX = 2121.40, minY = 2663.10, minZ = -89.00, maxX = 2498.20, maxY = 2861.50, maxZ = 110.90 },
    { name = "Starfish Casino", minX = 2437.30, minY = 1783.20, minZ = -89.00, maxX = 2685.10, maxY = 2012.10, maxZ = 110.90 },
    { name = "Starfish Casino", minX = 2437.30, minY = 1858.10, minZ = -39.00, maxX = 2495.00, maxY = 1970.80, maxZ = 60.90 },
    { name = "Starfish Casino", minX = 2162.30, minY = 1883.20, minZ = -89.00, maxX = 2437.30, maxY = 2012.10, maxZ = 110.90 },
    { name = "Temple", minX = 1252.30, minY = -1130.80, minZ = -89.00, maxX = 1378.30, maxY = -1026.30, maxZ = 110.90 },
    { name = "Temple", minX = 1252.30, minY = -1026.30, minZ = -89.00, maxX = 1391.00, maxY = -926.90, maxZ = 110.90 },
    { name = "Temple", minX = 1252.30, minY = -926.90, minZ = -89.00, maxX = 1357.00, maxY = -910.10, maxZ = 110.90 },
    { name = "Temple", minX = 952.60, minY = -1130.80, minZ = -89.00, maxX = 1096.40, maxY = -937.10, maxZ = 110.90 },
    { name = "Temple", minX = 1096.40, minY = -1130.80, minZ = -89.00, maxX = 1252.30, maxY = -1026.30, maxZ = 110.90 },
    { name = "Temple", minX = 1096.40, minY = -1026.30, minZ = -89.00, maxX = 1252.30, maxY = -910.10, maxZ = 110.90 },
    { name = "The Camel's Toe", minX = 2087.30, minY = 1203.20, minZ = -89.00, maxX = 2640.40, maxY = 1383.20, maxZ = 110.90 },
    { name = "The Clown's Pocket", minX = 2162.30, minY = 1783.20, minZ = -89.00, maxX = 2437.30, maxY = 1883.20, maxZ = 110.90 },
    { name = "The Emerald Isle", minX = 2011.90, minY = 2202.70, minZ = -89.00, maxX = 2237.40, maxY = 2508.20, maxZ = 110.90 },
    { name = "The Farm", minX = -1209.60, minY = -1317.10, minZ = 114.90, maxX = -908.10, maxY = -787.30, maxZ = 251.90 },
    { name = "The Four Dragons Casino", minX = 1817.30, minY = 863.20, minZ = -89.00, maxX = 2027.30, maxY = 1083.20, maxZ = 110.90 },
    { name = "The High Roller", minX = 1817.30, minY = 1283.20, minZ = -89.00, maxX = 2027.30, maxY = 1469.20, maxZ = 110.90 },
    { name = "The Mako Span", minX = 1664.60, minY = 401.70, minZ = 0.00, maxX = 1785.10, maxY = 567.20, maxZ = 200.00 },
    { name = "The Panopticon", minX = -947.90, minY = -304.30, minZ = -1.10, maxX = -319.60, maxY = 327.00, maxZ = 200.00 },
    { name = "The Pink Swan", minX = 1817.30, minY = 1083.20, minZ = -89.00, maxX = 2027.30, maxY = 1283.20, maxZ = 110.90 },
    { name = "The Sherman Dam", minX = -968.70, minY = 1929.40, minZ = -3.00, maxX = -481.10, maxY = 2155.20, maxZ = 200.00 },
    { name = "The Strip", minX = 2027.40, minY = 863.20, minZ = -89.00, maxX = 2087.30, maxY = 1703.20, maxZ = 110.90 },
    { name = "The Strip", minX = 2106.70, minY = 1863.20, minZ = -89.00, maxX = 2162.30, maxY = 2202.70, maxZ = 110.90 },
    { name = "The Strip", minX = 2027.40, minY = 1783.20, minZ = -89.00, maxX = 2162.30, maxY = 1863.20, maxZ = 110.90 },
    { name = "The Strip", minX = 2027.40, minY = 1703.20, minZ = -89.00, maxX = 2137.40, maxY = 1783.20, maxZ = 110.90 },
    { name = "The Visage", minX = 1817.30, minY = 1863.20, minZ = -89.00, maxX = 2106.70, maxY = 2011.80, maxZ = 110.90 },
    { name = "The Visage", minX = 1817.30, minY = 1703.20, minZ = -89.00, maxX = 2027.40, maxY = 1863.20, maxZ = 110.90 },
    { name = "Unity Station", minX = 1692.60, minY = -1971.80, minZ = -20.40, maxX = 1812.60, maxY = -1932.80, maxZ = 79.50 },
    { name = "Valle Ocultado", minX = -936.60, minY = 2611.40, minZ = 2.00, maxX = -715.90, maxY = 2847.90, maxZ = 200.00 },
    { name = "Verdant Bluffs", minX = 930.20, minY = -2488.40, minZ = -89.00, maxX = 1249.60, maxY = -2006.70, maxZ = 110.90 },
    { name = "Verdant Bluffs", minX = 1073.20, minY = -2006.70, minZ = -89.00, maxX = 1249.60, maxY = -1842.20, maxZ = 110.90 },
    { name = "Verdant Bluffs", minX = 1249.60, minY = -2179.20, minZ = -89.00, maxX = 1692.60, maxY = -1842.20, maxZ = 110.90 },
    { name = "Verdant Meadows", minX = 37.00, minY = 2337.10, minZ = -3.00, maxX = 435.90, maxY = 2677.90, maxZ = 200.00 },
    { name = "Verona Beach", minX = 647.70, minY = -2173.20, minZ = -89.00, maxX = 930.20, maxY = -1804.20, maxZ = 110.90 },
    { name = "Verona Beach", minX = 930.20, minY = -2006.70, minZ = -89.00, maxX = 1073.20, maxY = -1804.20, maxZ = 110.90 },
    { name = "Verona Beach", minX = 851.40, minY = -1804.20, minZ = -89.00, maxX = 1046.10, maxY = -1577.50, maxZ = 110.90 },
    { name = "Verona Beach", minX = 1161.50, minY = -1722.20, minZ = -89.00, maxX = 1323.90, maxY = -1577.50, maxZ = 110.90 },
    { name = "Verona Beach", minX = 1046.10, minY = -1722.20, minZ = -89.00, maxX = 1161.50, maxY = -1577.50, maxZ = 110.90 },
    { name = "Vinewood", minX = 787.40, minY = -1310.20, minZ = -89.00, maxX = 952.60, maxY = -1130.80, maxZ = 110.90 },
    { name = "Vinewood", minX = 787.40, minY = -1130.80, minZ = -89.00, maxX = 952.60, maxY = -954.60, maxZ = 110.90 },
    { name = "Vinewood", minX = 647.50, minY = -1227.20, minZ = -89.00, maxX = 787.40, maxY = -1118.20, maxZ = 110.90 },
    { name = "Vinewood", minX = 647.70, minY = -1416.20, minZ = -89.00, maxX = 787.40, maxY = -1227.20, maxZ = 110.90 },
    { name = "Whitewood Estates", minX = 883.30, minY = 1726.20, minZ = -89.00, maxX = 1098.30, maxY = 2507.20, maxZ = 110.90 },
    { name = "Whitewood Estates", minX = 1098.30, minY = 1726.20, minZ = -89.00, maxX = 1197.30, maxY = 2243.20, maxZ = 110.90 },
    { name = "Willowfield", minX = 1970.60, minY = -2179.20, minZ = -89.00, maxX = 2089.00, maxY = -1852.80, maxZ = 110.90 },
    { name = "Willowfield", minX = 2089.00, minY = -2235.80, minZ = -89.00, maxX = 2201.80, maxY = -1989.90, maxZ = 110.90 },
    { name = "Willowfield", minX = 2089.00, minY = -1989.90, minZ = -89.00, maxX = 2324.00, maxY = -1852.80, maxZ = 110.90 },
    { name = "Willowfield", minX = 2201.80, minY = -2095.00, minZ = -89.00, maxX = 2324.00, maxY = -1989.90, maxZ = 110.90 },
    { name = "Willowfield", minX = 2541.70, minY = -1941.40, minZ = -89.00, maxX = 2703.50, maxY = -1852.80, maxZ = 110.90 },
    { name = "Willowfield", minX = 2324.00, minY = -2059.20, minZ = -89.00, maxX = 2541.70, maxY = -1852.80, maxZ = 110.90 },
    { name = "Willowfield", minX = 2541.70, minY = -2059.20, minZ = -89.00, maxX = 2703.50, maxY = -1941.40, maxZ = 110.90 },
    { name = "Yellow Bell Station", minX = 1377.40, minY = 2600.40, minZ = -21.90, maxX = 1492.40, maxY = 2687.30, maxZ = 78.00 },
    -- Main Zones
    { name = "Los Santos", minX = 44.60, minY = -2892.90, minZ = -242.90, maxX = 2997.00, maxY = -768.00, maxZ = 900.00 },
    { name = "Las Venturas", minX = 869.40, minY = 596.30, minZ = -242.90, maxX = 2997.00, maxY = 2993.80, maxZ = 900.00 },
    { name = "Bone County", minX = -480.50, minY = 596.30, minZ = -242.90, maxX = 869.40, maxY = 2993.80, maxZ = 900.00 },
    { name = "Tierra Robada", minX = -2997.40, minY = 1659.60, minZ = -242.90, maxX = -480.50, maxY = 2993.80, maxZ = 900.00 },
    { name = "Tierra Robada", minX = -1213.90, minY = 596.30, minZ = -242.90, maxX = -480.50, maxY = 1659.60, maxZ = 900.00 },
    { name = "San Fierro", minX = -2997.40, minY = -1115.50, minZ = -242.90, maxX = -1213.90, maxY = 1659.60, maxZ = 900.00 },
    { name = "Red County", minX = -1213.90, minY = -768.00, minZ = -242.90, maxX = 2997.00, maxY = 596.30, maxZ = 900.00 },
    { name = "Flint County", minX = -1213.90, minY = -2892.90, minZ = -242.90, maxX = 44.60, maxY = -768.00, maxZ = 900.00 },
    { name = "Whetstone", minX = -2997.40, minY = -2892.90, minZ = -242.90, maxX = -1213.90, maxY = -1115.50, maxZ = 900.00 },
}

-- Simple spatial cache to avoid scanning the full SA_ZONES table on every call.
local LOCATION_CACHE = LOCATION_CACHE or {}
local LOCATION_CACHE_COUNT = LOCATION_CACHE_COUNT or 0
local CACHE_CELL_SIZE = 50 -- grid cell size in world units (tuneable)
local LOCATION_CACHE_MAX = 20000 -- when exceeded, clear cache to avoid memory blowup

function getLocationName(x, y, z)
    -- Quantize coordinates to a coarse grid cell and use as cache key
    local qx = math.floor((x or 0) / CACHE_CELL_SIZE)
    local qy = math.floor((y or 0) / CACHE_CELL_SIZE)
    local key = qx .. ':' .. qy

    if LOCATION_CACHE[key] then
        return LOCATION_CACHE[key]
    end

    -- First, check the detailed zone table (only when cache miss)
    for _, zone in ipairs(SA_ZONES) do
        if x >= zone.minX and x <= zone.maxX and y >= zone.minY and y <= zone.maxY then
            LOCATION_CACHE[key] = zone.name
            LOCATION_CACHE_COUNT = LOCATION_CACHE_COUNT + 1
            -- simple cache size guard
            if LOCATION_CACHE_COUNT > LOCATION_CACHE_MAX then
                LOCATION_CACHE = {}
                LOCATION_CACHE_COUNT = 0
            end
            return zone.name
        end
    end

    -- Coarse city-level fallback (cached as well)
    local city
    if x >= 0 and x <= 3000 and y >= -3000 and y <= 0 then
        city = "Los Santos"
    elseif x >= -3000 and x <= -1000 and y >= -1000 and y <= 2000 then
        city = "San Fierro"
    elseif x >= 500 and x <= 3000 and y >= 500 and y <= 3000 then
        city = "Las Venturas"
    else
        city = string.format("Coords: %.0f, %.0f", x or 0, y or 0)
    end

    LOCATION_CACHE[key] = city
    LOCATION_CACHE_COUNT = LOCATION_CACHE_COUNT + 1
    if LOCATION_CACHE_COUNT > LOCATION_CACHE_MAX then
        LOCATION_CACHE = {}
        LOCATION_CACHE_COUNT = 0
    end
    return city
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

        local ok, resp_or_err
        if method == 'GET' then
            ok, resp_or_err = pcall(requests.get, url, {headers = headers})
        elseif method == 'POST' then
            ok, resp_or_err = pcall(requests.post, url, {
                headers = headers,
                data = json.encode(data)
            })
        elseif method == 'PUT' then
            ok, resp_or_err = pcall(requests.put, url, {
                headers = headers,
                data = json.encode(data)
            })
        elseif method == 'DELETE' then
            ok, resp_or_err = pcall(requests.delete, url, {headers = headers})
        end

        if not ok then
            -- resp_or_err contains the error message from requests
            logError('HTTP request failed: ' .. tostring(resp_or_err))
            if type(callback) == 'function' then callback({status = 0, error = tostring(resp_or_err)}, nil) end
            return
        end

        local response = resp_or_err

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
        if state.currentUnit then joinSituation(resp.id, 'Code 0') end
        notifySuccess('Panic button activated!')
        playSound('panic')
        notifyError('PANIC! Officer ' .. state.playerNick .. ' in danger at ' .. locationName .. '!')
    end)
end

function joinSituation(situationId, desiredStatus)
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
        -- If a desiredStatus is provided (e.g., 'Code 0' for panic), set it; otherwise default to Code 3
        updateUnitStatus(state.currentUnit.id, desiredStatus or 'Code 3')
        notifySuccess('Joined situation')
    end)
end

-- ============================================================================
-- IMGUI МЕНЮ
-- ============================================================================

local function renderMainWindow()
    -- Проверки на доступность ImGui
    if not imgui_loaded or not ffi_loaded then return end
    if not mainWindow then return end
    
    -- Рендерим только если окно открыто
    if mainWindow[0] then
        imgui.SetNextWindowPos(imgui.ImVec2(50, 50), imgui.Cond.FirstUseEver)
        imgui.SetNextWindowSize(imgui.ImVec2(600, 700), imgui.Cond.FirstUseEver)
        
        imgui.Begin(u8'SAPD Tracker', mainWindow, imgui.WindowFlags.NoCollapse)
        
        -- Информация о текущем статусе
        imgui.TextColored(imgui.ImVec4(0.2, 0.8, 1.0, 1.0), u8('Officer: ' .. (state.playerNick or 'Unknown')))
        imgui.Separator()
        
        -- Секция Unit Management
        if imgui.CollapsingHeader(u8'Unit Management', imgui.TreeNodeFlags.DefaultOpen) then
            if state.currentUnit then
                imgui.TextColored(imgui.ImVec4(0.2, 1.0, 0.2, 1.0), u8('Current Unit: ' .. state.currentUnit.marking))
                imgui.Text(u8('Status: ' .. (state.currentUnit.status or 'Code 5')))
                imgui.Text(u8('Members: ' .. joinOrEmpty(state.currentUnit.playerNicks, ', ')))
                
                imgui.Spacing()
                if imgui.Button(u8'Leave Unit', imgui.ImVec2(200, 30)) then
                    leaveUnit(state.currentUnit.id)
                end
                
                imgui.Spacing()
                imgui.Text(u8'Quick Status Change:')
                if imgui.Button(u8'Code 2', imgui.ImVec2(90, 25)) then cmd_code2() end
                imgui.SameLine()
                if imgui.Button(u8'Code 3', imgui.ImVec2(90, 25)) then cmd_code3() end
                imgui.SameLine()
                if imgui.Button(u8'Code 4', imgui.ImVec2(90, 25)) then cmd_code4() end
                
                if imgui.Button(u8'Code 6', imgui.ImVec2(90, 25)) then cmd_code6() end
                imgui.SameLine()
                if imgui.Button(u8'Code 7', imgui.ImVec2(90, 25)) then cmd_code7() end
            else
                imgui.TextColored(imgui.ImVec4(1.0, 0.5, 0.0, 1.0), u8'Not in a unit')
                imgui.Spacing()
                
                imgui.InputText(u8'Unit Marking', inputBuffer.unitMarking, 64)
                if imgui.Button(u8'Create Unit', imgui.ImVec2(200, 30)) then
                    local marking = u8:decode(ffi.string(inputBuffer.unitMarking))
                    if marking ~= '' then
                        createUnit(marking, {})
                    else
                        notifyError('Enter unit marking!')
                    end
                end
            end
        end
        
        imgui.Spacing()
        imgui.Separator()
        
        -- Секция Situations
        if imgui.CollapsingHeader(u8'Situations', imgui.TreeNodeFlags.DefaultOpen) then
            imgui.InputText(u8'Type (911/code6/traffic/backup)', inputBuffer.situationType, 64)
            if imgui.Button(u8'Create Situation', imgui.ImVec2(200, 30)) then
                local sitType = u8:decode(ffi.string(inputBuffer.situationType))
                if sitType ~= '' then
                    cmd_sit(sitType)
                else
                    notifyError('Enter situation type!')
                end
            end
            
            imgui.Spacing()
            if imgui.Button(u8'PANIC BUTTON', imgui.ImVec2(200, 40)) then
                cmd_panic()
            end
            
            imgui.Spacing()
            imgui.InputInt(u8'TARGET ID', inputBuffer.targetId)
            if imgui.Button(u8'Start Pursuit', imgui.ImVec2(200, 30)) then
                local targetId = inputBuffer.targetId[0]
                if targetId > 0 then
                    cmd_prst(tostring(targetId))
                else
                    notifyError('Enter valid player ID!')
                end
            end
            
            imgui.Spacing()
            if state.isInPanic or state.trackingTarget then
                if imgui.Button(u8'Clear Panic/Pursuit', imgui.ImVec2(200, 30)) then
                    cmd_clear()
                end
            end
        end
        
        imgui.Spacing()
        imgui.Separator()
        
        -- Информация
        if imgui.CollapsingHeader(u8'Info') then
            imgui.Text(u8('AFK Status: ' .. (state.isAFK and 'AFK' or 'Active')))
            local x, y, z = getCharCoordinates(PLAYER_PED)
            local location = getLocationName(x, y, z)
            imgui.Text(u8('Location: ' .. location))
            imgui.Text(u8(string.format('Coords: %.1f, %.1f, %.1f', x, y, z)))
        end
        
        imgui.Spacing()
        if imgui.Button(u8'Close Menu', imgui.ImVec2(120, 28)) then
            mainWindow[0] = false
        end
        
        imgui.End()
    end
end

-- ============================================================================
-- КОМАНДЫ
-- ============================================================================

-- ИСПРАВЛЕННАЯ КОМАНДА /unit
function cmd_unit(param)
    if imgui_loaded and ffi_loaded then
        -- Проверяем инициализацию
        if not mainWindow or not inputBuffer then
            notifyError('ImGui UI initialization failed!')
            logError('cmd_unit: mainWindow or inputBuffer is nil')
            return
        end
        
        -- Переключаем видимость окна
        mainWindow[0] = not mainWindow[0]
        
        if mainWindow[0] then
            notify('SAPD Tracker menu opened')
            logDebug('cmd_unit: menu opened')
        else
            notify('SAPD Tracker menu closed')
            logDebug('cmd_unit: menu closed')
        end
        return
    end
    
    -- Текстовая версия команды (если ImGui недоступен)
    if not param or param == '' then
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
    
    -- Проверяем статус ImGui
    if imgui_loaded and ffi_loaded then
        notify('Tracker started! Use /unit to open menu')
        logDebug('ImGui loaded successfully')
        
        -- Регистрируем функцию рендера
        imgui.OnFrame(
            function() return mainWindow[0] end,
            renderMainWindow
        )
    elseif imgui_loaded and not ffi_loaded then
        notify('Tracker started! ImGui found but FFI is missing')
        notifyWarning('Install LuaJIT or mimgui with FFI support for UI')
        logWarn('ImGui present but ffi not loaded')
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
