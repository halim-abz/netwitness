/*
Version: 1
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${module_suppress?c}, identifiers={"ip_src","ip_dst","service"})

SELECT * FROM 
	Event(
		medium = 1
		AND direction = 'outbound'
		AND streams = 2
		AND	service IN (<@buildList inputlist=port_list/>)
		<#if ipsrc_list[0].value != "">
		AND	ip_src NOT IN (<@buildList inputlist=ipsrc_list/>)
		</#if>
		<#if ipdst_list[0].value != "">
		AND	ip_dst NOT IN (<@buildList inputlist=ipdst_list/>)
		</#if>
	).std:unique(ip_src,ip_dst,service) group by ip_src,ip_dst,service output first every 30 min;

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