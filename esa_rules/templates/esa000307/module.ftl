/*
Version: 1
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${alert_suppression?c})

SELECT * FROM 
	Event(
	    medium = 1
		AND 'top 100k password' = ALL( eoc )
		<#if ipsrc_list[0].value != "">
		AND ip_src NOT IN (<@buildList inputlist=ipsrc_list/>)
		</#if>
		<#if ipdst_list[0].value != "">
		AND ip_dst NOT IN (<@buildList inputlist=ipdst_list/>)
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