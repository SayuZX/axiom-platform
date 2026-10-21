AxiomBackend = AxiomBackend or {}
local B = AxiomBackend
local resource = GetCurrentResourceName()
local stores = {}

function B.copy(value)
    if type(value) ~= 'table' then return value end
    local result = {}
    for key, item in pairs(value) do result[key] = B.copy(item) end
    return result
end

function B.equal(left, right)
    if type(left) ~= type(right) then return false end
    if type(left) ~= 'table' then return left == right end
    for key, value in pairs(left) do if not B.equal(value, right[key]) then return false end end
    for key in pairs(right) do if left[key] == nil then return false end end
    return true
end

function B.array(value, maximum)
    if type(value) ~= 'table' then return false end
    local count = 0
    for key in pairs(value) do
        if type(key) ~= 'number' or key % 1 ~= 0 or key < 1 then return false end
        count = count + 1
    end
    return count == #value and count <= maximum
end

function B.text(value, maximum)
    return type(value) == 'string' and #value <= maximum and not value:find('%z') and utf8.len(value) ~= nil
end

function B.stamp() return os.date('!%Y-%m-%dT%H:%M:%S.000Z') end

-- UTC conversion without depending on the host's local timezone or floating-point snowflakes.
function B.epoch(value)
    if type(value) == 'number' then return AxiomRules.finite(value) and value or nil end
    if type(value) ~= 'string' then return nil end
    if not value:match('^%d%d%d%d%-%d%d%-%d%dT%d%d:%d%d:%d%dZ$')
        and not value:match('^%d%d%d%d%-%d%d%-%d%dT%d%d:%d%d:%d%d%.%d+Z$') then return nil end
    local year, month, day, hour, minute, second = value:match('^(%d%d%d%d)%-(%d%d)%-(%d%d)T(%d%d):(%d%d):(%d%d)')
    year, month, day, hour, minute, second = tonumber(year), tonumber(month), tonumber(day), tonumber(hour), tonumber(minute), tonumber(second)
    if not year or month < 1 or month > 12 or day < 1 or day > 31 or hour > 23 or minute > 59 or second > 59 then return nil end
    local daysInMonth = { 31, (year % 4 == 0 and (year % 100 ~= 0 or year % 400 == 0)) and 29 or 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 }
    if day > daysInMonth[month] then return nil end
    year = year - (month <= 2 and 1 or 0)
    local era = math.floor(year / 400)
    local yoe = year - era * 400
    local doy = math.floor((153 * (month + (month > 2 and -3 or 9)) + 2) / 5) + day - 1
    local days = era * 146097 + yoe * 365 + math.floor(yoe / 4) - math.floor(yoe / 100) + doy - 719468
    return days * 86400 + hour * 3600 + minute * 60 + second
end

local function checksum(value)
    local hash = 2166136261
    for index = 1, #value do hash = ((hash ~ value:byte(index)) * 16777619) & 0xffffffff end
    return ('%08x'):format(hash)
end

local function filename(name, slot) return 'server/data/' .. name .. '.' .. slot .. '.json' end
local function validName(name) return type(name) == 'string' and #name <= 40 and name:match('^[a-z][a-z0-9_]*$') end

local function decodeSlot(raw)
    if type(raw) ~= 'string' then return nil end
    local ok, envelope = pcall(json.decode, raw)
    if not ok or type(envelope) ~= 'table' or envelope.version ~= 1
        or not AxiomRules.finite(envelope.generation) or envelope.generation < 1 or envelope.generation % 1 ~= 0
        or type(envelope.payload) ~= 'string' or envelope.checksum ~= checksum(envelope.payload) then return nil end
    local parsed, value = pcall(json.decode, envelope.payload)
    if not parsed or type(value) ~= 'table' then return nil end
    return { generation = envelope.generation, value = value }
end

function B.loadStore(name, fallback)
    if not validName(name) then return B.copy(fallback), false, 'Invalid store name' end
    local best, existed
    for slot = 1, 2 do
        local loaded, raw = pcall(LoadResourceFile, resource, filename(name, slot))
        existed = existed or not loaded or raw ~= nil
        if not loaded then raw = nil end
        local item = decodeSlot(raw)
        if item and (not best or item.generation > best.generation) then item.slot = slot; best = item end
    end
    stores[name] = best and { slot = best.slot, generation = best.generation } or { slot = 2, generation = 0 }
    if best then return best.value, true end
    if existed then
        stores[name].corrupt = true
        stores[name].error = 'Both durable slots are invalid'
        print('[AXIOM BACKEND] ' .. name .. ': both durable slots invalid; restore a backup.')
        return B.copy(fallback), false, stores[name].error
    end
    return B.copy(fallback), false
end

function B.saveStore(name, value)
    if not validName(name) or type(value) ~= 'table' then return nil, 'Invalid store' end
    if not stores[name] then B.loadStore(name, {}) end
    local current = stores[name]
    if current.corrupt then return nil, current.error .. '; restore backup before writing' end
    local slot, generation = current.slot == 1 and 2 or 1, current.generation + 1
    local encoded, payload = pcall(json.encode, value)
    if not encoded then return nil, 'JSON encoding failed' end
    local wrapped, raw = pcall(json.encode, { version = 1, generation = generation, payload = payload, checksum = checksum(payload) })
    if not wrapped then return nil, 'Store encoding failed' end
    local wrote, result = pcall(SaveResourceFile, resource, filename(name, slot), raw, #raw)
    local loaded, readback = pcall(LoadResourceFile, resource, filename(name, slot))
    local checked = loaded and readback == raw and decodeSlot(readback)
    if not wrote or result == false or not checked or checked.generation ~= generation then
        current.error = 'Durable write/readback failed; previous slot retained'
        print('[AXIOM BACKEND] ' .. name .. ': ' .. current.error)
        return nil, current.error
    end
    stores[name] = { slot = slot, generation = generation }
    return true
end

function B.storageStatus() return B.copy(stores) end

local bootstrap
function B.bootstrap()
    if bootstrap then return bootstrap end
    local raw = LoadResourceFile(resource, 'server/bootstrap.json')
    local ok, value = pcall(json.decode, raw or '{}')
    bootstrap = ok and type(value) == 'table' and value or {}
    if raw and not ok then print('[AXIOM BACKEND] Invalid bootstrap JSON; not imported.') end
    return bootstrap
end
