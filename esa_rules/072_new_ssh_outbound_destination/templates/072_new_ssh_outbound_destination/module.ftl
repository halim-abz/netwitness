/*
Version: 1
Disclaimer: This rule is provided by the community and is not officially reviewed, tested, endorsed, or supported by NetWitness. We cannot guarantee the reliability of this rule. Please use this content at your own discretion.
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>

//Based on original rule from: Eric Partington

//Update learning phase to desired number of days
@Name('Named Window - learningWindowSSHDest')
CREATE WINDOW lPhaseSSHDest.win:length(1) (learningPhase long);
INSERT INTO lPhaseSSHDest
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to Store New Data
@Name('Named Window - whatsNewSSHDest')
@RSAPersist	
CREATE WINDOW whatsNewSSHDest.win:keepall().std:unique(ip_dst) (ip_src string, ip_dst string, org_dst string, time long);

//Store in the window
@Name('Insert ip_dst')
INSERT INTO whatsNewSSHDest
SELECT ip_src, ip_dst, org_dst, time 
FROM Event(service = 22 AND direction = 'outbound' AND ip_dst NOT IN (SELECT ip_dst FROM whatsNewSSHDest));

//Compare to ip_dst stored in the window
@RSAAlert
SELECT *
FROM Event(ip_dst NOT IN (SELECT ip_dst FROM whatsNewSSHDest) AND service = 22 AND direction = 'outbound'
AND current_timestamp > (SELECT learningPhase FROM lPhaseSSHDest))
OUTPUT ALL EVERY ${group_hours?c} hours;