-- =============================================================================
-- NetWitness Lua Parser: JavaScript Obfuscation Detector
-- File:    js_obfuscation_detector.lua
-- Version: 1.0.0
--
-- Writes to analysis.service — one value per matched signal.
-- No custom meta key declarations required.
--
-- Values written to analysis.service:
--   "js self invoke"    → ;;(function(){var pattern
--   "js base64 blob"    → Large base64 encoded string
--   "js hex obfuscation"→ _0x-prefixed hex identifiers
--   "js xor decryption" → XOR-based string decryption (charCodeAt ^ key)
--   "js atob usage"     → atob() runtime base64 decode call
--
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PARSER REGISTRATION
-- ---------------------------------------------------------------------------
local jsObf = nw.createParser("js_obfuscation_detector", "Detects JavaScript obfuscation patterns in HTTP traffic",80)

-- ---------------------------------------------------------------------------
-- META KEY
-- ---------------------------------------------------------------------------
jsObf:setKeys({
    nwlanguagekey.create("analysis.service"),
})

-- ---------------------------------------------------------------------------
-- DETECTION SIGNALS
-- ---------------------------------------------------------------------------
local SIGNALS = {

    {
        value = "js self invoke",
        pats  = {
            ";;%(function%(%){var",
            ";;%s*%(function%s*%(%s*%)%s*{%s*var",
            ";;%(function%([%a_$,]+%)%s*{%s*var",
        }
    },

    {
        value = "js base64 blob",
        pats  = {
            '"[A-Za-z0-9+/][A-Za-z0-9+/][A-Za-z0-9+/][A-Za-z0-9+/][A-Za-z0-9+/=][A-Za-z0-9+/=][A-Za-z0-9+/=][A-Za-z0-9+/=][A-Za-z0-9+/=]+"',
            "'[A-Za-z0-9+/][A-Za-z0-9+/][A-Za-z0-9+/][A-Za-z0-9+/][A-Za-z0-9+/=][A-Za-z0-9+/=][A-Za-z0-9+/=][A-Za-z0-9+/=][A-Za-z0-9+/=]+'",
        }
    },

    {
        value = "js hex obfuscation",
        pats  = {
            "_0x[0-9a-fA-F]+",
        }
    },

    {
        value = "js xor decryption",
        pats  = {
            "%.charCodeAt%s*%(.-%)%s*%^%s*[%a%d_\"']+",
            "%.charCodeAt%(.-%)%s*%^%s*0x[0-9a-fA-F]+",
            "fromCharCode%s*%(.-charCodeAt.-%^",
        }
    },

    {
        value = "js atob usage",
        pats  = {
            "[^%w]atob%s*%([%a_$\"'`]",
            "window%.atob%s*%(",
            "globalThis%.atob%s*%(",
            "eval%s*%(%s*atob%s*%(",
        }
    },

}

-- ---------------------------------------------------------------------------
-- HELPERS
-- ---------------------------------------------------------------------------
local function matchesAny(body, pats)
    for _, pat in ipairs(pats) do
        if body:find(pat) then
            return true
        end
    end
    return false
end

-- ---------------------------------------------------------------------------
-- TOKEN CALLBACK
-- ---------------------------------------------------------------------------
function jsObf:onHTTPscript(token, first, last)
    local payload = nw.getPayload()
    if not payload then return end

    local body = nwpayload.tostring(payload)
    if not body or #body < 10 then return end

    for _, signal in ipairs(SIGNALS) do
        if matchesAny(body, signal.pats) then
            nw.createMeta(jsObf.keys["analysis.service"], signal.value)
        end
    end
end

-- ---------------------------------------------------------------------------
-- CALLBACK REGISTRATION
-- ---------------------------------------------------------------------------
jsObf:setCallbacks({
    ["<script"] = jsObf.onHTTPscript,
    ["<Script"] = jsObf.onHTTPscript,
    ["<SCRIPT"] = jsObf.onHTTPscript,
})
