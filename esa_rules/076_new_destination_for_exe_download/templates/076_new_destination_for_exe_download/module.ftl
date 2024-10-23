/*
Version: 1
Disclaimer: This rule is provided by the community and is not officially reviewed, tested, endorsed, or supported by NetWitness. We cannot guarantee the reliability of this rule. Please use this content at your own discretion.
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>

//Based on original rule from: Eric Partington

//Update learning phase to desired number of days
@Name('Named Window - learningWindowEXEDownload')
CREATE WINDOW lPhaseEXEDownload.win:length(1) (learningPhase long);
INSERT INTO lPhaseEXEDownload
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to Store New Data
@Name('Named Window - whatsNewEXEDownload')
@RSAPersist	
CREATE WINDOW whatsNewEXEDownload.win:keepall().std:unique(ip_dst) (ip_src string, ip_dst string, org_dst string, time long);

//Store in the window
@Name('Insert ip_dst')
INSERT INTO whatsNewEXEDownload
SELECT ip_src, ip_dst, org_dst, time 
FROM Event(direction = 'outbound' AND filetype.toLowerCase() IN ( 'windows executable' ) AND ip_dst NOT IN (SELECT ip_dst FROM whatsNewEXEDownload));

//Compare to ip_dst stored in the window
@RSAAlert
SELECT *
FROM Event(ip_dst NOT IN (SELECT ip_dst FROM whatsNewEXEDownload) AND direction = 'outbound' AND filetype.toLowerCase() IN ( 'windows executable' )
AND current_timestamp > (SELECT learningPhase FROM lPhaseEXEDownload))
OUTPUT ALL EVERY ${group_hours?c} hours;