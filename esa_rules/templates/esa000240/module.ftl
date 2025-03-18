/*
Version: 1
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
@Hint('reclaim_group_aged=${time_window*2}')
@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${alert_suppression?c}, identifiers={"ip_src", "tcp_dstport"})

SELECT window(*) FROM 
	Event(
		medium = 1
		AND	tcp_dstport IN (<@buildList inputlist=port_list/>)
		<#if ip_list[0].value != "">
		AND	ip_src NOT IN (<@buildList inputlist=ip_list/>)
		</#if>
	).std:groupwin(ip_src, tcp_dstport).win:time_length_batch(${time_window?c} seconds, ${count*2}).std:unique(ip_dst) group by ip_src, tcp_dstport having count(*) >= ${count?c}<#if alert_suppression != 0> output first every ${alert_suppression/60} min</#if>;

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