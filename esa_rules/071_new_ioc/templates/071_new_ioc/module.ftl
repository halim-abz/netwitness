/*
Version: 1
Disclaimer: This rule is provided by the community and is not officially reviewed, tested, endorsed, or supported by NetWitness. We cannot guarantee the reliability of this rule. Please use this content at your own discretion.
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>

create schema iocContainer(baseline_ioc string);

//Based on original rule from: Eric Partington

CREATE WINDOW lPhaseioc.win:length(1) (learningPhase long);
INSERT INTO lPhaseioc
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to Store New Data
@RSAPersist(serialization=JSON)
@Name('Named Window - ioc')
CREATE WINDOW Newioc.win:time(${rollover_days?c} days).std:unique(ioc) (ioc string);

//Split the ioc vector into single elements and store in the window
@Name('Insert ioc')
INSERT INTO Newioc
SELECT baseline_ioc as ioc FROM Event(ioc IS NOT NULL)
[cast(ioc, string).split(', |\\[|\\]', 0)@type(iocContainer) WHERE baseline_ioc != ''];

//Split the ioc vector into single elements and compare to ioc stored in the window
@RSAAlert
SELECT cast(ioc, string) as ioc, ip_src, ip_dst, country_src, country_dst, alias_host, domain_dst, client, service, tcp_srcport, tcp_dstport, udp_srcport, udp_dstport, direction, netname, action, error, filename
FROM Event(ioc IS NOT NULL AND cast(ioc, string).split(', |\\[|\\]', 0).anyOf(i => i NOT IN (SELECT ioc FROM Newioc) AND i IS NOT '')
AND current_timestamp > (SELECT learningPhase FROM lPhaseioc))
OUTPUT ALL EVERY ${group_hours?c} hours;