/*
Version: 1
Disclaimer: This rule is provided by the community and is not officially reviewed, tested, endorsed, or supported by NetWitness. We cannot guarantee the reliability of this rule. Please use this content at your own discretion.
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>

//Based on original rule from: Eric Partington

//Update learning phase to desired number of days
@Name('Named Window - learningWindowDestIPWithIOC')
CREATE WINDOW lPhaseDestIPWithIOC.win:length(1) (learningPhase long);
INSERT INTO lPhaseDestIPWithIOC
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to Store New Data
@Name('Named Window - whatsNewDestIPWithIOC')
@RSAPersist	
CREATE WINDOW whatsNewDestIPWithIOC.win:keepall().std:unique(ip_dst) (ip_src string, ip_dst string, time long);

//Store in the window
@Name('Insert DestIPWithIOC')
INSERT INTO whatsNewDestIPWithIOC
SELECT ip_src, ip_dst, time 
FROM Event(ioc IS NOT NULL AND direction IN ('outbound') AND ip_dst NOT IN (SELECT ip_dst FROM whatsNewDestIPWithIOC));

//Compare to ip_dst stored in the window
@RSAAlert
SELECT *
FROM Event(ip_dst NOT IN (SELECT ip_dst FROM whatsNewDestIPWithIOC) AND ioc IS NOT NULL AND direction IN ('outbound')
AND current_timestamp > (SELECT learningPhase FROM lPhaseDestIPWithIOC))
OUTPUT ALL EVERY ${group_hours?c} hours;