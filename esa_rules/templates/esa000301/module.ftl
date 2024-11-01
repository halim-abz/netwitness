/*
Version: 1
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>//Update learning phase to desired number of days
CREATE WINDOW NewSSHSource_learning.win:length(1) (learningPhase long);
INSERT INTO NewSSHSource_learning
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to store new data
@RSAPersist	
CREATE WINDOW NewSSHSource.win:keepall().std:unique(ip_src) (ip_src string, time long);

//For incoming events, if value already exists, update timestamp, if not, create new entry
ON Event(service = 22) as e
MERGE NewSSHSource as w
WHERE w.ip_src = e.ip_src
WHEN MATCHED
    THEN UPDATE SET w.time = e.time
WHEN NOT MATCHED
    THEN INSERT SELECT e.ip_src as ip_src, e.time as time;

//Compare to ip_src stored in the window
@RSAAlert
SELECT *
FROM Event(ip_src NOT IN (SELECT ip_src FROM NewSSHSource) AND service = 22
AND current_timestamp > (SELECT learningPhase FROM NewSSHSource_learning))
OUTPUT ALL EVERY ${group_hours?c} hours;

//Every day, clear values older than x days
ON PATTERN [every timer:interval(1 day)]
DELETE FROM NewSSHSource
WHERE time < current_timestamp.minus(${phaseout_days?c);