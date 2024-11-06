/*
Version: 1
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${module_suppress?c}, identifiers={"ip_src","filename"})

SELECT * FROM 
	Event(
		medium = 1
		AND service = 139
		AND filename IS NOT NULL
		AND (
			<@buildFileContainsList inputlist=filecontains_list/>
		)
		AND extension.toLowerCase() IN (<@buildList inputlist=ext_list/>)
		<#if filewhite_list[0].value != "">
		AND (
			<@buildFileWhiteContainsList inputlist=filewhite_list/>
		)
		</#if>
		<#if ipsrc_list[0].value != "">
		AND	ip_src NOT IN (<@buildList inputlist=ipsrc_list/>)
		</#if>
		<#if ipdst_list[0].value != "">
		AND	ip_dst NOT IN (<@buildList inputlist=ipdst_list/>)
		</#if>
	).std:unique(ip_src,filename) group by ip_src,filename output first every 30 min;

<#macro buildFileContainsList inputlist>
	<@compress single_line=true>
	<#list inputlist as v>
		(asStringArray(filename)).anyOf(v => v.toLowerCase() LIKE '%${v.value}%')
		<#if v_has_next> OR </#if>
	</#list>
	</@compress>
</#macro>

<#macro buildFileWhiteContainsList inputlist>
	<@compress single_line=true>
	<#list inputlist as v>
		(asStringArray(filename)).allOf(v => v.toLowerCase() NOT LIKE '%${v.value}%')
		<#if v_has_next> OR </#if>
	</#list>
	</@compress>
</#macro>

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