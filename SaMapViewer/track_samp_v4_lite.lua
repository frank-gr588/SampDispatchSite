-- ============================================================================
-- SA-MP Police Tracking System v4.0 - LITE VERSION (для тестирования)
-- ============================================================================

script_name('SAPD Tracker v4 Lite')
script_version('4.0.0-lite')

require 'lib.moonloader'
local requests = require 'requests'
local json = require 'dkjson'

-- ============================================================================
-- КОНФИГУРАЦИЯ
-- ============================================================================

local CONFIG = {
    API_URL = 'http://localhost:5000/api',
    API_KEY = 'changeme-key',
    UPDATE_INTERVAL = 5000,
    AFK_CHECK_INTERVAL = 30000,
    AFK_THRESHOLD = 300,
    LOCATION_UPDATE_INTERVAL = 3000,
}

-- ============================================================================
-- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
-- ============================================================================

local state = {
    playerNick = nil,
    lastPosition = {x = 0, y = 0, z = 0},
    lastActivity = os.clock(),
    isAFK = false,
    currentUnit = nil,
    currentSituation = nil,
    trackingTarget = nil,
    isInPanic = false,
}

local timers = {
    lastUpdate = 0,
    lastAFKCheck = 0,
    lastLocationUpdate = 0,
}

-- ============================================================================
-- УТИЛИТЫ
-- ============================================================================

function log(message)
    print('[SAPD Tracker] ' .. tostring(message))
end

function notify(message)
    sampAddChatMessage('[SAPD Tracker] {FFFFFF}' .. message, 0x3498DB)
end

function notifyError(message)
    sampAddChatMessage('[SAPD Tracker] {FF0000}' .. message, 0xFF0000)
end

function notifySuccess(message)
    sampAddChatMessage('[SAPD Tracker] {00FF00}' .. message, 0x00FF00)
end

function notifyWarning(message)
    sampAddChatMessage('[SAPD Tracker] {FFAA00}' .. message, 0xFFAA00)
end

-- ============================================================================
-- LOCATION
-- ============================================================================

function getLocationName(x, y)
    -- Упрощённая версия - просто координаты
    return string.format('%.0f, %.0f', x, y)
end

-- ============================================================================
-- API
-- ============================================================================

function sendCoordinates()
    if not state.playerNick then return end
    
    local result, id = sampGetPlayerIdByCharHandle(PLAYER_PED)
    if not result then return end
    
    local x, y, z = getCharCoordinates(PLAYER_PED)
    
    lua_thread.create(function()
        local response = requests.post(CONFIG.API_URL .. '/coords', {
            headers = {
                ['Content-Type'] = 'application/json',
                ['X-API-Key'] = CONFIG.API_KEY
            },
            data = json.encode({
                nick = state.playerNick,
                x = x,
                y = y,
                isAFK = state.isAFK
            })
        })
        
        if response and response.status_code == 200 then
            log('Coordinates sent')
        end
    end)
end

-- ============================================================================
-- AFK CHECK
-- ============================================================================

function hasPlayerMoved()
    if not isSampAvailable() or not isSampfuncsLoaded() then return false end
    
    local result, id = sampGetPlayerIdByCharHandle(PLAYER_PED)
    if not result then return false end
    
    local x, y, z = getCharCoordinates(PLAYER_PED)
    local distance = getDistanceBetweenCoords3d(
        x, y, z,
        state.lastPosition.x, state.lastPosition.y, state.lastPosition.z
    )
    
    if distance > 5.0 then
        state.lastPosition = {x = x, y = y, z = z}
        state.lastActivity = os.clock()
        if state.isAFK then
            state.isAFK = false
            notify('You are no longer AFK')
        end
        return true
    end
    
    return false
end

-- ============================================================================
-- КОМАНДЫ
-- ============================================================================

function cmd_test()
    notify('Tracker is working! Player: ' .. (state.playerNick or 'Unknown'))
    notify('Position: ' .. getLocationName(state.lastPosition.x, state.lastPosition.y))
end

-- ============================================================================
-- ГЛАВНЫЙ ЦИКЛ
-- ============================================================================

function main()
    if not isSampLoaded() or not isSampfuncsLoaded() then return end
    while not isSampAvailable() do wait(100) end
    
    -- Получаем ник игрока
    state.playerNick = sampGetPlayerNickname(select(2, sampGetPlayerIdByCharHandle(PLAYER_PED)))
    log('Initializing for player: ' .. state.playerNick)
    
    -- Регистрируем команды
    sampRegisterChatCommand('test', cmd_test)
    
    notify('Tracker LITE started! Use /test to check')
    
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
            
            if not state.isAFK and (os.clock() - state.lastActivity) >= CONFIG.AFK_THRESHOLD then
                state.isAFK = true
                notifyWarning('You are marked as AFK (no activity for 5 minutes)')
            end
            
            timers.lastAFKCheck = currentTime
        end
    end
end
