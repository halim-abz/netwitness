--[[
    Parser Name    : ssh_over_webproxy
    Description    : Detects SSH connections over HTTP Web Proxy sessions.
                     This can be used by threat actors to create tunnels over the allowed proxy sessions.
 
    Detection logic:
        1. Session contains a CONNECT action
        2. Session contains the SSH header
 
    Registered meta : boc (text)
    Version         : 1.0
--]]

local sshProxy = nw.createParser("ssh_over_webproxy", "Detects SSH Over Web Proxy")

-- Declare meta keys.
sshProxy:setKeys({
  nwlanguagekey.create("boc"),
})

-- Per-session variable. Variables are reset at OnSessionBegin.
local isConnect = false
local isSSH = false
local ruleTriggered = false

local function resetState()
	isConnect = false
	isSSH = false
	ruleTriggered = false
end

-- Evaluates if the indicators are seen in the session.
local function evaluate()
	
	if ruleTriggered then return end			-- If rule already triggered, stop here

    if isSSH == true and isConnect == true then
        nw.createMeta(sshProxy.keys.boc, "ssh over web proxy")
        ruleTriggered = true
    end
end

-- Set variables to true if related indicator has been seen.
local function markSSH()
	isSSH = true
	evaluate()
end

local function markConnect()
	isConnect = true
	evaluate()
end

-- declare what tokens we want to match
sshProxy:setCallbacks({

    -- Session lifecycle: reset per-session state on new stream
    [nwevents.OnSessionBegin] = resetState,

    ["^CONNECT "]  = markConnect,
    ["^SSH-"]      = markSSH,

})
