/*
Version: 2
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${alert_suppression?c}, identifiers={"ip_src","attachment"})

SELECT * FROM 
	Event(
		medium = 1
		AND service IN (25,110,143,209,220,465,587,993,995)
		AND asStringArray(attachment).anyOf(v => v.toLowerCase() LIKE ('%one'))
	).std:unique(ip_src) group by ip_src<#if alert_suppression != 0> output first every ${alert_suppression/60} min</#if>;