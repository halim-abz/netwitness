/*
Version: 1
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${module_suppress?c}, identifiers={"ip_src"})

SELECT * FROM PATTERN [ 
	every-distinct(ip_src, ${time_window?c} minutes)
	 e1=Event(client.toLowerCase() LIKE '%linux%'<#if ip_list[0].value != ""> AND ip_src NOT IN (<@buildList inputlist=ip_list/>)</#if><#if useragent_list[0].value != ""> AND client.toLowerCase() NOT IN (<@buildList inputlist=useragent_list/>)</#if>)
	->
	 e2=Event(client.toLowerCase() LIKE '%windows%'<#if useragent_list[0].value != ""> AND client.toLowerCase() NOT IN (<@buildList inputlist=useragent_list/>)</#if> AND ip_src=e1.ip_src)

	where timer:within(${time_window?c} minutes)
];

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