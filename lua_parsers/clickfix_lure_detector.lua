--[[
    Parser Name    : clickfixlure
    Description    : Detects ClickFix social engineering lure pages in HTTP response bodies.
                     ClickFix tricks victims into opening Windows Run (Win+R) / PowerShell /
                     Terminal and pasting an attacker-supplied command, typically masquerading
                     as a CAPTCHA, Cloudflare check, DNS error, or "fix your browser" prompt.
 
    Detection logic:
        Fires when an HTTP response contains two or more independent indicators from:
          1. Run-dialog / keyboard instructions (Win+R, Ctrl+V, "open the Run dialog")
          2. Clipboard JavaScript (navigator.clipboard.writeText, execCommand('copy'))
          3. Staged payloads (powershell -w hidden, mshta http, IEX(New-Object, etc.)
		  4. Whitelists common O365 domains that trigger similar behavior when accessed from web
 
    Registered meta : ioc (text)
    Version         : 2.0
--]]

local ClickFixLure = nw.createParser("clickfixlure", "Detects ClickFix social engineering lures in HTTP responses")

--[[
    Declare meta keys.
--]]
ClickFixLure:setKeys({
  nwlanguagekey.create("ioc"),
})

--[[
    Per-session variable. Variables are reset at OnSessionBegin.
--]]
local isWhitelist = false
local isRun = false
local isClipboard = false
local isPayload = false
local ruleTriggered = false

local function resetState()
	isWhitelist = false
	isRun = false
	isClipboard = false
	isPayload = false
	ruleTriggered = false
end

--[[
    Evaluates if at least 2 indicators related to ClickFix Lure pages are seen in the session.
--]]
local function evaluate()
	
	if ruleTriggered then return end			-- If rule already triggered, stop here

	local count = 0
    if isRun		then count = count + 1 end
    if isClipboard	then count = count + 1 end
    if isPayload	then count = count + 1 end

    if count >= 2 and isWhitelist == false then
        nw.createMeta(ClickFixLure.keys.ioc, "clickfix lure")
        ruleTriggered = true
    end
end

--[[
    Set variables to true if related indicator has been seen.
--]]

-- Checks if the host value contains a whitelisted domain
local function checkWhitelist(token, first, last)
	current_position = last + 1			-- set position to byte after the token
	local payload = nw.getPayload()		-- get the payload
	local end_of_line = payload:find("\13", current_position, current_position + 100)	-- find the end of the line
	if end_of_line ~= nil then			-- if we found the end of the line
		end_of_line = end_of_line - 1	-- we don't want to read the \13
		local extracted_string = payload:tostring(current_position, end_of_line)	-- read up to the end of the line
		if extracted_string:find("%.sharepoint.com") then isWhitelist = true end
		if extracted_string:find("%.office.com") then isWhitelist = true end
		if extracted_string:find("%.office.net") then isWhitelist = true end
		if extracted_string:find("%.office265.com") then isWhitelist = true end
	end
end

local function markRun()
	isRun = true
	evaluate()
end

local function markClipboard()
	isClipboard = true
	evaluate()
end

local function markPayload()
	isPayload = true
	evaluate()
end

-- declare what tokens we want to match
ClickFixLure:setCallbacks({

    -- Session lifecycle: reset per-session state on new stream
    [nwevents.OnSessionBegin] = resetState(),

    -- ---- Whitelisting ---------------------------
    ["Host: "]      = checkWhitelist,
    ["host: "]      = checkWhitelist,

    -- ---- Bucket 1: Run-dialog / keyboard instructions ---------------------------
    ["Windows Key + R"]      = markRun,
    ["Windows key + R"]      = markRun,
    ["Win + R"]              = markRun,
    ["Win+R"]                = markRun,
    ["Windows+R"]            = markRun,
    ["win+r"]                = markRun,
    ["win + r"]              = markRun,
    ["WIN+R"]                = markRun,
    ["WIN + R"]              = markRun,
    ["press Win"]            = markRun,
    ["Press Win"]            = markRun,
    ["CTRL + V"]             = markRun,
    ["Ctrl + V"]             = markRun,
    ["ctrl + v"]             = markRun,
    ["ctrl+v"]				 = markRun,
    ["Ctrl+V"]               = markRun,
    ["CTRL+V"]               = markRun,
    ["Ctrl + Alt + T"]       = markRun,
    ["Open the Run dialog"]  = markRun,
    ["open the Run dialog"]  = markRun,
    ["Run dialog box"]       = markRun,
    ["press Enter to run"]   = markRun,
    ["Press Enter to run"]   = markRun,
    ["PowerShell window"]    = markRun,
    ["Terminal app"]         = markRun,

    -- ---- Bucket 2: clipboard JavaScript -----------------------------------------
    ["navigator.clipboard.writeText"] = markClipboard,
    ["navigator.clipboard.write"]     = markClipboard,
    ["document.execCommand('copy')"]  = markClipboard,
    ['document.execCommand("copy")']  = markClipboard,
    ["unsecuredCopyToClipboard"]      = markClipboard,
    ["stageClipboard"]                = markClipboard,
    ["textArea.select();"]            = markClipboard,

    -- ---- Bucket 3: staged payload strings ---------------------------------------
    ["powershell -w hidden"]		 = markPayload,
    ["powershell -W Hidden"]		 = markPayload,
    ["powershell.exe -nop"]			 = markPayload,
    ["powershell -nop"]				 = markPayload,
    ["powershell -enc"]				 = markPayload,
    ["powershell -EncodedCommand"]	 = markPayload,
    ["IEX(New-Object"]				 = markPayload,
    ["iex(New-Object"]				 = markPayload,
    ["Invoke-WebRequest"]			 = markPayload,
    ["mshta http"]					 = markPayload,
    ["Invoke-Expression"]			 = markPayload,
    ["mshta https"]					 = markPayload,
    ["mshta.exe"]					 = markPayload,
    ["bitsadmin /transfer"]			 = markPayload,
    ["curl.exe -o"]					 = markPayload,
    ["curl -o"]						 = markPayload,
    ["certutil -urlcache"]			 = markPayload,
    ["cmd.exe /c start"]			 = markPayload,
    ["cmd /c start"]				 = markPayload,
    ["# \xE2\x9C\x85"]				 = markPayload,  -- unicode check-mark comment trick used to disguise verification ID

})
