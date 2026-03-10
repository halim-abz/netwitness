module ${module_id};
<#if module_debug>@Audit('stream')</#if>

/* 1. Schema for our baseline data */
@Name('Schema-HourlyBandwidth')
create schema HourlyBandwidthEvent as (
    ip_src string,
    dow int,	/* Day of Week (1-7) */
    hod int,	/* Hour of Day (0-23) */   
    week_id int,	/* Week ID (0-3) */
    bandwidth long 	/* Total Bytes transferred */
);

/* 2. Window to hold the baseline aggregates */
@RSAPersist
@Name('Window-HourlyBandwidth')
create window HourlyBandwidthWindow.win:time(30 days).std:unique(ip_src, dow, hod, week_id) as HourlyBandwidthEvent;

/* 3. Tumbling context for the top of the hour */
@Name('Context-HourlyBatch')
create context HourlyBatch start (0, *, *, *, *) end (0, *, *, *, *);

/* * 4. INTERMEDIATE AGGREGATION
 * Aggregates the hour's data safely. Subtracts 1ms from the timestamp 
 * to ensure DOW/HOD evaluate to the hour that just ended.
 */
@Name('Rule-Aggregate-CurrentHour')
context HourlyBatch
insert into CurrentHourAgg
select
    ip_src,
    cast((((current_timestamp - 1) / 86400000) + 4) % 7, int) as dow,
    cast(((current_timestamp - 1) / 3600000) % 24, int) as hod,
    cast(((current_timestamp - 1) / 604800000) % 4, int) as week_id,
    sum(size) as bandwidth
from Event(direction = 'outbound')
group by ip_src
output snapshot when terminated;

/* 5. Populate the baseline window from the intermediate stream */
@Name('Rule-Populate-Baseline')
insert into HourlyBandwidthWindow
select 
    ip_src, 
    dow, 
    hod, 
    week_id, 
    bandwidth
from CurrentHourAgg;

/* * 6. The Alert Rule 
 * Uses a JOIN instead of subqueries for efficiency.
 */
@Name('${module_id}_Alert')
@RSAAlert(identifiers={"anomalous_ip"})
select 
    c.ip_src as anomalous_ip,
    max(c.bandwidth) as current_bandwidth,
    avg(h.bandwidth) as historical_avg_bandwidth
from CurrentHourAgg as c unidirectional, HourlyBandwidthWindow as h 
where
    c.ip_src = h.ip_src
    and c.dow = h.dow 
    and (c.hod = h.hod or c.hod = h.hod -1 or c.hod = h.hod +1)    /* compare with same hour +/- 1 hour */
    and c.week_id != h.week_id
group by c.ip_src
having count(h.bandwidth) >= 2	/* ensure we have at least 2 weeks of historical data */
   and max(c.bandwidth) > (avg(h.bandwidth) * 3)
   and max(c.bandwidth) > 52428800; /* don't trigger for anything below 50 MB */
