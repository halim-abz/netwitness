/*
Version: 1
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${alert_suppression?c}, identifiers={"ip_src"})

SELECT * FROM 
	Event(
		medium = 1
		AND service = 80
		AND direction = 'outbound'
		AND 'http single request' = ANY(analysis_service)
		AND 'http get no post' = ANY(analysis_service)
		AND (
			matchLike(user_agent, '%wget%')
			OR matchLike(user_agent, '%curl%')
		)
		AND 'libcurl' != ALL(user_agent)
		AND (
			filetype = 'elf executable'
			<#if ext_list[0].value != "">OR asStringArray(extension).anyOf(v => v.toLowerCase() IN (<@buildList inputlist=ext_list/>))</#if>
		)
		<#if ip_list[0].value != "">
		AND ip_dst NOT IN (<@buildList inputlist=ip_list/>)
		</#if>
	).std:unique(ip_src) group by ip_src output first every 30 min;

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