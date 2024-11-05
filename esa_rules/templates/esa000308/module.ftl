/*
Version: 1
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${module_suppress?c}, identifiers={"ip_src","attachment"})

SELECT * FROM 
	Event(
		medium = 1
		AND 'Highly Probabld Malicious Attachment' = ALL( boc )
	).std:unique(ip_src,attachment) group by ip_src,attachment output first every 30 min;