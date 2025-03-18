/*
Version: 2
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${alert_suppression?c}, identifiers={"ip_src","attachment"})

SELECT * FROM 
	Event(
		attachment IS NOT NULL
		AND (
			asStringArray(attachment).anyOf(v => v.toLowerCase() LIKE ('%docm'))
			OR asStringArray(attachment).anyOf(v => v.toLowerCase() LIKE ('%dotm'))
			OR asStringArray(attachment).anyOf(v => v.toLowerCase() LIKE ('%xlm'))
			OR asStringArray(attachment).anyOf(v => v.toLowerCase() LIKE ('%xlsm'))
			OR asStringArray(attachment).anyOf(v => v.toLowerCase() LIKE ('%xltm'))
			OR asStringArray(attachment).anyOf(v => v.toLowerCase() LIKE ('%xlam'))
			OR asStringArray(attachment).anyOf(v => v.toLowerCase() LIKE ('%pptm'))
			OR asStringArray(attachment).anyOf(v => v.toLowerCase() LIKE ('%potm'))
			OR asStringArray(attachment).anyOf(v => v.toLowerCase() LIKE ('%ppsm'))
			OR asStringArray(attachment).anyOf(v => v.toLowerCase() LIKE ('%sldm'))
		)
	).std:unique(ip_src) group by ip_src<#if alert_suppression != 0> output first every ${alert_suppression/60} min</#if>;