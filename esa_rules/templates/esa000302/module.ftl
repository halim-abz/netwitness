/*
Version: 1
*/
module ${module_id};

<#if module_debug>@Audit('stream')</#if>//Update learning phase to desired number of days
CREATE WINDOW NewCA_learning.win:length(1) (learningPhase long);
INSERT INTO NewCA_learning
SELECT current_timestamp.plus(${learning_days?c} days) as learningPhase FROM PATTERN[Event];

//Window to store new data
@RSAPersist	
CREATE WINDOW NewCA.win:keepall().std:unique(ssl_ca) (ssl_ca string, time long);

//For incoming events, if value already exists, update timestamp, if not, create new entry
ON Event(ssl_ca IS NOT NULL) as e
MERGE NewCA as w
WHERE w.ssl_ca = e.ssl_ca
WHEN MATCHED
    THEN UPDATE SET w.time = e.time
WHEN NOT MATCHED
    THEN INSERT SELECT e.ssl_ca as ssl_ca, e.time as time;

//Compare to ssl_ca stored in the window
@RSAAlert
SELECT *
FROM Event(ssl_ca NOT IN (SELECT ssl_ca FROM NewCA) AND ssl_ca IS NOT NULL
AND current_timestamp > (SELECT learningPhase FROM NewCA_learning))
OUTPUT ALL EVERY ${group_hours?c} hours;

//Every day, clear values older than x days
ON PATTERN [every timer:interval(1 day)]
DELETE FROM NewCA
WHERE time < current_timestamp.minus(${phaseout_days?c);