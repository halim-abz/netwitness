/*
Version: 2
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
//Window to store timestamp for learning phase
CREATE WINDOW NewTGSDest_learning.win:length(1) (learningPhase long);
INSERT INTO NewTGSDest_learning
SELECT current_timestamp<#if learning_days != 0>.plus(${learning_days?c} days)</#if> as learningPhase FROM PATTERN[Event];

//Window to store new data
@RSAPersist	
CREATE WINDOW NewTGSDest.win:keepall().std:unique(ip_dst) (ip_dst string, time long);

//For incoming events, if value already exists, update timestamp, if not, create new entry
ON Event(medium = 1 AND isOneOfIgnoreCase(action,{'kerberos tgs request'})) as e
MERGE NewTGSDest as w
WHERE w.ip_dst = e.ip_dst
WHEN MATCHED
    THEN UPDATE SET w.time = e.time
WHEN NOT MATCHED
    THEN INSERT SELECT e.ip_dst as ip_dst, e.time as time;

//Compare to ip_dst stored in the window
@RSAAlert
SELECT *
FROM Event(ip_dst NOT IN (SELECT ip_dst FROM NewTGSDest) AND medium = 1 AND isOneOfIgnoreCase(action,{'kerberos tgs request'})
AND current_timestamp > (SELECT learningPhase FROM NewTGSDest_learning))
OUTPUT ALL<#if group_hours != 0> EVERY ${group_hours?c} hours</#if>;

//Every day, clear values older than x days
ON PATTERN [every timer:interval(1 day)]
DELETE FROM NewTGSDest
WHERE time < current_timestamp.minus(${phaseout_days?c} days);