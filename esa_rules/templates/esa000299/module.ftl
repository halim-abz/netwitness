/*
Version: 3
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
//Window to store timestamp for learning phase
CREATE WINDOW NewEXEDownload_learning.win:length(1) (learningPhase long);
INSERT INTO NewEXEDownload_learning
SELECT current_timestamp<#if learning_days != 0>.plus(${learning_days?c} days)</#if> as learningPhase FROM PATTERN[Event];

//Window to store new data
@RSAPersist	
CREATE WINDOW NewEXEDownload.win:time(${phaseout_days?c days).std:unique(ip_dst) (ip_dst string);

//Insert observed ip_dst to learning window
INSERT INTO NewEXEDownload
SELECT ip_dst
FROM Event (
    direction = 'outbound'
    AND filetype.toLowerCase() IN ('windows executable')
);

//Compare to ip_dst stored in the window and alert if new
@Name('${module_id}_Alert')
@RSAAlert
SELECT *
FROM Event(direction = 'outbound' AND filetype.toLowerCase() IN ('windows executable') AND ip_dst NOT IN (SELECT ip_dst FROM NewEXEDownload)
AND current_timestamp > (SELECT learningPhase FROM NewEXEDownload_learning))
OUTPUT ALL<#if group_hours != 0> EVERY ${group_hours?c} hours</#if>;