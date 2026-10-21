local ready, opened, pending = false, false, nil

local function releaseFocus()
    SetNuiFocus(false, false)
    SetNuiFocusKeepInput(false)
end

local function closeDashboard()
    pending, opened = nil, false
    releaseFocus()
    SendNUIMessage({ action = 'axiom_guard:close' })
end

local function openPending()
    if not ready or not pending or opened then return end
    local opening = pending
    pending = nil
    if GetGameTimer() - opening.received >= 30000 then return end
    opened = true
    SetNuiFocus(true, true)
    SetNuiFocusKeepInput(false)
    SendNUIMessage({ action = 'axiom_guard:open', url = opening.url, ticket = opening.ticket })
end

local function validUrl(value)
    if type(value) ~= 'string' or #value > 2048 then return false end
    local authority, path = value:match('^https://([^/]+)(/.*)$')
    if not authority then authority = value:match('^https://([^/]+)$'); path = '/' end
    if not authority then return false end
    local host, port = authority:match('^([%w%.%-]+):(%d+)$')
    host = host or authority
    if port and (tonumber(port) < 1 or tonumber(port) > 65535) then return false end
    if #host > 253 or not host:match('^[%w%.%-]+$') or host:find('..', 1, true) then return false end
    if host:sub(1, 1) == '.' or host:sub(-1) == '.' then return false end
    for label in host:gmatch('[^.]+') do
        if #label > 63 or not label:match('^[%w]') or not label:match('[%w]$') then return false end
    end
    if not path:match('^/[%w%._~/%-]*$') or path:find('//', 1, true) then return false end
    for segment in path:gmatch('[^/]+') do if segment == '.' or segment == '..' then return false end end
    return true
end

RegisterNetEvent('axiom_guard:dashboardOpen', function(url, ticket)
    -- Only the server command may open this UI; local TriggerEvent is not authority.
    if source ~= 65535 or not validUrl(url) or type(ticket) ~= 'string' or #ticket ~= 43 or not ticket:match('^[%w_-]+$') then return end
    if opened then return end
    local opening = { url = url, ticket = ticket, received = GetGameTimer() }
    pending = opening
    SetTimeout(30000, function() if pending == opening then pending = nil end end)
    openPending()
end)

RegisterNUICallback('dashboardReady', function(_, cb)
    ready = true
    cb({ ok = true })
    openPending()
end)

RegisterNUICallback('dashboardClose', function(_, cb)
    closeDashboard()
    cb({ ok = true })
end)

AddEventHandler('onClientResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    closeDashboard()
    ready = false
end)

releaseFocus()
