/*
Version: 3
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
//Window to store timestamp for learning phase
CREATE WINDOW NewLolbasDownload_learning.win:length(1) (learningPhase long);
INSERT INTO NewLolbasDownload_learning
SELECT current_timestamp<#if learning_days != 0>.plus(${learning_days?c} days)</#if> as learningPhase FROM PATTERN[Event];

//Window to store new data
@RSAPersist	
CREATE WINDOW NewLolbasDownload.win:time(${phaseout_days?c days).std:unique(ip_dst) (ip_dst string);

//Insert observed ip_dst to learning window
INSERT INTO NewLolbasDownload
SELECT ip_dst
FROM Event (
    filename IS NOT NULL
    AND direction = 'outbound'
    AND (
            client.toLowerCase() LIKE 'microsoft bits%'
            OR client.toLowerCase() LIKE 'certutil%'
            OR client.toLowerCase() LIKE 'microsoft office%'
    )
    AND 'top 10k domain' != ALL( analysis_session )
);

//Compare to ip_dst stored in the window and alert if new
@Name('${module_id}_Alert')
@RSAAlert
SELECT *
FROM Event(filename IS NOT NULL AND direction = 'outbound' AND (client.toLowerCase() LIKE 'microsoft bits%' OR client.toLowerCase() LIKE 'certutil%' OR client.toLowerCase() LIKE 'microsoft office%') AND 'top 10k domain' != ALL( analysis_session ) AND ip_dst NOT IN (SELECT ip_dst FROM NewLolbasDownload)
AND current_timestamp > (SELECT learningPhase FROM NewLolbasDownload_learning))
OUTPUT ALL<#if group_hours != 0> EVERY ${group_hours?c} hours</#if>;