/*
Version: 1
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
@Hint('reclaim_group_aged=${time_window*2}')
@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${module_suppress?c}, identifiers={"ip_src"})

SELECT window(*) FROM 
	Event(
		medium = 1
		AND	service = 53
		AND	dns_querytype IN ('a record')
		AND	alias_host.size() = 1
		AND	error IN ('no name')
		<#if tld_list[0].value != "">
		AND	tld NOT IN (<@buildList inputlist=tld_list/>)
		</#if>
		<#if domain_list[0].value != "">
		AND	domain NOT IN (<@buildList inputlist=domain_list/>)
		</#if>
		<#if ip_list[0].value != "">
		AND	ip_src NOT IN (<@buildList inputlist=ip_list/>)
		</#if>
	).std:groupwin(ip_src).win:time_length_batch(${time_window?c} seconds, ${count*2}).std:unique(alias_host) group by ip_src having count(*) >= ${count?c} output first every 30 min;

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