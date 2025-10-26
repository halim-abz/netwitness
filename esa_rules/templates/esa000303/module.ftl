/*
Version: 3
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
//Window to store timestamp for learning phase
CREATE WINDOW NewSSHClient_learning.win:length(1) (learningPhase long);
INSERT INTO NewSSHClient_learning
SELECT current_timestamp<#if learning_days != 0>.plus(${learning_days?c} days)</#if> as learningPhase FROM PATTERN[Event];

//Window to store new data
@RSAPersist	
CREATE WINDOW NewSSHClient.win:time(${phaseout_days?c days).std:unique(client) (client string);

//Insert observed clients to learning window
INSERT INTO NewSSHClient
SELECT client
FROM Event (
    client IS NOT NULL
    AND service = 22
    );

//Compare to client stored in the window and alert if new
@Name('${module_id}_Alert')
@RSAAlert
SELECT *
FROM Event(client IS NOT NULL AND service = 22 AND client NOT IN (SELECT client FROM NewSSHClient)
AND current_timestamp > (SELECT learningPhase FROM NewSSHClient_learning))
OUTPUT ALL<#if group_hours != 0> EVERY ${group_hours?c} hours</#if>;