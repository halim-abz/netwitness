/*
Version: 1
Disclaimer: This rule is provided by the community and is not officially reviewed, tested, endorsed, or supported by NetWitness. We cannot guarantee the reliability of this rule. Please use this content at your own discretion.
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>

//Based on original rule from: Eric Partington

//Update learning phase to desired number of days
@Name('Named Window - learningWindowPS1Download')
CREATE WINDOW lPhasePS1Download.win:length(1) (learningPhase long);
INSERT INTO lPhasePS1Download
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to Store New Data
@Name('Named Window - whatsNewPS1Download')
@RSAPersist	
CREATE WINDOW whatsNewPS1Download.win:keepall().std:unique(ip_src) (ip_src string, ip_dst string, org_dst string, time long);

//Store in the window
@Name('Insert ip_src')
INSERT INTO whatsNewPS1Download
SELECT ip_src, ip_dst, org_dst, time 
FROM Event(filename IS NOT NULL AND direction = 'outbound' AND extension.toLowerCase() LIKE 'ps1' AND ip_src NOT IN (SELECT ip_src FROM whatsNewPS1Download));

//Compare to ip_src stored in the window
@RSAAlert
SELECT *
FROM Event(ip_src NOT IN (SELECT ip_src FROM whatsNewPS1Download) AND filename IS NOT NULL AND direction = 'outbound' AND extension.toLowerCase() LIKE 'ps1'
AND current_timestamp > (SELECT learningPhase FROM lPhasePS1Download))
OUTPUT ALL EVERY ${group_hours?c} hours;