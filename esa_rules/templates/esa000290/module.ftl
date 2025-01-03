/*
Version: 1
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${alert_suppression?c}, identifiers={"ip_src","ip_dst","domain"})

SELECT * FROM 
	Event(
	    medium = 1
		AND direction = 'outbound'
		AND 'SSL certificate self-signed' = ANY(analysis_service)
		<#if domain_list[0].value != "">
		AND (domain IS NULL OR domain NOT IN (<@buildList inputlist=domain_list/>))
		</#if>
		<#if ip_list[0].value != "">
		AND ip_dst NOT IN (<@buildList inputlist=ip_list/>)
		</#if>
	).std:unique(alias_host) group by alias_host output first every 30 min;

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