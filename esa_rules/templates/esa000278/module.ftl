/*
Version: 1
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${module_suppress?c}, identifiers={"ip_src", "ip_dst"})

SELECT * FROM 
	Event(
	    medium = 1
	    AND (direction = 'inbound' OR direction = 'lateral')
	    AND 'possible sql injection' = ANY(ioc)
		<#if ip_dstlist[0].value != "">
		AND ip_dst NOT IN (<@buildList inputlist=ip_dstlist/>)
		</#if>
		<#if ip_srclist[0].value != "">
		AND ip_src NOT IN (<@buildList inputlist=ip_srclist/>)
		</#if>
	).std:groupwin(ip_src,ip_dst).win:time_length_batch(${time_window?c} seconds, ${count?c}) group by ip_src,ip_dst having count(*) = ${count?c} output first every 30 min;

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