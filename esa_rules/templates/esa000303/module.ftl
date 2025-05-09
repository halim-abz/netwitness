/*
Version: 2
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
//Window to store timestamp for learning phase
CREATE WINDOW NewSSHClient_learning.win:length(1) (learningPhase long);
INSERT INTO NewSSHClient_learning
SELECT current_timestamp<#if learning_days != 0>.plus(${learning_days?c} days)</#if> as learningPhase FROM PATTERN[Event];

//Window to store new data
@RSAPersist	
CREATE WINDOW NewSSHClient.win:keepall().std:unique(client) (client string, time long);

//For incoming events, if value already exists, update timestamp, if not, create new entry
ON Event(client IS NOT NULL AND service = 22) as e
MERGE NewSSHClient as w
WHERE w.client = e.client
WHEN MATCHED
    THEN UPDATE SET w.time = e.time
WHEN NOT MATCHED
    THEN INSERT SELECT e.client as client, e.time as time;

//Compare to client stored in the window
@RSAAlert
SELECT *
FROM Event(client NOT IN (SELECT client FROM NewSSHClient) AND client IS NOT NULL AND service = 22
AND current_timestamp > (SELECT learningPhase FROM NewSSHClient_learning))
OUTPUT ALL<#if group_hours != 0> EVERY ${group_hours?c} hours</#if>;

//Every day, clear values older than x days
ON PATTERN [every timer:interval(1 day)]
DELETE FROM NewSSHClient
WHERE time < current_timestamp.minus(${phaseout_days?c} days);