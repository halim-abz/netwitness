/*
Version: 2
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${module_suppress?c}, identifiers={"ip_src","ip_dst"})

SELECT * FROM 
	Event(
		medium = 1
		AND service = 139
		AND asStringArray(filename).anyOf(v => v.toLowerCase() IN ('ntds.dit'))
	).std:unique(ip_src) group by ip_src output first every 30 min;