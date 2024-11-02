/*
Version: ${revision}
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${module_suppress?c}, identifiers={"ip_src","attachment"})

SELECT * FROM 
	Event(
		medium = 1
		AND service IN (25,110,143,209,220,465,587,993,995)
		AND (<@buildList inputlist=ext_list/>)
		<#if ext_list[0].value == "">
		AND attachment.toLowerCase() LIKE '%.one'
		</#if>
	).std:unique(ip_src) group by ip_src output first every 30 min;

<#macro buildList inputlist>
	<@compress single_line=true>
	<#list inputlist as v>
		attachment.toLowerCase() LIKE '%.${v.value}'
		<#if v_has_next> OR </#if>	
	</#list>
	</@compress>
</#macro>