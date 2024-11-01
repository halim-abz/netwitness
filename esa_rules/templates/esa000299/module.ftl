/*
Version: 2
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>//Window to store timestamp for learning phase
CREATE WINDOW NewEXEDownload_learning.win:length(1) (learningPhase long);
INSERT INTO NewEXEDownload_learning
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to store new data
@RSAPersist	
CREATE WINDOW NewEXEDownload.win:keepall().std:unique(ip_dst) (ip_dst string, time long);

//For incoming events, if value already exists, update timestamp, if not, create new entry
ON Event(direction = 'outbound' AND filetype.toLowerCase() IN ('windows executable')) as e
MERGE NewEXEDownload as w
WHERE w.ip_dst = e.ip_dst
WHEN MATCHED
    THEN UPDATE SET w.time = e.time
WHEN NOT MATCHED
    THEN INSERT SELECT e.ip_dst as ip_dst, e.time as time;

//Compare to ip_dst stored in the window
@RSAAlert
SELECT *
FROM Event(ip_dst NOT IN (SELECT ip_dst FROM NewEXEDownload) AND direction = 'outbound' AND filetype.toLowerCase() IN ('windows executable')
AND current_timestamp > (SELECT learningPhase FROM NewEXEDownload_learning))
OUTPUT ALL EVERY ${group_hours?c} hours;

//Every day, clear values older than x days
ON PATTERN [every timer:interval(1 day)]
DELETE FROM NewEXEDownload
WHERE time < current_timestamp.minus(${phaseout_days?c);