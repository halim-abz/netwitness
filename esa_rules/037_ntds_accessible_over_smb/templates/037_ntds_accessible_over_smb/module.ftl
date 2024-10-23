/*
Version: 1
Disclaimer: This rule is provided by the community and is not officially reviewed, tested, endorsed, or supported by NetWitness. We cannot guarantee the reliability of this rule. Please use this content at your own discretion.
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>

@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${module_suppress?c})

SELECT * FROM 
	Event(
		medium = 1
		AND service = 139
		AND filename.toLowerCase() IN ('ntds.dit')
	).std:unique(ip_src) group by ip_src output first every 30 min;
