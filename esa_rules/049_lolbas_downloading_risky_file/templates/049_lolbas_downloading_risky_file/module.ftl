/*
Version: 1
Disclaimer: This rule is provided by the community and is not officially reviewed, tested, endorsed, or supported by NetWitness. We cannot guarantee the reliability of this rule. Please use this content at your own discretion.
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>

@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${module_suppress?c})

SELECT * FROM 
	Event(
		medium = 1
		AND filename IS NOT NULL
		<#if ext_list[0].value != "">
		AND (<@buildExtList inputlist=ext_list/>)
		</#if>
		<#if agent_list[0].value != "">
		AND (<@buildAgentList inputlist=agent_list/>)
		</#if>
		<#if ip_list[0].value != "">
		AND	ip_dst NOT IN (<@buildList inputlist=ip_list/>)
		</#if>
		<#if domain_list[0].value != "">
		AND	domain NOT IN (<@buildList inputlist=domain_list/>)
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

<#macro buildExtList inputlist>
	<@compress single_line=true>
	<#list inputlist as v>
		filename.toLowerCase() LIKE '%.${v.value}'
		<#if v_has_next> OR </#if>
	</#list>
	</@compress>
</#macro>

<#macro buildAgentList inputlist>
	<@compress single_line=true>
	<#list inputlist as v>
		client LIKE '%${v.value}%'
		<#if v_has_next> OR </#if>
	</#list>
	</@compress>
</#macro>