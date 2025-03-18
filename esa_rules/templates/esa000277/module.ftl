/*
Version: 1
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${alert_suppression?c}, identifiers={"ip_src","ip_dst"})

SELECT * FROM 
	Event(
		medium = 1
		AND service = 5900
		AND 'no authentication required' = ANY(risk_info)
		<#if ip_list[0].value != "">
		AND ip_dst NOT IN (<@buildList inputlist=ip_list/>)
		</#if>
	).std:unique(ip_src) group by ip_src<#if alert_suppression != 0> output first every ${alert_suppression/60} min</#if>;

<#macro buildList inputlist>
	<@compress single_line=true>
	<#list inputlist as v>
		<@buildScalar value=v/>
		<#if v_has_next>,</#if>	
	</#list>
	</@compress>
</#macro>

<#macro buildScalar value>
	<#if value.type?starts_with("string")>
		'${value.value}'
	<#elseif value.type?starts_with("short") || value.type?starts_with("integer") 
		|| value.type?starts_with("long") || value.type?starts_with("float") || value.type?starts_with("int")>
		${value.value?c}	
	</#if>
</#macro>