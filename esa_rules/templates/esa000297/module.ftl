/*
Version: 2
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>//Window to store timestamp for learning phase
CREATE WINDOW NewLolbasDownload_learning.win:length(1) (learningPhase long);
INSERT INTO NewLolbasDownload_learning
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to store new data
@RSAPersist	
CREATE WINDOW NewLolbasDownload.win:keepall().std:unique(ip_dst) (ip_dst string, time long);

//For incoming events, if value already exists, update timestamp, if not, create new entry
ON Event(filename IS NOT NULL AND direction = 'outbound' AND (client.toLowerCase() LIKE 'microsoft bits%' OR client.toLowerCase() LIKE 'certutil%' OR client.toLowerCase() LIKE 'microsoft office%') AND 'top 10k domain' != ALL( analysis_session )) as e
MERGE NewLolbasDownload as w
WHERE w.ip_dst = e.ip_dst
WHEN MATCHED
    THEN UPDATE SET w.time = e.time
WHEN NOT MATCHED
    THEN INSERT SELECT e.ip_dst as ip_dst, e.time as time;

//Compare to ip_dst stored in the window
@RSAAlert
SELECT *
FROM Event(ip_dst NOT IN (SELECT ip_dst FROM NewLolbasDownload) AND filename IS NOT NULL AND direction = 'outbound' AND (client.toLowerCase() LIKE 'microsoft bits%' OR client.toLowerCase() LIKE 'certutil%' OR client.toLowerCase() LIKE 'microsoft office%') AND 'top 10k domain' != ALL( analysis_session )
AND current_timestamp > (SELECT learningPhase FROM NewLolbasDownload_learning))
OUTPUT ALL EVERY ${group_hours?c} hours;

//Every day, clear values older than x days
ON PATTERN [every timer:interval(1 day)]
DELETE FROM NewLolbasDownload
WHERE time < current_timestamp.minus(${phaseout_days?c);