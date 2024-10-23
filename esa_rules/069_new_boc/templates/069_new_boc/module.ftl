/*
Version: 1
Disclaimer: This rule is provided by the community and is not officially reviewed, tested, endorsed, or supported by NetWitness. We cannot guarantee the reliability of this rule. Please use this content at your own discretion.
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>

//Based on original rule from: Eric Partington

create schema bocContainer(baseline_boc string);

CREATE WINDOW lPhaseboc.win:length(1) (learningPhase long);
INSERT INTO lPhaseboc
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to Store New Data
@RSAPersist(serialization=JSON)
@Name('Named Window - boc')
CREATE WINDOW Newboc.win:time(${rollover_days?c} days).std:unique(boc) (boc string);

//Split the boc vector into single elements and store in the window
@Name('Insert boc')
INSERT INTO Newboc
SELECT baseline_boc as boc FROM Event(boc IS NOT NULL)
[cast(boc, string).split(', |\\[|\\]', 0)@type(bocContainer) WHERE baseline_boc != ''];

//Split the boc vector into single elements and compare to boc stored in the window
@RSAAlert
SELECT cast(boc, string) as boc, ip_src, ip_dst, country_src, country_dst, alias_host, domain_dst, client, service, tcp_srcport, tcp_dstport, udp_srcport, udp_dstport, direction, netname, action, error, filename
FROM Event(boc IS NOT NULL AND cast(boc, string).split(', |\\[|\\]', 0).anyOf(i => i NOT IN (SELECT boc FROM Newboc) AND i IS NOT '')
AND current_timestamp > (SELECT learningPhase FROM lPhaseboc))
OUTPUT ALL EVERY ${group_hours?c} hours;