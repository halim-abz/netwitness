/*
Version: 1
Disclaimer: This rule is provided by the community and is not officially reviewed, tested, endorsed, or supported by NetWitness. We cannot guarantee the reliability of this rule. Please use this content at your own discretion.
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>

//Based on original rule from: Eric Partington

//Update learning phase to desired number of days
@Name('Named Window - learningWindowClient')
CREATE WINDOW lPhaseClient.win:length(1) (learningPhase long);
INSERT INTO lPhaseClient
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to Store New Data
@Name('Named Window - whatsNewClient')
@RSAPersist	
CREATE WINDOW whatsNewClient.win:keepall().std:unique(client) (client string, ip_src string, ip_dst string, direction string, org_dst string, domain_dst string, alias_host string, medium short, time long);

//Store in the window
@Name('Insert client')
INSERT INTO whatsNewClient
SELECT client, ip_src, ip_dst, direction, org_dst, domain_dst, cast(alias_host, string) as alias_host, medium, time 
FROM Event(client IS NOT NULL AND client NOT IN (SELECT client FROM whatsNewClient));

//Compare to client stored in the window
@Name('${module_id}_Alert')
@RSAAlert
SELECT *
FROM Event(client NOT IN (SELECT client FROM whatsNewClient) AND client IS NOT NULL
AND current_timestamp > (SELECT learningPhase FROM lPhaseClient))
OUTPUT ALL EVERY ${group_hours?c} hours;