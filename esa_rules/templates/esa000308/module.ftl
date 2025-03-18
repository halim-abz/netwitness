/*
Version: 1
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${alert_suppression?c}, identifiers={"ip_src","attachment"})

SELECT * FROM 
	Event(
		medium = 1
		AND 'Highly Probable Malicious Attachment' = ALL( boc )
	).std:unique(ip_src,attachment) group by ip_src,attachment<#if alert_suppression != 0> output first every ${alert_suppression/60} min</#if>;