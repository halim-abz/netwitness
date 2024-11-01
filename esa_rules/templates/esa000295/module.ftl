/*
Version: 2
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>//Window to store timestamp for learning phase
CREATE WINDOW NewSSHDest_learning.win:length(1) (learningPhase long);
INSERT INTO NewSSHDest_learning
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to store new data
@RSAPersist	
CREATE WINDOW NewSSHDest.win:keepall().std:unique(ip_dst) (ip_dst string, time long);

//For incoming events, if value already exists, update timestamp, if not, create new entry
ON Event(service = 22 AND direction = 'outbound') as e
MERGE NewSSHDest as w
WHERE w.ip_dst = e.ip_dst
WHEN MATCHED
    THEN UPDATE SET w.time = e.time
WHEN NOT MATCHED
    THEN INSERT SELECT e.ip_dst as ip_dst, e.time as time;

//Compare to ip_dst stored in the window
@RSAAlert
SELECT *
FROM Event(ip_dst NOT IN (SELECT ip_dst FROM NewSSHDest) AND service = 22 AND direction = 'outbound'
AND current_timestamp > (SELECT learningPhase FROM NewSSHDest_learning))
OUTPUT ALL EVERY ${group_hours?c} hours;

//Every day, clear values older than x days
ON PATTERN [every timer:interval(1 day)]
DELETE FROM NewSSHDest
WHERE time < current_timestamp.minus(${phaseout_days?c});