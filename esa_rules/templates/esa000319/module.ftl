/*
Version: 2
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
//Window to store timestamp for learning phase
CREATE WINDOW NewUserKrbtgt_learning.win:length(1) (learningPhase long);
INSERT INTO NewUserKrbtgt_learning
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to store new data
@RSAPersist	
CREATE WINDOW NewUserKrbtgt.win:keepall().std:unique(ad_username_src) (ad_username_src string, time long);

//For incoming events, if value already exists, update timestamp, if not, create new entry
ON Event(medium = 1 AND isOneOfIgnoreCase(action,{'kerberos tgs request'}) AND ad_username_dst IN ('krbtgt')) as e
MERGE NewUserKrbtgt as w
WHERE w.ad_username_src = e.ad_username_src
WHEN MATCHED
    THEN UPDATE SET w.time = e.time
WHEN NOT MATCHED
    THEN INSERT SELECT e.ad_username_src as ad_username_src, e.time as time;

//Compare to ad_username_src stored in the window
@RSAAlert
SELECT *
FROM Event(ad_username_src NOT IN (SELECT ad_username_src FROM NewUserKrbtgt) AND medium = 1 AND isOneOfIgnoreCase(action,{'kerberos tgs request'}) AND ad_username_dst IN ('krbtgt')
AND current_timestamp > (SELECT learningPhase FROM NewUserKrbtgt_learning))
OUTPUT ALL EVERY ${group_hours?c} hours;

//Every day, clear values older than x days
ON PATTERN [every timer:interval(1 day)]
DELETE FROM NewUserKrbtgt
WHERE time < current_timestamp.minus(${phaseout_days?c} days);