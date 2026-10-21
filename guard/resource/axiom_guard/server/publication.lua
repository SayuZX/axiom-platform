-- Server-only native publication metadata; never included in resource files{}.
local resource = GetCurrentResourceName()
local dirty = true
local function snapshot()
    local rows = {}
    for index = 0, GetNumResources() - 1 do
        local name = GetResourceByFindIndex(index)
        if name then
            local row = { name = name, root = GetResourcePath(name), state = GetResourceState(name), metadata = {} }
            for _, key in ipairs({ 'file', 'client_script', 'shared_script', 'server_script' }) do
                local entries = {}
                for offset = 0, GetNumResourceMetadata(name, key) - 1 do
                    entries[#entries + 1] = GetResourceMetadata(name, key, offset)
                end
                if #entries > 0 then row.metadata[key] = entries end
            end
            rows[#rows + 1] = row
        end
    end
    table.sort(rows, function(a, b) return a.name < b.name end)
    local data = json.encode({ version = 1, resources = rows })
    local saved = SaveResourceFile(resource, 'server/data/distribution-metadata.json', data, #data)
    if not saved then print('[axiom_guard] Publication metadata write failed'); return false end
    dirty = false
    return true
end
RegisterCommand('guard_publication', function(source)
    if source ~= 0 then return end
    if snapshot() then print('[axiom_guard] Native resource metadata exported for assembly publication audit.') end
end, true)
AddEventHandler('onServerResourceStart', function() dirty = true end)
AddEventHandler('onResourceStop', function() dirty = true end)
CreateThread(function()
    while true do
        Wait(5000)
        if dirty then snapshot() end
    end
end)
