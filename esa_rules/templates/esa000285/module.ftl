/*
Version: 1
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${alert_suppression?c}, identifiers={"ip_src","ip_dst","ad_username_src"})

SELECT * FROM 
	Event(
		medium = 1
		AND ad_username_src IS NOT NULL
		AND error.toLowerCase() IN ('kdc err client revoked')
	).std:unique(ip_src) group by ip_src output first every 30 min;