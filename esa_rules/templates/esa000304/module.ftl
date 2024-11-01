/*
Version: 2
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>//Window to store timestamp for learning phase
CREATE WINDOW NewDestIPWithIOC_learning.win:length(1) (learningPhase long);
INSERT INTO NewDestIPWithIOC_learning
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to store new data
@RSAPersist	
CREATE WINDOW NewDestIPWithIOC.win:keepall().std:unique(ip_dst) (ip_dst string, time long);

//For incoming events, if value already exists, update timestamp, if not, create new entry
ON Event(ioc IS NOT NULL AND direction IN ('outbound')) as e
MERGE NewDestIPWithIOC as w
WHERE w.ip_dst = e.ip_dst
WHEN MATCHED
    THEN UPDATE SET w.time = e.time
WHEN NOT MATCHED
    THEN INSERT SELECT e.ip_dst as ip_dst, e.time as time;

//Compare to ip_dst stored in the window
@Name('${module_id}_Alert')
@RSAAlert
SELECT *
FROM Event(ioc IS NOT NULL AND direction IN ('outbound') AND ip_dst NOT IN (SELECT ip_dst FROM NewDestIPWithIOC)
AND current_timestamp > (SELECT learningPhase FROM NewDestIPWithIOC_learning))
OUTPUT ALL EVERY ${group_hours?c} hours;

//Every day, clear values older than x days
ON PATTERN [every timer:interval(1 day)]
DELETE FROM NewDestIPWithIOC
WHERE time < current_timestamp.minus(${phaseout_days?c});