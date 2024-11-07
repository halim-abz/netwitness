/*
Version: 2
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
//Window to store timestamp for learning phase
CREATE WINDOW NewTGSSource_learning.win:length(1) (learningPhase long);
INSERT INTO NewTGSSource_learning
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to store new data
@RSAPersist	
CREATE WINDOW NewTGSSource.win:keepall().std:unique(ip_src) (ip_src string, time long);

//For incoming events, if value already exists, update timestamp, if not, create new entry
ON Event(medium = 1 AND isOneOfIgnoreCase(action,{'kerberos tgs request'})) as e
MERGE NewTGSSource as w
WHERE w.ip_src = e.ip_src
WHEN MATCHED
    THEN UPDATE SET w.time = e.time
WHEN NOT MATCHED
    THEN INSERT SELECT e.ip_src as ip_src, e.time as time;

//Compare to ip_src stored in the window
@RSAAlert
SELECT *
FROM Event(ip_src NOT IN (SELECT ip_src FROM NewTGSSource) AND medium = 1 AND isOneOfIgnoreCase(action,{'kerberos tgs request'})
AND current_timestamp > (SELECT learningPhase FROM NewTGSSource_learning))
OUTPUT ALL EVERY ${group_hours?c} hours;

//Every day, clear values older than x days
ON PATTERN [every timer:interval(1 day)]
DELETE FROM NewTGSSource
WHERE time < current_timestamp.minus(${phaseout_days?c} days);