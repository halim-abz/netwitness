/*
Version: 1
Disclaimer: This rule is provided by the community and is not officially reviewed, tested, endorsed, or supported by NetWitness. We cannot guarantee the reliability of this rule. Please use this content at your own discretion.
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>

//Based on original rule from: Eric Partington

//Update learning phase to desired number of days
@Name('Named Window - learningWindowLolbasDownload')
CREATE WINDOW lPhaseLolbasDownload.win:length(1) (learningPhase long);
INSERT INTO lPhaseLolbasDownload
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to Store New Data
@Name('Named Window - whatsNewLolbasDownload')
@RSAPersist	
CREATE WINDOW whatsNewLolbasDownload.win:keepall().std:unique(ip_dst) (ip_src string, ip_dst string, org_dst string, time long);

//Store in the window
@Name('Insert ip_dst')
INSERT INTO whatsNewLolbasDownload
SELECT ip_src, ip_dst, org_dst, time 
FROM Event(filename IS NOT NULL AND direction = 'outbound' AND (client.toLowerCase() LIKE 'microsoft bits%' OR client.toLowerCase() LIKE 'certutil%' OR client.toLowerCase() LIKE 'microsoft office%') AND 'top 10k domain' != ALL( analysis_session ) AND ip_dst NOT IN (SELECT ip_dst FROM whatsNewLolbasDownload));

//Compare to ip_dst stored in the window
@RSAAlert
SELECT *
FROM Event(ip_dst NOT IN (SELECT ip_dst FROM whatsNewLolbasDownload) AND filename IS NOT NULL AND direction = 'outbound' AND (client.toLowerCase() LIKE 'microsoft bits%' OR client.toLowerCase() LIKE 'certutil%' OR client.toLowerCase() LIKE 'microsoft office%') AND 'top 10k domain' != ALL( analysis_session ) AND current_timestamp > (SELECT learningPhase FROM lPhaseLolbasDownload))
OUTPUT ALL EVERY ${group_hours?c} hours;