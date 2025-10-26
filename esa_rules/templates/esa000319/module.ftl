/*
Version: 3
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
//Window to store timestamp for learning phase
CREATE WINDOW NewUserKrbtgt_learning.win:length(1) (learningPhase long);
INSERT INTO NewUserKrbtgt_learning
SELECT current_timestamp<#if learning_days != 0>.plus(${learning_days?c} days)</#if> as learningPhase FROM PATTERN[Event];

//Window to store new data
@RSAPersist	
CREATE WINDOW NewUserKrbtgt.win:time(${phaseout_days?c days).std:unique(ad_username_src) (ad_username_src string);

//Insert observed ad_username_src to learning window
INSERT INTO NewUserKrbtgt
SELECT ad_username_src
FROM Event (
    medium = 1
    AND isOneOfIgnoreCase(action,{'kerberos tgs request'})
    AND ad_username_dst IN ('krbtgt')
);

//Compare to ad_username_src stored in the window and alert if new
@Name('${module_id}_Alert')
@RSAAlert
SELECT *
FROM Event(medium = 1 AND isOneOfIgnoreCase(action,{'kerberos tgs request'}) AND ad_username_dst IN ('krbtgt') AND ad_username_src NOT IN (SELECT ad_username_src FROM NewUserKrbtgt)
AND current_timestamp > (SELECT learningPhase FROM NewUserKrbtgt_learning))
OUTPUT ALL<#if group_hours != 0> EVERY ${group_hours?c} hours</#if>;