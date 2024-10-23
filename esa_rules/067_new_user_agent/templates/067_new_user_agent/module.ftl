/*
Version: 1
Disclaimer: This rule is provided by the community and is not officially reviewed, tested, endorsed, or supported by NetWitness. We cannot guarantee the reliability of this rule. Please use this content at your own discretion.
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>

//Based on original rule from: Eric Partington

//Update learning phase to desired number of days
@Name('Named Window - NewUserAgent')
CREATE WINDOW NewUserAgent_learning.win:length(1) (learningPhase long);
INSERT INTO NewUserAgent_learning
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to Store New Data
@Name('Named Window - NewUserAgent')
@RSAPersist	
CREATE WINDOW NewUserAgent.win:keepall().std:unique(client) (client string, time long);

//If value already exists, update timestamp, if not, create new entry
ON Event(client IS NOT NULL AND direction NOT IN ('inbound')) as e
MERGE NewUserAgent as w
WHERE w.client = e.client
WHEN MATCHED
    THEN UPDATE SET w.time = e.time
WHEN NOT MATCHED
    THEN INSERT SELECT e.client as client, e.time as time;

//Compare to client stored in the window
@Name('${module_id}_Alert')
@RSAAlert
SELECT *
FROM Event(client IS NOT NULL AND direction NOT IN ('inbound') AND client NOT IN (SELECT client FROM NewUserAgent)
AND current_timestamp > (SELECT learningPhase FROM NewUserAgent_learning))
OUTPUT ALL EVERY ${group_hours?c} hours;

//Every day, clear values older than x days
ON PATTERN [every timer:interval(1 day)]
DELETE FROM NewUserAgent
WHERE time < current_timestamp.minus(${phaseout_days?c);