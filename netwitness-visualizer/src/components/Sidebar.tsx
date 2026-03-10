import React, { useState } from "react";
import { Play, Settings, Server, Filter } from "lucide-react";

const OPTIONAL_METAKEYS = [
  "service",
  "client",
  "server",
  "user.all",
  "email.all",
  "domain",
  "alias.host",
  "country",
  "org",
  "ioc",
  "boc",
  "eoc",
  "filename.all",
  "filetype",
  "ssl.ca",
  "ssl.subject",
  "action",
  "tcp.dstport",
  "udp.dstport",
  "ja3",
  "ja3s",
  "ja4",
  "eth.src",
  "eth.dst",
  "latdec.src",
  "latdec.dst",
  "longdec.src",
  "longdec.dst"
];

interface SidebarProps {
  onQuery: (config: QueryConfig) => void;
  isLoading: boolean;
  onCancel: () => void;
  onClose?: () => void;
}

export interface QueryConfig {
  host: string;
  port: string;
  query: string;
  size: number;
  metakeys: string[];
  username?: string;
  password?: string;
  timeRange: string;
}

const TIME_RANGES = [
  { label: "Last 5 Minutes", value: "5m" },
  { label: "Last 30 Minutes", value: "30m" },
  { label: "Last 1 Hour", value: "1h" },
  { label: "Last 5 Hours", value: "5h" },
  { label: "Last 1 Day", value: "24h" },
  { label: "Last 3 Days", value: "72h" },
  { label: "Last 1 Week", value: "168h" },
  { label: "All Data", value: "all" },
];

export default function Sidebar({ onQuery, isLoading, onCancel, onClose }: SidebarProps) {
  const [host, setHost] = useState("10.10.10.26");
  const [port, setPort] = useState("50105");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("netwitness");
  const [query, setQuery] = useState("ip.src exists");
  const [size, setSize] = useState(10000);
  const [timeRange, setTimeRange] = useState("5m");
  const [customMetakeys, setCustomMetakeys] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    new Set(OPTIONAL_METAKEYS),
  );

  const handleToggleKey = (key: string) => {
    const newKeys = new Set(selectedKeys);
    if (newKeys.has(key)) {
      newKeys.delete(key);
    } else {
      newKeys.add(key);
    }
    setSelectedKeys(newKeys);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const customKeysArray = customMetakeys
      .split(",")
      .map(k => k.trim())
      .filter(k => k.length > 0);
      
    onQuery({
      host,
      port,
      query,
      size,
      username,
      password,
      timeRange,
      metakeys: ["ip.src", "ip.dst", "size", "netname", "direction", ...selectedKeys, ...customKeysArray],
    });
  };

  return (
    <div className="w-80 max-w-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full overflow-hidden shadow-xl z-10 transition-colors duration-200">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center gap-2 transition-colors duration-200">
      <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="12 -5 278 307">
        <path d="M0 0 C8.76956244 5.42496655 14.1394252 12.18163916 17.015625 22.07421875 C19.31692268 32.66284854 17.71314152 40.44632477 12.41796875 49.828125 C10.91284858 52.30199945 10.91284858 52.30199945 11.140625 55.32421875 C12.469097 57.47012064 12.469097 57.47012064 14.2890625 59.71875 C14.959375 60.58435547 15.6296875 61.44996094 16.3203125 62.34179688 C17.04476562 63.26412109 17.76921875 64.18644531 18.515625 65.13671875 C20.00423239 67.05863581 21.49121476 68.98181262 22.9765625 70.90625 C23.6994043 71.84162598 24.42224609 72.77700195 25.16699219 73.74072266 C27.9672701 77.40630169 30.62116272 81.15923114 33.27099609 84.93481445 C37.09197916 90.3348531 41.11642121 95.57469203 45.140625 100.82421875 C50.47199977 107.7815176 55.69335613 114.78758724 60.74609375 121.94921875 C63.5365286 125.90203857 66.40021488 129.80057031 69.265625 133.69921875 C69.75200439 134.36099121 70.23838379 135.02276367 70.73950195 135.70458984 C71.87250679 137.24498336 73.0064564 138.7846819 74.140625 140.32421875 C75.213125 139.99421875 76.285625 139.66421875 77.390625 139.32421875 C81.140625 138.32421875 81.140625 138.32421875 85.140625 138.32421875 C85.13460667 135.73633674 85.08721547 133.16042446 85.015625 130.57421875 C85.01820313 129.84460938 85.02078125 129.115 85.0234375 128.36328125 C84.99382203 125.90400277 84.99382203 125.90400277 84.140625 122.32421875 C81.36596256 119.92578119 81.36596256 119.92578119 78.140625 118.32421875 C73.40286747 114.07238507 70.6929501 109.71047772 70.140625 103.32421875 C69.9591407 96.21230265 71.41740398 90.73045458 76.140625 85.32421875 C82.25019035 79.7601503 87.17232339 77.85847197 95.4140625 77.9921875 C101.28447715 78.70706607 106.18592076 81.06025096 110.06640625 85.5546875 C114.72146094 92.36506584 116.09662061 98.09621156 115.140625 106.32421875 C113.18832014 112.14062909 110.56104611 117.15128932 105.140625 120.32421875 C102.170625 121.31421875 102.170625 121.31421875 99.140625 122.32421875 C99.140625 127.60421875 99.140625 132.88421875 99.140625 138.32421875 C100.501875 138.73671875 101.863125 139.14921875 103.265625 139.57421875 C106.55000638 140.63984092 108.51305668 141.58921822 111.390625 143.63671875 C112.298125 144.19359375 113.205625 144.75046875 114.140625 145.32421875 C118.65575259 144.18007928 121.73854021 141.34789039 125.140625 138.32421875 C130.01806849 134.09242146 134.9826063 130.07091269 140.12524414 126.16381836 C144.3262804 122.96556563 148.46234801 119.69386911 152.578125 116.38671875 C157.66512809 112.30218172 162.76441477 108.23448868 167.890625 104.19921875 C168.47513428 103.73781494 169.05964355 103.27641113 169.66186523 102.80102539 C172.10756085 100.87912319 174.55073815 99.05080998 177.140625 97.32421875 C177.23041438 94.76222832 177.17354168 92.37120571 177.015625 89.82421875 C176.80969332 82.62465419 177.54510813 77.17710464 182.140625 71.32421875 C187.43792255 65.9252673 193.07813465 63.45361147 200.5859375 63.26171875 C208.49199185 63.64855933 213.43828872 66.62188247 218.953125 72.13671875 C223.06880981 78.13385947 225.15403077 84.01627858 224.140625 91.32421875 C222.70490915 97.94661981 219.06926473 102.77309185 214.140625 107.32421875 C208.40427734 110.81101831 202.86394641 112.16313586 196.140625 111.32421875 C194.71713326 110.62970323 193.30057605 109.92082709 191.890625 109.19921875 C189.62419475 108.23880458 189.62419475 108.23880458 187.140625 108.32421875 C183.22695805 110.66239815 180.06082047 113.69869762 176.77490234 116.82177734 C174.07247688 119.30620015 171.1714819 121.52240212 168.265625 123.76171875 C167.07771752 124.68958272 165.89021969 125.61797138 164.703125 126.546875 C163.51570771 127.47276233 162.32820844 128.39854454 161.140625 129.32421875 C148.989465 138.80528505 136.96332966 148.43547504 125.140625 158.32421875 C125.3571875 158.87207031 125.57375 159.41992188 125.796875 159.984375 C128.57844148 167.90411291 128.38311208 175.03447029 128.140625 183.32421875 C131.72412638 185.07168155 135.31694259 186.79811706 138.91943359 188.50610352 C140.14218541 189.08934416 141.36229959 189.67814972 142.57958984 190.27270508 C144.33499021 191.12887541 146.10102642 191.96312857 147.8671875 192.796875 C149.45394287 193.55883179 149.45394287 193.55883179 151.07275391 194.33618164 C154.60578527 195.47402804 156.58809155 195.28988633 160.140625 194.32421875 C161.048125 193.80859375 161.955625 193.29296875 162.890625 192.76171875 C168.00679019 190.49879953 172.96296037 190.43155325 178.3515625 191.9453125 C183.808151 194.2972903 187.24448782 198.19334596 190.140625 203.32421875 C192.01366335 209.27253447 191.46722887 214.77414035 189.12109375 220.46875 C186.73139285 224.99109233 182.75491647 228.27342254 178.140625 230.32421875 C172.53739894 231.5844599 167.34063153 231.9090395 162.0234375 229.51953125 C158.25908933 227.12971685 155.39712039 224.15740459 153.140625 220.32421875 C153.005354 219.57438721 152.87008301 218.82455566 152.73071289 218.05200195 C151.91430436 213.65815673 151.20466347 211.11933427 147.5324707 208.37524414 C144.14624001 206.60679111 140.73511678 205.0917396 137.203125 203.63671875 C136.01009766 203.10111328 134.81707031 202.56550781 133.58789062 202.01367188 C127.94058594 199.21460767 127.94058594 199.21460767 121.86987305 198.59741211 C118.99826056 199.80435696 117.35403775 202.05574706 115.3125 204.33984375 C112.22581243 207.1600547 108.72508945 209.19344175 105.140625 211.32421875 C105.72894376 215.96204889 106.38345518 220.58383036 107.09985352 225.20361328 C107.33391171 226.77424569 107.54998743 228.34767128 107.74731445 229.92333984 C108.38699947 234.97382058 109.13761269 239.62112833 111.140625 244.32421875 C113.93159715 246.34086384 116.06828985 247.06908921 119.43066406 247.72680664 C124.83445867 248.9180756 128.42294204 252.88150814 131.51953125 257.28515625 C135.39209493 264.54452649 135.59414064 273.39432239 133.29296875 281.19921875 C130.20651382 288.06265751 125.34555391 293.60164787 118.30859375 296.484375 C110.82498793 298.46831489 102.74146223 298.53240741 95.640625 295.26171875 C89.34754743 291.58300674 84.87566824 286.61146313 82.61328125 279.62109375 C80.87803251 271.18864531 81.64679782 263.69234449 86.140625 256.32421875 C89.0042671 252.00086298 91.12865695 250.32900597 96.140625 248.32421875 C94.160625 237.10421875 92.180625 225.88421875 90.140625 214.32421875 C82.715625 212.34421875 82.715625 212.34421875 75.140625 210.32421875 C68.39955096 206.61662803 63.88498045 202.33475267 59.140625 196.32421875 C54.97317062 197.01478621 51.24887988 198.31797128 47.30859375 199.828125 C46.67198318 200.07086655 46.03537262 200.31360809 45.37947083 200.56370544 C43.36092078 201.33435183 41.34451599 202.11044312 39.328125 202.88671875 C37.95391444 203.41247127 36.57956683 203.93786572 35.20507812 204.46289062 C31.84866431 205.74585973 28.49415136 207.03371815 25.140625 208.32421875 C25.025979 209.33234619 24.91133301 210.34047363 24.79321289 211.37915039 C24.62952595 212.72678084 24.46535628 214.07435272 24.30078125 215.421875 C24.22686157 216.08336548 24.15294189 216.74485596 24.07678223 217.4263916 C22.81664754 227.51056528 18.36746538 235.32350469 10.515625 241.703125 C1.61611569 247.7776256 -7.86120431 249.72865944 -18.484375 247.86328125 C-28.24025254 245.27187628 -35.71168904 240.03929802 -40.859375 231.32421875 C-45.850623 222.5390003 -46.16482541 213.0848957 -44.26953125 203.26953125 C-41.31182721 193.64677064 -34.83256601 186.60793598 -26.109375 181.76171875 C-17.03671057 177.70380531 -7.89009821 177.21214279 1.5703125 180.24609375 C7.29694414 182.64814593 12.13628809 185.72206837 15.828125 190.76171875 C16.59125 191.60734375 17.354375 192.45296875 18.140625 193.32421875 C22.74852226 193.01262764 26.78577568 191.46966959 31.0703125 189.8203125 C31.70550812 189.57757095 32.34070374 189.33482941 32.99514771 189.08473206 C35.00403903 188.31565282 37.00982969 187.5388319 39.015625 186.76171875 C40.38521848 186.2358117 41.75500839 185.71041591 43.125 185.18554688 C46.46583337 183.90434097 49.80393353 182.61617909 53.140625 181.32421875 C53.12757324 180.51742676 53.11452148 179.71063477 53.10107422 178.87939453 C53.09092285 177.81188965 53.08077148 176.74438477 53.0703125 175.64453125 C53.05726074 174.59023926 53.04420898 173.53594727 53.03076172 172.44970703 C53.27686607 165.44831155 55.62855044 159.93060577 59.2578125 154.01953125 C59.79776855 153.13539551 60.33772461 152.25125977 60.89404297 151.34033203 C61.30541504 150.67501465 61.71678711 150.00969727 62.140625 149.32421875 C61.72925293 148.78756592 61.31788086 148.25091309 60.89404297 147.69799805 C51.76481111 135.77836472 42.74006376 123.79175317 33.8671875 111.68017578 C30.92219242 107.66162338 27.96958674 103.64868273 25.015625 99.63671875 C24.4371582 98.85087402 23.85869141 98.0650293 23.26269531 97.25537109 C18.96922071 91.4302424 14.63458348 85.63705039 10.28369141 79.85473633 C6.17512532 74.38808813 2.13768414 68.87307732 -1.859375 63.32421875 C-2.91125 63.65421875 -3.963125 63.98421875 -5.046875 64.32421875 C-14.8621978 66.71735399 -24.933012 66.24363658 -33.859375 61.32421875 C-41.4581845 55.8887327 -48.17670806 48.82633796 -49.859375 39.32421875 C-51.00804627 21.03963175 -51.00804627 21.03963175 -45.859375 13.32421875 C-45.35019531 12.545625 -44.84101562 11.76703125 -44.31640625 10.96484375 C-34.4727426 -2.82079047 -15.42674351 -7.47724813 0 0 Z M72.140625 160.32421875 C68.28694188 165.77091374 66.88344215 171.68890124 67.140625 178.32421875 C68.26583301 184.50788399 70.67055639 188.95574261 75.140625 193.32421875 C82.53008731 198.30372683 88.30838794 199.04902132 97.140625 198.32421875 C103.38088868 196.65612894 107.65289915 192.64816164 111.140625 187.32421875 C114.04855721 181.9472875 115.19127084 176.37794003 114.140625 170.32421875 C111.8326084 163.54377888 108.33691636 158.06421134 102.140625 154.32421875 C91.14011571 149.35319823 80.28896089 150.99067037 72.140625 160.32421875 Z " fill="#BE3B37" transform="translate(63.859375,2.67578125)"/>
      </svg>
        <h1 className="font-semibold text-slate-800 dark:text-slate-100 flex-1">NetWitness Visualizer</h1>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden p-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex-1 overflow-y-auto p-4 space-y-6"
      >
        {/* Connection Settings */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            <Server size={16} />
            <h2>Connection</h2>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-slate-500 dark:text-slate-400">Host / IP</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-cyan-500 transition-colors duration-200"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500 dark:text-slate-400">Port</label>
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-cyan-500 transition-colors duration-200"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-slate-500 dark:text-slate-400">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-cyan-500 transition-colors duration-200"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500 dark:text-slate-400">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-cyan-500 transition-colors duration-200"
              />
            </div>
          </div>
        </div>

        {/* Query Settings */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            <Filter size={16} />
            <h2>Query Parameters</h2>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">Where Condition</label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. ip.src=10.10.10.50"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-sm font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-cyan-500 transition-colors duration-200"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">Time Range</label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-cyan-500 transition-colors duration-200"
            >
              {TIME_RANGES.map((tr) => (
                <option key={tr.value} value={tr.value}>
                  {tr.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">Max Results (Size)</label>
            <input
              type="number"
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              min={1}
              max={10000}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-cyan-500 transition-colors duration-200"
              required
            />
          </div>
        </div>

        {/* Metakeys Selection */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            <Settings size={16} />
            <h2>Metakeys (Select)</h2>
          </div>

          <div className="space-y-2 pr-1">
            <div className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800 opacity-70 transition-colors duration-200">
              <input
                type="checkbox"
                checked
                disabled
                className="rounded text-indigo-600 dark:text-cyan-600 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
              />
              <span className="text-sm font-mono text-slate-700 dark:text-slate-400">ip.src</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800 opacity-70 transition-colors duration-200">
              <input
                type="checkbox"
                checked
                disabled
                className="rounded text-indigo-600 dark:text-cyan-600 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
              />
              <span className="text-sm font-mono text-slate-700 dark:text-slate-400">ip.dst</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800 opacity-70 transition-colors duration-200">
              <input
                type="checkbox"
                checked
                disabled
                className="rounded text-indigo-600 dark:text-cyan-600 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
              />
              <span className="text-sm font-mono text-slate-700 dark:text-slate-400">size</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800 opacity-70 transition-colors duration-200">
              <input
                type="checkbox"
                checked
                disabled
                className="rounded text-indigo-600 dark:text-cyan-600 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
              />
              <span className="text-sm font-mono text-slate-700 dark:text-slate-400">netname</span>
            </div>

            <div className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800 opacity-70 transition-colors duration-200">
              <input
                type="checkbox"
                checked
                disabled
                className="rounded text-indigo-600 dark:text-cyan-600 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
              />
              <span className="text-sm font-mono text-slate-700 dark:text-slate-400">direction</span>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              {OPTIONAL_METAKEYS.map((key) => (
                <label
                  key={key}
                  className="flex items-center gap-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md border border-transparent hover:border-slate-200 dark:hover:border-slate-700 cursor-pointer transition-colors duration-200"
                >
                  <input
                    type="checkbox"
                    checked={selectedKeys.has(key)}
                    onChange={() => handleToggleKey(key)}
                    className="rounded text-indigo-600 dark:text-cyan-500 focus:ring-indigo-500 dark:focus:ring-cyan-500 bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />
                  <span
                    className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate"
                    title={key}
                  >
                    {key}
                  </span>
                </label>
              ))}
            </div>
            
            <div className="mt-4 space-y-1">
              <label className="text-xs text-slate-500 dark:text-slate-400">Custom Metakeys (comma separated)</label>
              <input
                type="text"
                value={customMetakeys}
                onChange={(e) => setCustomMetakeys(e.target.value)}
                placeholder="e.g. user.dst, eth.type"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-sm font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-cyan-500 transition-colors duration-200"
              />
            </div>
          </div>
        </div>
      </form>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 transition-colors duration-200 flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 dark:bg-cyan-600 hover:bg-indigo-700 dark:hover:bg-cyan-500 disabled:bg-indigo-400 dark:disabled:bg-cyan-900 disabled:text-white/70 dark:disabled:text-slate-500 text-white py-2.5 px-4 rounded-lg font-medium transition-colors shadow-sm"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Play size={18} />
          )}
          {isLoading ? "Querying..." : "Run Query"}
        </button>
        {isLoading && (
          <button
            onClick={(e) => {
              e.preventDefault();
              onCancel();
            }}
            className="px-4 py-2.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 rounded-lg font-medium transition-colors border border-red-200 dark:border-red-800"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
