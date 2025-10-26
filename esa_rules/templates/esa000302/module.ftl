/*
Version: 3
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>
//Window to store timestamp for learning phase
CREATE WINDOW NewCA_learning.win:length(1) (learningPhase long);
INSERT INTO NewCA_learning
SELECT current_timestamp<#if learning_days != 0>.plus(${learning_days?c} days)</#if> as learningPhase FROM PATTERN[Event];

//Window to store new data
@RSAPersist	
CREATE WINDOW NewCA.win:time(${phaseout_days?c days).std:unique(ssl_ca) (ssl_ca string);

//Insert observed ssl_ca to learning window
INSERT INTO NewCA
SELECT ssl_ca
FROM Event (ssl_ca IS NOT NULL);

//Compare to ssl_ca stored in the window and alert if new
@Name('${module_id}_Alert')
@RSAAlert
SELECT *
FROM Event(ssl_ca IS NOT NULL AND ssl_ca NOT IN (SELECT ssl_ca FROM NewCA)
AND current_timestamp > (SELECT learningPhase FROM NewCA_learning))
OUTPUT ALL<#if group_hours != 0> EVERY ${group_hours?c} hours</#if>;