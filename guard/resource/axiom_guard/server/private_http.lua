-- Resource HTTP never serves server source, configuration, logs or credentials.
SetHttpHandler(function(_, response)
    response.writeHead(403, { ['Content-Type'] = 'text/plain; charset=utf-8', ['Cache-Control'] = 'no-store' })
    response.send('YAHA KAMU KENA PRENK')
end)
