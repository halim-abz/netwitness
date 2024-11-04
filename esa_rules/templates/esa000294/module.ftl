/*
Version: 2
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>//Window to store timestamp for learning phase
CREATE WINDOW NewUserAgent_learning.win:length(1) (learningPhase long);
INSERT INTO NewUserAgent_learning
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to store new data
@RSAPersist	
CREATE WINDOW NewUserAgent.win:keepall().std:unique(client) (client string, time long);

//For incoming events, if value already exists, update timestamp, if not, create new entry
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
WHERE time < current_timestamp.minus(${phaseout_days?c} days);