/*
Version: 3
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
//Window to store timestamp for learning phase
CREATE WINDOW NewSSHSource_learning.win:length(1) (learningPhase long);
INSERT INTO NewSSHSource_learning
SELECT current_timestamp<#if learning_days != 0>.plus(${learning_days?c} days)</#if> as learningPhase FROM PATTERN[Event];

//Window to store new data
@RSAPersist	
CREATE WINDOW NewSSHSource.win:time(${phaseout_days?c days).std:unique(ip_src) (ip_src string);

//Insert observed ip_src to learning window
INSERT INTO NewSSHSource
SELECT ip_src
FROM Event (service = 22);

//Compare to ip_src stored in the window and alert if new
@Name('${module_id}_Alert')
@RSAAlert
SELECT *
FROM Event(service = 22 AND ip_src NOT IN (SELECT ip_src FROM NewSSHSource)
AND current_timestamp > (SELECT learningPhase FROM NewSSHSource_learning))
OUTPUT ALL<#if group_hours != 0> EVERY ${group_hours?c} hours</#if>;