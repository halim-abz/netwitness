/*
Version: 1
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${module_suppress?c}, identifiers={"ip_src","ip_dst","client"})

SELECT * FROM 
	Event(
		medium = 1
		AND filename IS NOT NULL
		<#if agent_list[0].value != "">
		AND (<@buildAgentList inputlist=agent_list/>)
		</#if>
		<#if ext_list[0].value != "">
		AND	asStringArray(extension).anyOf(v => v.toLowerCase() IN (<@buildList inputlist=ext_list/>))
		</#if>
		<#if ip_list[0].value != "">
		AND	ip_dst NOT IN (<@buildList inputlist=ip_list/>)
		</#if>
		<#if domain_list[0].value != "">
		AND	(domain IS NULL OR domain NOT IN (<@buildList inputlist=domain_list/>))
		</#if>
		<#if top10kfeed_enabled == "yes">
		AND 'top 10k domain' != ALL( analysis_session )
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

<#macro buildAgentList inputlist>
	<@compress single_line=true>
	<#list inputlist as v>
		matchLike(user_agent, '%${v.value}%')
		<#if v_has_next> OR </#if>
	</#list>
	</@compress>
</#macro>