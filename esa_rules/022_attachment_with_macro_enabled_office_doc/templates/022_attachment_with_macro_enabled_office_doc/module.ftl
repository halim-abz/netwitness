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
		<#if ext_list[0].value != "">
		<@buildList inputlist=ext_list/>
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