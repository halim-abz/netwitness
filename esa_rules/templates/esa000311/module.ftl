/*
Version: 1
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${alert_suppression?c}, identifiers={"ip_src","ip_dst","username"})

SELECT * FROM 
	Event(
		medium = 1
		AND service IN (3389)
		AND username IS NOT NULL
		AND (
			isOneOfIgnoreCase(username,{ 'administrator' , 'root' })
			<#if usercontains_list[0].value != "">
			OR (<@buildUserContainsList inputlist=usercontains_list/>)
			</#if>
			<#if userbegins_list[0].value != "">
			OR (<@buildUserBeginsList inputlist=userbegins_list/>)
			</#if>
			<#if userends_list[0].value != "">
			OR (<@buildUserEndsList inputlist=userends_list/>)
			</#if>
		)
		<#if userwhite_list[0].value != "">
		AND	isNotOneOfIgnoreCase(username,{<@buildList inputlist=userwhite_list/>})
		</#if>
		<#if ipsrc_list[0].value != "">
		AND	ip_src NOT IN (<@buildList inputlist=ipsrc_list/>)
		</#if>
		<#if ipdst_list[0].value != "">
		AND	ip_dst NOT IN (<@buildList inputlist=ipdst_list/>)
		</#if>
	).std:unique(ip_src,ip_dst,username) group by ip_src,ip_dst,username<#if alert_suppression != 0> output first every ${alert_suppression/60} min</#if>;

<#macro buildUserContainsList inputlist>
	<@compress single_line=true>
	<#list inputlist as v>
		(asStringArray(username)).anyOf(v => v.toLowerCase() LIKE '%${v.value}%')
		<#if v_has_next> OR </#if>
	</#list>
	</@compress>
</#macro>

<#macro buildUserBeginsList inputlist>
	<@compress single_line=true>
	<#list inputlist as v>
		(asStringArray(username)).anyOf(v => v.toLowerCase() LIKE '${v.value}%')
		<#if v_has_next> OR </#if>
	</#list>
	</@compress>
</#macro>

<#macro buildUserEndsList inputlist>
	<@compress single_line=true>
	<#list inputlist as v>
		(asStringArray(username)).anyOf(v => v.toLowerCase() LIKE '%${v.value}')
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