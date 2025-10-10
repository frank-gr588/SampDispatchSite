-- NYD Operations Manager v3.0
-- Полноценный интерфейс для управления юнитами, ситуациями и игроками

script_name('NYD Operations Manager')
script_author('NYD Team')
script_version('3.0')

require 'lib.sampfuncs'
require 'lib.moonloader'
local ffi = require 'ffi'
local imgui = require 'mimgui'
local http = require('socket.http')
local ltn12 = require('ltn12')
local encoding = require('encoding')
encoding.default = 'CP1251'
u8 = encoding.UTF8

-- ================== CONFIG ==================
local API_BASE = 'http://127.0.0.1:5000'
local API_KEY = 'changeme-key'
local SEND_INTERVAL_MS = 2000
local STATUS_INTERVAL_MS = 5000
local REFRESH_INTERVAL_MS = 3000
local AUTO_START = true

-- ================== RUNTIME STATE ==================
local enabled = false
local lastStatus = 'Off Duty'
local currentUnit = nil
local currentSituation = nil

-- Кэш данных
local units = {}
local situations = {}
local players = {}
local channels = {}
local lastRefresh = 0

-- ================== ImGui STATE ==================
local main_window = imgui.new.bool(false)
local units_window = imgui.new.bool(false)
local situations_window = imgui.new.bool(false)
local create_unit_window = imgui.new.bool(false)
local create_situation_window = imgui.new.bool(false)

-- Формы создания
local new_unit_marking = imgui.new.char[16]()
local new_situation_type = imgui.new.int(0)
local new_situation_location = imgui.new.char[128]()
local new_situation_title = imgui.new.char[128]()
local situation_types = {'Code7', 'Pursuit', 'TrafficStop', 'Code6', '911', 'Other'}
local situation_types_str = 'Code7\0Pursuit\0TrafficStop\0Code6\0911\0Other\0'

-- Форма добавления игрока по ID
local add_player_id = imgui.new.int(0)
local selected_unit_for_add = nil

-- ================== JSON HELPERS ==================
local function json_escape(s)
	return s:gsub('\\','\\\\'):gsub('"','\\"'):gsub('\n','\\n'):gsub('\r','\\r'):gsub('\t','\\t')
end

local function json_encode(v)
	local t = type(v)
	if t == 'string' then
		return '"' .. json_escape(v) .. '"'
	elseif t == 'number' or t == 'boolean' then
		return tostring(v)
	elseif t == 'table' then
		local isArray = false
		local count = 0
		for k,_ in pairs(v) do
			count = count + 1
			if type(k) ~= 'number' then isArray = false break end
			isArray = true
		end
		if isArray and count > 0 then
			local parts = {}
			for i,val in ipairs(v) do
				parts[#parts+1] = json_encode(val)
			end
			return '[' .. table.concat(parts, ',') .. ']'
		else
			local parts = {}
			for k,val in pairs(v) do
				parts[#parts+1] = '"' .. json_escape(tostring(k)) .. '":' .. json_encode(val)
			end
			return '{' .. table.concat(parts, ',') .. '}'
		end
	else
		return 'null'
	end
end

-- Простой JSON декодер
local function json_decode(str)
	if not str or str == '' then return nil end
	local f = loadstring('return ' .. str:gsub('null', 'nil'):gsub('true', 'true'):gsub('false', 'false'))
	if f then
		local ok, result = pcall(f)
		if ok then return result end
	end
	return nil
end

-- ================== HTTP HELPERS ==================
local function http_request(method, path, body_tbl)
	local headers = { ['Content-Type'] = 'application/json' }
	if API_KEY ~= '' then headers['x-api-key'] = API_KEY end
	
	local response_body = {}
	local opts = {
		url = API_BASE .. path,
		method = method,
		headers = headers,
		sink = ltn12.sink.table(response_body)
	}
	
	if body_tbl then
		local body = json_encode(body_tbl)
		headers['Content-Length'] = tostring(#body)
		opts.source = ltn12.source.string(body)
	end
	
	local _, code = http.request(opts)
	local response = table.concat(response_body)
	return code or 0, response
end

local function http_get(path)
	return http_request('GET', path, nil)
end

local function http_post(path, body)
	return http_request('POST', path, body)
end

local function http_delete(path)
	return http_request('DELETE', path, nil)
end

local function http_put(path, body)
	return http_request('PUT', path, body)
end

-- ================== GAME HELPERS ==================
local function get_nickname()
	local ok, id = sampGetPlayerIdByCharHandle(PLAYER_PED)
	if ok then return sampGetPlayerNickname(id) end
	return 'unknown'
end

local function send_coords()
	if not doesCharExist(PLAYER_PED) then return end
	local result, x, y, z = pcall(getCharCoordinates, PLAYER_PED)
	if not result then return end
	
	local nick = get_nickname()
	if nick == 'unknown' then return end
	
	pcall(http_post, '/api/coords', { Nick = nick, X = x, Y = y })
end

local function compute_status()
	if isCharInAnyCar(PLAYER_PED) then return 'On Patrol' end
	return 'Available'
end

local function send_status_if_changed()
	local s = compute_status()
	if s ~= lastStatus then
		lastStatus = s
		http_post('/api/coords/status', { Nick = get_nickname(), Status = lastStatus })
	end
end

local function msg(text, color)
	sampAddChatMessage('[NYD] ' .. text, color or 0x1E90FF)
end

-- ================== DATA REFRESH ==================
local function refresh_data()
	-- Загрузка юнитов
	local code, response = http_get('/api/units')
	if code == 200 and response ~= '' then
		local data = json_decode(response)
		if data then units = data end
	end
	
	-- Загрузка ситуаций
	code, response = http_get('/api/situations/all')
	if code == 200 and response ~= '' then
		local data = json_decode(response)
		if data then situations = data end
	end
	
	-- Загрузка игроков
	code, response = http_get('/api/players')
	if code == 200 and response ~= '' then
		local data = json_decode(response)
		if data then players = data end
	end
	
	-- Загрузка каналов
	code, response = http_get('/api/channels/all')
	if code == 200 and response ~= '' then
		local data = json_decode(response)
		if data then channels = data end
	end
	
	-- Определение текущего юнита
	local nick = get_nickname()
	currentUnit = nil
	for _, unit in ipairs(units) do
		if unit.playerNicks then
			for _, pnick in ipairs(unit.playerNicks) do
				if pnick:lower() == nick:lower() then
					currentUnit = unit
					break
				end
			end
		end
		if currentUnit then break end
	end
	
	-- Определение текущей ситуации
	currentSituation = nil
	if currentUnit and currentUnit.situationId then
		for _, sit in ipairs(situations) do
			if sit.id == currentUnit.situationId then
				currentSituation = sit
				break
			end
		end
	end
end

-- ================== UNIT OPERATIONS ==================
local function create_unit(marking)
	local myNick = get_nickname()
	local code, response = http_post('/api/units', { 
		Marking = marking,
		PlayerNicks = {myNick},
		IsLeadUnit = false
	})
	if code == 201 or code == 200 then
		msg('Unit ' .. marking .. ' created!', 0x99FF99)
		refresh_data()
		return true
	else
		msg('Failed to create unit: ' .. tostring(code), 0xFF6666)
		if response and response ~= '' then
			msg('Response: ' .. response, 0xFF6666)
		end
		return false
	end
end

local function delete_unit(unitId)
	local code = http_delete('/api/units/' .. unitId)
	if code == 200 or code == 204 then
		msg('Unit deleted', 0x99FF99)
		refresh_data()
		return true
	else
		msg('Failed to delete unit', 0xFF6666)
		return false
	end
end

local function join_unit(unitId)
	local code = http_post('/api/units/' .. unitId .. '/players/add', { PlayerNick = get_nickname() })
	if code == 200 then
		msg('Joined unit!', 0x99FF99)
		refresh_data()
		return true
	else
		msg('Failed to join unit', 0xFF6666)
		return false
	end
end

-- Добавить игрока в юнит по SA-MP ID
local function add_player_to_unit_by_id(unitId, playerId)
	if not sampIsPlayerConnected(playerId) then
		msg('Player ID ' .. playerId .. ' is not connected', 0xFF6666)
		return false
	end
	
	local playerNick = sampGetPlayerNickname(playerId)
	if not playerNick or playerNick == '' then
		msg('Failed to get nickname for ID ' .. playerId, 0xFF6666)
		return false
	end
	
	local code = http_post('/api/units/' .. unitId .. '/players/add', { PlayerNick = playerNick })
	if code == 200 then
		msg('Added ' .. playerNick .. ' (ID: ' .. playerId .. ') to unit', 0x99FF99)
		refresh_data()
		return true
	else
		msg('Failed to add player to unit', 0xFF6666)
		return false
	end
end

local function leave_unit(unitId)
	local code = http_post('/api/units/' .. unitId .. '/players/remove', { PlayerNick = get_nickname() })
	if code == 200 then
		msg('Left unit', 0xFFCC66)
		refresh_data()
		return true
	else
		msg('Failed to leave unit', 0xFF6666)
		return false
	end
end

local function set_unit_status(unitId, status)
	local code = http_post('/api/units/' .. unitId .. '/status', { Status = status })
	if code == 200 then
		msg('Status updated: ' .. status, 0x99FF99)
		refresh_data()
		return true
	else
		msg('Failed to update status', 0xFF6666)
		return false
	end
end

-- ================== SITUATION OPERATIONS ==================
local function create_situation(sitType, location, title)
	local metadata = {
		location = location or '',
		title = title or ''
	}
	local code, response = http_post('/api/situations/create', { Type = sitType, Metadata = metadata })
	if code == 201 or code == 200 then
		msg('Situation created: ' .. sitType, 0x99FF99)
		refresh_data()
		return true
	else
		msg('Failed to create situation: ' .. tostring(code), 0xFF6666)
		if response and response ~= '' then
			msg('Response: ' .. response, 0xFF6666)
		end
		return false
	end
end

local function join_situation(situationId)
	local nick = get_nickname()
	local code, response = http_post('/api/situations/' .. situationId .. '/join', { Nick = nick })
	if code == 200 then
		msg('Joined situation', 0x99FF99)
		refresh_data()
		return true
	else
		msg('Failed to join situation: ' .. tostring(code), 0xFF6666)
		return false
	end
end

local function leave_situation(situationId)
	local nick = get_nickname()
	local code, response = http_post('/api/situations/' .. situationId .. '/leave', { Nick = nick })
	if code == 200 then
		msg('Left situation', 0xFFCC66)
		refresh_data()
		return true
	else
		msg('Failed to leave situation: ' .. tostring(code), 0xFF6666)
		return false
	end
end

local function close_situation(situationId)
	local code, response = http_post('/api/situations/' .. situationId .. '/close', {})
	if code == 200 then
		msg('Situation closed', 0x99FF99)
		refresh_data()
		return true
	else
		msg('Failed to close situation: ' .. tostring(code), 0xFF6666)
		return false
	end
end

local function attach_unit_to_situation(unitId, situationId)
	local code, response = http_post('/api/units/' .. unitId .. '/attach-situation', { SituationId = situationId })
	if code == 200 then
		msg('Unit attached to situation', 0x99FF99)
		refresh_data()
		return true
	else
		msg('Failed to attach unit: ' .. tostring(code), 0xFF6666)
		return false
	end
end

-- ================== ImGui WINDOWS ==================
local function draw_main_window()
	imgui.SetNextWindowSize(imgui.ImVec2(400, 500), imgui.Cond.FirstUseEver)
	imgui.Begin(u8'NYD Operations Manager', main_window, imgui.WindowFlags.NoCollapse)
	
	-- Информация о игроке
	imgui.TextColored(imgui.ImVec4(0.3, 0.8, 1.0, 1.0), u8'Player: ' .. get_nickname())
	imgui.Separator()
	
	-- Статус трекинга
	if enabled then
		imgui.TextColored(imgui.ImVec4(0.2, 1.0, 0.2, 1.0), u8'Tracking: ACTIVE')
		if imgui.Button(u8'Stop Tracking', imgui.ImVec2(180, 30)) then
			enabled = false
			msg('Tracking stopped', 0xFFCC66)
		end
	else
		imgui.TextColored(imgui.ImVec4(1.0, 0.3, 0.3, 1.0), u8'Tracking: INACTIVE')
		if imgui.Button(u8'Start Tracking', imgui.ImVec2(180, 30)) then
			enabled = true
			msg('Tracking started', 0x99FF99)
		end
	end
	
	imgui.Separator()
	
	-- Текущий юнит
	imgui.TextColored(imgui.ImVec4(1.0, 0.8, 0.2, 1.0), u8'Current Unit:')
	if currentUnit then
		imgui.Text(u8'Marking: ' .. (currentUnit.marking or 'N/A'))
		imgui.Text(u8'Status: ' .. (currentUnit.status or 'N/A'))
		imgui.Text(u8'Players: ' .. (currentUnit.playerCount or 0))
		if imgui.Button(u8'Leave Unit', imgui.ImVec2(150, 25)) then
			leave_unit(currentUnit.id)
		end
	else
		imgui.TextDisabled(u8'Not in unit')
	end
	
	imgui.Separator()
	
	-- Текущая ситуация
	imgui.TextColored(imgui.ImVec4(1.0, 0.3, 0.3, 1.0), u8'Current Situation:')
	if currentSituation then
		imgui.Text(u8'Type: ' .. (currentSituation.type or 'N/A'))
		local loc = currentSituation.metadata and currentSituation.metadata.location or 'N/A'
		imgui.Text(u8'Location: ' .. loc)
		if imgui.Button(u8'Leave Situation', imgui.ImVec2(150, 25)) then
			leave_situation(currentSituation.id)
		end
	else
		imgui.TextDisabled(u8'Not in situation')
	end
	
	imgui.Separator()
	
	-- Главное меню
	imgui.TextColored(imgui.ImVec4(0.8, 0.8, 0.8, 1.0), u8'Quick Actions:')
	
	if imgui.Button(u8'Units Manager', imgui.ImVec2(-1, 30)) then
		units_window[0] = not units_window[0]
	end
	
	if imgui.Button(u8'Situations Manager', imgui.ImVec2(-1, 30)) then
		situations_window[0] = not situations_window[0]
	end
	
	if imgui.Button(u8'Refresh Data', imgui.ImVec2(-1, 30)) then
		refresh_data()
		msg('Data refreshed', 0x99FF99)
	end
	
	imgui.Separator()
	imgui.TextDisabled(u8'Units: ' .. #units .. ' | Situations: ' .. #situations .. ' | Players: ' .. #players)
	
	imgui.End()
end

local function draw_units_window()
	imgui.SetNextWindowSize(imgui.ImVec2(600, 450), imgui.Cond.FirstUseEver)
	imgui.Begin(u8'Units Manager', units_window)
	
	if imgui.Button(u8'Create New Unit', imgui.ImVec2(150, 25)) then
		create_unit_window[0] = true
	end
	
	imgui.SameLine()
	if imgui.Button(u8'Refresh', imgui.ImVec2(100, 25)) then
		refresh_data()
	end
	
	imgui.Separator()
	
	-- Список юнитов
	for i, unit in ipairs(units) do
		local marking = unit.marking or 'N/A'
		local status = unit.status or 'Available'
		local playerCount = unit.playerCount or 0
		
		imgui.PushID(i)
		
		if imgui.CollapsingHeader(u8(marking .. ' [' .. status .. '] (' .. playerCount .. ' players)')) then
			imgui.Indent(20)
			
			imgui.Text(u8'ID: ' .. (unit.id or 'N/A'))
			imgui.Text(u8'Status: ' .. status)
			imgui.Text(u8'Players: ' .. playerCount)
			
			if unit.situationId then
				imgui.TextColored(imgui.ImVec4(1, 0.3, 0.3, 1), u8'On Situation: ' .. unit.situationId)
			end
			
			if unit.tacticalChannelId then
				imgui.TextColored(imgui.ImVec4(0.3, 0.8, 1, 1), u8'Channel: ' .. unit.tacticalChannelId)
			end
			
			imgui.Spacing()
			imgui.Separator()
			imgui.Spacing()
			
			-- Кнопки управления юнитом
			if imgui.Button(u8'Join (Me)##' .. i, imgui.ImVec2(80, 20)) then
				join_unit(unit.id)
			end
			
			imgui.SameLine()
			if imgui.Button(u8'Delete##' .. i, imgui.ImVec2(80, 20)) then
				delete_unit(unit.id)
			end
			
			imgui.Spacing()
			
			-- Добавление игрока по ID
			imgui.Text(u8'Add player by ID:')
			imgui.PushItemWidth(100)
			imgui.InputInt(u8'##playerid' .. i, add_player_id)
			imgui.PopItemWidth()
			imgui.SameLine()
			if imgui.Button(u8'Add Player##' .. i, imgui.ImVec2(100, 20)) then
				add_player_to_unit_by_id(unit.id, add_player_id[0])
				add_player_id[0] = 0  -- Reset after adding
			end
			
			imgui.Unindent(20)
		end
		
		imgui.PopID()
	end
	
	imgui.End()
end

local function draw_situations_window()
	imgui.SetNextWindowSize(imgui.ImVec2(600, 450), imgui.Cond.FirstUseEver)
	imgui.Begin(u8'Situations Manager', situations_window)
	
	if imgui.Button(u8'Create New Situation', imgui.ImVec2(170, 25)) then
		create_situation_window[0] = true
	end
	
	imgui.SameLine()
	if imgui.Button(u8'Refresh', imgui.ImVec2(100, 25)) then
		refresh_data()
	end
	
	imgui.Separator()
	
	-- Список ситуаций
	for i, sit in ipairs(situations) do
		local sitType = sit.type or 'Unknown'
		local isActive = sit.isActive and 'ACTIVE' or 'CLOSED'
		local unitsCount = sit.units and #sit.units or 0
		
		imgui.PushID(i)
		
		local color = sit.isActive and imgui.ImVec4(0.2, 1, 0.2, 1) or imgui.ImVec4(0.6, 0.6, 0.6, 1)
		imgui.TextColored(color, u8(sitType .. ' [' .. isActive .. '] (' .. unitsCount .. ' units)'))
		
		imgui.Indent(20)
		
		if sit.metadata then
			if sit.metadata.title and sit.metadata.title ~= '' then
				imgui.Text(u8'Title: ' .. sit.metadata.title)
			end
			if sit.metadata.location and sit.metadata.location ~= '' then
				imgui.Text(u8'Location: ' .. sit.metadata.location)
			end
		end
		
		imgui.Text(u8'ID: ' .. (sit.id or 'N/A'))
		
		imgui.Spacing()
		
		if sit.isActive then
			if imgui.Button(u8'Join##' .. i, imgui.ImVec2(80, 20)) then
				join_situation(sit.id)
			end
			imgui.SameLine()
			if imgui.Button(u8'Close##' .. i, imgui.ImVec2(80, 20)) then
				close_situation(sit.id)
			end
		end
		
		if currentUnit then
			imgui.SameLine()
			if imgui.Button(u8'Attach Unit##' .. i, imgui.ImVec2(100, 20)) then
				attach_unit_to_situation(currentUnit.id, sit.id)
			end
		end
		
		imgui.Unindent(20)
		imgui.Separator()
		
		imgui.PopID()
	end
	
	imgui.End()
end

local function draw_create_unit_window()
	imgui.SetNextWindowSize(imgui.ImVec2(350, 150), imgui.Cond.FirstUseEver)
	imgui.Begin(u8'Create Unit', create_unit_window, imgui.WindowFlags.NoResize)
	
	imgui.Text(u8'Enter unit marking (max 8 chars):')
	imgui.InputText('##marking', new_unit_marking, 16)
	
	imgui.Spacing()
	
	if imgui.Button(u8'Create', imgui.ImVec2(100, 30)) then
		local marking = u8:decode(ffi.string(new_unit_marking))
		if marking ~= '' and #marking <= 8 then
			if create_unit(marking) then
				create_unit_window[0] = false
				new_unit_marking = imgui.new.char[16]()
			end
		else
			msg('Invalid marking', 0xFF6666)
		end
	end
	
	imgui.SameLine()
	if imgui.Button(u8'Cancel', imgui.ImVec2(100, 30)) then
		create_unit_window[0] = false
		new_unit_marking = imgui.new.char[16]()
	end
	
	imgui.End()
end

local function draw_create_situation_window()
	imgui.SetNextWindowSize(imgui.ImVec2(400, 300), imgui.Cond.FirstUseEver)
	imgui.Begin(u8'Create Situation', create_situation_window, imgui.WindowFlags.NoResize)
	
	imgui.Text(u8'Situation Type:')
	
	-- Используем RadioButton вместо Combo для простоты
	for i, sitType in ipairs(situation_types) do
		if imgui.RadioButton(u8(sitType), new_situation_type, i - 1) then
			new_situation_type[0] = i - 1
		end
		if i % 2 == 0 and i < #situation_types then
			imgui.SameLine()
		end
	end
	
	imgui.Spacing()
	imgui.Separator()
	imgui.Spacing()
	
	imgui.Text(u8'Location:')
	imgui.InputText('##location', new_situation_location, 128)
	
	imgui.Spacing()
	
	imgui.Text(u8'Title (optional):')
	imgui.InputText('##title', new_situation_title, 128)
	
	imgui.Spacing()
	imgui.Separator()
	imgui.Spacing()
	
	if imgui.Button(u8'Create', imgui.ImVec2(120, 30)) then
		local sitType = situation_types[new_situation_type[0] + 1]
		local location = u8:decode(ffi.string(new_situation_location))
		local title = u8:decode(ffi.string(new_situation_title))
		
		if sitType and location ~= '' then
			if create_situation(sitType, location, title) then
				create_situation_window[0] = false
				new_situation_type[0] = 0
				new_situation_location = imgui.new.char[128]()
				new_situation_title = imgui.new.char[128]()
			end
		else
			msg('Please select type and enter location', 0xFF6666)
		end
	end
	
	imgui.SameLine()
	if imgui.Button(u8'Cancel', imgui.ImVec2(120, 30)) then
		create_situation_window[0] = false
		new_situation_type[0] = 0
		new_situation_location = imgui.new.char[128]()
		new_situation_title = imgui.new.char[128]()
	end
	
	imgui.End()
end

-- ================== MAIN LOOP ==================
imgui.OnFrame(
	function() return main_window[0] end,
	function(player)
		local ok, err = pcall(draw_main_window)
		if not ok then
			sampAddChatMessage('[NYD] Error in main window: ' .. tostring(err), 0xFF6666)
			main_window[0] = false
		end
	end
)

imgui.OnFrame(
	function() return units_window[0] end,
	function(player)
		local ok, err = pcall(draw_units_window)
		if not ok then
			sampAddChatMessage('[NYD] Error in units window: ' .. tostring(err), 0xFF6666)
			units_window[0] = false
		end
	end
)

imgui.OnFrame(
	function() return situations_window[0] end,
	function(player)
		local ok, err = pcall(draw_situations_window)
		if not ok then
			sampAddChatMessage('[NYD] Error in situations window: ' .. tostring(err), 0xFF6666)
			situations_window[0] = false
		end
	end
)

imgui.OnFrame(
	function() return create_unit_window[0] end,
	function(player)
		local ok, err = pcall(draw_create_unit_window)
		if not ok then
			sampAddChatMessage('[NYD] Error in create unit window: ' .. tostring(err), 0xFF6666)
			create_unit_window[0] = false
		end
	end
)

imgui.OnFrame(
	function() return create_situation_window[0] end,
	function(player)
		local ok, err = pcall(draw_create_situation_window)
		if not ok then
			sampAddChatMessage('[NYD] Error in create situation window: ' .. tostring(err), 0xFF6666)
			create_situation_window[0] = false
		end
	end
)

function main()
	while not isSampAvailable() do wait(100) end
	
	msg('NYD Operations Manager v3.0 loaded!', 0x99FF99)
	msg('Press /nyd to open menu', 0x1E90FF)
	
	-- Команды
	sampRegisterChatCommand('nyd', function()
		main_window[0] = not main_window[0]
	end)
	
	sampRegisterChatCommand('units', function()
		units_window[0] = not units_window[0]
	end)
	
	sampRegisterChatCommand('sits', function()
		situations_window[0] = not situations_window[0]
	end)
	
	sampRegisterChatCommand('createunit', function(arg)
		if arg and arg ~= '' and #arg <= 8 then
			create_unit(arg)
		else
			msg('Usage: /createunit <marking>', 0xFFCC66)
		end
	end)
	
	sampRegisterChatCommand('joinsit', function(arg)
		if arg and arg ~= '' then
			join_situation(arg)
		else
			msg('Usage: /joinsit <situationId>', 0xFFCC66)
		end
	end)
	
	sampRegisterChatCommand('addplayer', function(arg)
		-- /addplayer <unitId> <playerId>
		local unitId, playerId = arg:match('([^%s]+)%s+(%d+)')
		if unitId and playerId then
			add_player_to_unit_by_id(unitId, tonumber(playerId))
		else
			msg('Usage: /addplayer <unitId> <playerId>', 0xFFCC66)
		end
	end)
	
	sampRegisterChatCommand('refresh', function()
		refresh_data()
		msg('Data refreshed', 0x99FF99)
	end)
	
	-- Автостарт
	if AUTO_START then
		enabled = true
		msg('Auto-tracking enabled', 0x99FF99)
	end
	
	-- Начальная загрузка данных
	refresh_data()
	
	-- Основной цикл
	local t1, t2, t3 = 0, 0, 0
	while true do
		pcall(function()
			local now = os.clock() * 1000
			
			-- Отправка координат
			if enabled and (now - t1) >= SEND_INTERVAL_MS then
				send_coords()
				t1 = now
			end
			
			-- Отправка статуса
			if enabled and (now - t2) >= STATUS_INTERVAL_MS then
				send_status_if_changed()
				t2 = now
			end
			
			-- Обновление данных
			if (now - t3) >= REFRESH_INTERVAL_MS then
				refresh_data()
				t3 = now
			end
		end)
		
		wait(50)
	end
end
