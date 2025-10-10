# Update: Исправлена ошибка с определением зон

## ⚠️ Проблема

Функции `getZoneName()` и `getCityName()` **не существуют** в SA-MP API!

Ошибка:
```
attempt to call global 'getZoneName' (a nil value)
```

## ✅ Решение

Вернули таблицу зон с координатами (40+ основных зон):

### Старый код (НЕ РАБОТАЛ):
```lua
-- ❌ Эти функции не существуют в SA-MP API!
function getLocationName(x, y, z)
    local zoneName = getZoneName(x, y, z)  -- ❌ nil
    local cityName = getCityName(x, y, z)  -- ❌ nil
    -- ...
end
```

### Новый код (РАБОТАЕТ):
```lua
-- Таблица основных зон GTA San Andreas
local SA_ZONES = {
    {name = "Commerce", minX = 1370.0, minY = -1577.6, maxX = 1463.9, maxY = -1384.9},
    {name = "Downtown Los Santos", minX = 1370.0, minY = -1577.6, maxX = 1463.9, maxY = -1200.0},
    {name = "Temple", minX = 1096.5, minY = -1026.3, maxX = 1252.3, maxY = -910.2},
    -- ...еще 40+ зон
}

function getLocationName(x, y, z)
    -- Проверяем по таблице зон
    for _, zone in ipairs(SA_ZONES) do
        if x >= zone.minX and x <= zone.maxX and y >= zone.minY and y <= zone.maxY then
            return zone.name
        end
    end
    
    -- Fallback: определяем город по грубым координатам
    if x >= 0 and x <= 3000 and y >= -3000 and y <= 0 then
        return "Los Santos"
    elseif x >= -3000 and x <= -1000 and y >= -1000 and y <= 2000 then
        return "San Fierro"
    elseif x >= 500 and x <= 3000 and y >= 500 and y <= 3000 then
        return "Las Venturas"
    else
        return string.format("Coords: %.0f, %.0f", x, y)
    end
end
```

## 🎯 Преимущества

1. **Работает** - не падает с ошибками
2. **Покрывает основные зоны** - 40+ районов LS, SF, LV
3. **Fallback система** - если зона неизвестна, показывает город
4. **Нет зависимостей** - не требует внешних функций
5. **Легко расширить** - можно добавить больше зон в таблицу

## 📋 Зоны в таблице

### Los Santos (19 зон)
- Downtown Los Santos, Commerce, Pershing Square
- Temple, Market, Rodeo, Vinewood, Richman
- Mulholland, Ganton, Jefferson, Idlewood
- Glen Park, East Los Santos, Las Colinas
- Verona Beach, Santa Maria Beach, Marina
- Los Santos Airport

### San Fierro (8 зон)
- Downtown San Fierro, Chinatown, Financial
- Calton Heights, Juniper Hill, Doherty
- Ocean Flats, San Fierro Airport

### Las Venturas (8 зон)
- The Strip, Come-A-Lot, Starfish Casino
- Old Venturas Strip, Redsands East, Redsands West
- Julius Thruway, Las Venturas Airport

### Сельская местность (5 зон)
- Red County, Flint County, Whetstone
- Bone County, Tierra Robada

## 🔍 Примеры работы

**В известной зоне (Commerce):**
```lua
getLocationName(1400.0, -1500.0, 13.5)
-- Результат: "Commerce"
```

**В неизвестной зоне LS (fallback):**
```lua
getLocationName(1000.0, -1800.0, 10.0)
-- Результат: "Los Santos"
```

**В сельской местности:**
```lua
getLocationName(-450.0, -1500.0, 10.0)
-- Результат: "Red County"
```

**В совсем неизвестной зоне:**
```lua
getLocationName(9999.0, 9999.0, 0.0)
-- Результат: "Coords: 9999, 9999"
```

## ✅ Результат

Скрипт теперь:
- **Работает без ошибок** ✅
- **Покрывает 40+ основных зон** 
- **Имеет fallback систему** (город → координаты)
- **Не зависит от несуществующих функций**
- **Легко расширяется** (добавить зоны в таблицу)

## 📝 Как добавить больше зон

Просто добавьте в таблицу `SA_ZONES`:
```lua
{name = "Новая Зона", minX = 100.0, minY = 200.0, maxX = 300.0, maxY = 400.0},
```

Координаты можно узнать в игре командой `/save` или через карту редактора.
