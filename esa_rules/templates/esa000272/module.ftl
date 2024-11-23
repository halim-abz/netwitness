/*
Version: 1
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${module_suppress?c}, identifiers={"ip_src","ip_dst"})

SELECT * FROM 
	Event(
    	medium = 1
	    AND service = 139 
	    AND 'smb v1 request' = ANY(eoc)
	    AND 'smb v1 response' = ANY(eoc)
	    AND isOneOfIgnoreCase(action,{'create'})
	    AND isOneOfIgnoreCase(action,{'read'})
	    AND isOneOfIgnoreCase(action,{'write'})
	    AND isOneOfIgnoreCase(action,{'delete'})
	    AND isOneOfIgnoreCase(directory,{'\\c$\\'})
	    AND isOneOfIgnoreCase(directory,{'\\admin$\\'})
		<#if ip_list[0].value != "">
		AND ip_src NOT IN (<@buildList inputlist=ip_list/>)
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