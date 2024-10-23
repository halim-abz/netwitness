/*
Version: 1
Disclaimer: This rule is provided by the community and is not officially reviewed, tested, endorsed, or supported by NetWitness. We cannot guarantee the reliability of this rule. Please use this content at your own discretion.
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>

//Original Author: Eric Partington

//Update learning phase to desired number of days
@Name('Named Window - learningWindowCA')
CREATE WINDOW lPhaseCA.win:length(1) (learningPhase long);
INSERT INTO lPhaseCA
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to Store New Data
@Name('Named Window - whatsNewCA')
@RSAPersist	
CREATE WINDOW whatsNewCA.win:keepall().std:unique(ssl_ca) (ssl_ca string, ssl_subject string, ip_src string, ip_dst string, direction string, org_dst string, domain_dst string, alias_host string, medium short, time long, service long);

//Store in the window
@Name('Insert CA')
INSERT INTO whatsNewCA
SELECT ssl_ca, ssl_subject, ip_src, ip_dst, direction, org_dst, domain_dst, cast(alias_host, string) as alias_host, medium, time, service
FROM Event(ssl_ca IS NOT NULL AND ssl_ca NOT IN (SELECT ssl_ca FROM whatsNewCA));

//Compare to client stored in the window
@RSAAlert
SELECT *
FROM Event(ssl_ca NOT IN (SELECT ssl_ca FROM whatsNewCA) AND ssl_ca IS NOT NULL
AND current_timestamp > (SELECT learningPhase FROM lPhaseCA))
OUTPUT ALL EVERY ${group_hours?c} hours;