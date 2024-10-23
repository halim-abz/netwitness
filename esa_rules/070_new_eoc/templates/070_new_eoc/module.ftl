/*
Version: 1
Disclaimer: This rule is provided by the community and is not officially reviewed, tested, endorsed, or supported by NetWitness. We cannot guarantee the reliability of this rule. Please use this content at your own discretion.
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>

//Based on original rule from: Eric Partington

create schema eocContainer(baseline_eoc string);

CREATE WINDOW lPhaseeoc.win:length(1) (learningPhase long);
INSERT INTO lPhaseeoc
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to Store New Data
@RSAPersist(serialization=JSON)
@Name('Named Window - eoc')
CREATE WINDOW Neweoc.win:time(${rollover_days?c} days).std:unique(eoc) (eoc string);

//Split the eoc vector into single elements and store in the window
@Name('Insert eoc')
INSERT INTO Neweoc
SELECT baseline_eoc as eoc FROM Event(eoc IS NOT NULL)
[cast(eoc, string).split(', |\\[|\\]', 0)@type(eocContainer) WHERE baseline_eoc != ''];

//Split the eoc vector into single elements and compare to eoc stored in the window
@RSAAlert
SELECT cast(eoc, string) as eoc, ip_src, ip_dst, country_src, country_dst, alias_host, domain_dst, client, service, tcp_srcport, tcp_dstport, udp_srcport, udp_dstport, direction, netname, action, error, filename
FROM Event(eoc IS NOT NULL AND cast(eoc, string).split(', |\\[|\\]', 0).anyOf(i => i NOT IN (SELECT eoc FROM Neweoc) AND i IS NOT '')
AND current_timestamp > (SELECT learningPhase FROM lPhaseeoc))
OUTPUT ALL EVERY ${group_hours?c} hours;