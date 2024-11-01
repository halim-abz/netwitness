/*
Version: 1
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>//Window to store timestamp for learning phase
CREATE WINDOW NewPS1Download_learning.win:length(1) (learningPhase long);
INSERT INTO NewPS1Download_learning
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to store new data
@RSAPersist	
CREATE WINDOW NewPS1Download.win:keepall().std:unique(ip_src) (ip_src string, time long);

//For incoming events, if value already exists, update timestamp, if not, create new entry
ON Event(filename IS NOT NULL AND direction = 'outbound' AND extension.toLowerCase() LIKE 'ps1') as e
MERGE NewPS1Download as w
WHERE w.ip_src = e.ip_src
WHEN MATCHED
    THEN UPDATE SET w.time = e.time
WHEN NOT MATCHED
    THEN INSERT SELECT e.ip_src as ip_src, e.time as time;

//Compare to ip_src stored in the window
@RSAAlert
SELECT *
FROM Event(ip_src NOT IN (SELECT ip_src FROM NewPS1Download) AND filename IS NOT NULL AND direction = 'outbound' AND extension.toLowerCase() LIKE 'ps1'
AND current_timestamp > (SELECT learningPhase FROM NewPS1Download_learning))
OUTPUT ALL EVERY ${group_hours?c} hours;

//Every day, clear values older than x days
ON PATTERN [every timer:interval(1 day)]
DELETE FROM NewPS1Download
WHERE time < current_timestamp.minus(${phaseout_days?c);