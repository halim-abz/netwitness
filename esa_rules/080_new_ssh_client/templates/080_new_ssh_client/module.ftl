/*
Version: 1
Disclaimer: This rule is provided by the community and is not officially reviewed, tested, endorsed, or supported by NetWitness. We cannot guarantee the reliability of this rule. Please use this content at your own discretion.
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>

//Original Author: Eric Partington

//Update learning phase to desired number of days
@Name('Named Window - learningWindowSSH')
CREATE WINDOW lPhaseSSH.win:length(1) (learningPhase long);
INSERT INTO lPhaseSSH
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to Store New Data
@Name('Named Window - whatsNewSSH1')
@RSAPersist	
CREATE WINDOW whatsNewSSH1.win:keepall().std:unique(client) (client string, ip_src string, ip_dst string, direction string, org_dst string, domain_dst string, alias_host string, medium short, server string, time long);

//Store in the window
@Name('Insert client')
INSERT INTO whatsNewSSH1
SELECT client, ip_src, ip_dst, direction, org_dst, domain_dst, cast(alias_host, string) as alias_host, medium, server, time 
FROM Event(client IS NOT NULL AND service = 22 AND client NOT IN (SELECT client FROM whatsNewSSH1));

//Compare to client stored in the window
@RSAAlert
SELECT *
FROM Event(client NOT IN (SELECT client FROM whatsNewSSH1) AND client IS NOT NULL AND service = 22
AND current_timestamp > (SELECT learningPhase FROM lPhaseSSH))
OUTPUT ALL EVERY ${group_hours?c} hours;