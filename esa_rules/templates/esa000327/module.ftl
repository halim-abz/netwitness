module ${module_id};
<#if module_debug>@Audit('stream')</#if>

/* Create the window to hold the intervals between each beacon for up to 24 hours */
@RSAPersist
create window Beacon_Intervals.std:groupwin(ip_src, ip_dst, tcp_dstport).win:time(24 hours).win:length(10) (
    ip_src string, 
    ip_dst string, 
    tcp_dstport integer, 
    interval_ms double
);

/* Step 1: Calculate the interval between the current and previous event */
INSERT INTO Beacon_Intervals
SELECT 
    ip_src, 
    ip_dst, 
    tcp_dstport,
    cast(time - prev(1, time), double) AS interval_ms
FROM 
    Event(
        direction IN ('outbound')
        AND tcp_dstport IS NOT NULL
        AND service IN (443,80)
        AND 'top 10k domain' != ALL( analysis_session )
        AND (cast(tcp_flags, int) & 2) != 0    //Syn flag must be enabled
    )
.std:groupwin(ip_src, ip_dst, tcp_dstport).win:length(2)
WHERE prev(1, time) IS NOT NULL;

@RSAAlert
/* Step 2: Measure the difference between the max and min intervals */
SELECT 
    ip_src, 
    ip_dst, 
    tcp_dstport,
    COUNT(*) AS total_connections,
    MAX(interval_ms) as jitter_max,
    MIN(interval_ms) as jitter_min,
    AVG(interval_ms) as jitter_avg,
    STDDEV(interval_ms) as jitter_stddev,
    (STDDEV(interval_ms) / AVG(interval_ms)) AS jitter_percent
FROM 
    Beacon_Intervals
GROUP BY 
    ip_src, 
    ip_dst, 
    tcp_dstport
HAVING 
    COUNT(*) >= 5    /* Triggers for at least 5 beacons */
    AND (STDDEV(interval_ms) / AVG(interval_ms)) <= 0.25    /* Trigger if the jitter percentage is less than 25% of the interval */
    AND AVG(interval_ms) > 5000    /* Triggers for at least 5sec jitetrs */
OUTPUT FIRST EVERY 24 hour;