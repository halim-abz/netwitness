/*
Version: 2
*/
module ${module_id};
<#if module_debug>@Audit('stream')</#if>

@RSAPersist
create window MultiOSUserAgents.win:time(${time_window?c} min).std:unique(ip_src,os_type) (
    ip_src string,
    os_type string
);

@Name('InsertUserAgentsIntoWindow')
INSERT INTO MultiOSUserAgents
SELECT
    ip_src,
    CASE
        WHEN client.toLowerCase() LIKE '%windows%' THEN 'Windows'
        WHEN client.toLowerCase() LIKE '%macintosh%' THEN 'Macintosh'
        WHEN client.toLowerCase() LIKE '%linux%' THEN 'Linux'
        WHEN client.toLowerCase() LIKE '%android%' THEN 'Android'
        WHEN client.toLowerCase() LIKE '%iphone%' THEN 'iPhone'
        WHEN client.toLowerCase() LIKE '%ipad%' THEN 'iPad'
        WHEN client.toLowerCase() LIKE '%chromebook%' THEN 'Chromebook'
    END as os_type
FROM Event(
    service = 80
	AND ip_src IS NOT NULL
	AND client IS NOT NULL
    AND (
        client.toLowerCase() LIKE '%windows%'
        OR client.toLowerCase() LIKE '%macintosh%'
        OR client.toLowerCase() LIKE '%linux%'
        OR client.toLowerCase() LIKE '%android%'
        OR client.toLowerCase() LIKE '%iphone%'
        OR client.toLowerCase() LIKE '%ipad%'
        OR client.toLowerCase() LIKE '%chromebook%'
        )
	<#if ip_list[0].value != "">AND ip_src NOT IN (<@buildList inputlist=ip_list/>)</#if>
	<#if useragent_list[0].value != "">AND client.toLowerCase() NOT IN (<@buildList inputlist=useragent_list/>)</#if>
);

@Name('${module_id}_Alert')
@RSAAlert(oneInSeconds=${alert_suppression?c},identifiers={"ip_src"})
SELECT window(*)
FROM MultiOSUserAgents
GROUP BY ip_src
HAVING count(distinct os_type) > 1 output first every ${time_window?c} min;

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