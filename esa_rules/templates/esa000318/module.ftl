/*
Version: 2
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
//Window to store timestamp for learning phase
CREATE WINDOW NewSrcCopyExe_learning.win:length(1) (learningPhase long);
INSERT INTO NewSrcCopyExe_learning
SELECT current_timestamp<#if learning_days != 0>.plus(${learning_days?c} days)</#if> as learningPhase FROM PATTERN[Event];

//Window to store new data
@RSAPersist	
CREATE WINDOW NewSrcCopyExe.win:keepall().std:unique(ip_src) (ip_src string, time long);

//For incoming events, if value already exists, update timestamp, if not, create new entry
ON Event(service = 139 AND 'put' = ANY(action) AND filetype IN ('windows executable')) as e
MERGE NewSrcCopyExe as w
WHERE w.ip_src = e.ip_src
WHEN MATCHED
    THEN UPDATE SET w.time = e.time
WHEN NOT MATCHED
    THEN INSERT SELECT e.ip_src as ip_src, e.time as time;

//Compare to ip_src stored in the window
@RSAAlert
SELECT *
FROM Event(ip_src NOT IN (SELECT ip_src FROM NewSrcCopyExe) AND service = 139 AND 'put' = ANY(action) AND filetype IN ('windows executable')
AND current_timestamp > (SELECT learningPhase FROM NewSrcCopyExe_learning))
OUTPUT ALL<#if group_hours != 0> EVERY ${group_hours?c} hours</#if>;

//Every day, clear values older than x days
ON PATTERN [every timer:interval(1 day)]
DELETE FROM NewSrcCopyExe
WHERE time < current_timestamp.minus(${phaseout_days?c} days);