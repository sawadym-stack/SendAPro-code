import React, { useState, useEffect, useRef } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'
import {
  HeartPulse,
  Cpu,
  HardDrive,
  Database,
  Cable,
  Activity,
  Terminal,
  Settings,
  Trash2,
  RefreshCcw,
  Key,
  ShieldAlert,
  Play,
  CheckCircle,
  XCircle,
  ToggleLeft,
  ToggleRight
} from 'lucide-react'
import { Card, Button, Badge, Progress } from '../../components/ui'

interface LogEntry {
  timestamp: string
  type: 'info' | 'success' | 'warning' | 'error' | 'security'
  module: string
  message: string
}

interface TelemetryData {
  time: string
  cpu: number
  memory: number
  latency: number
}

export default function SystemHealthPage() {
  // Stats states
  const [cpuLoad, setCpuLoad] = useState(24)
  const [memoryLoad, setMemoryLoad] = useState(58)
  const [activeConnections, setActiveConnections] = useState(14)
  const [wsClients, setWsClients] = useState(32)
  const [postgresActive, setPostgresActive] = useState(12)
  const [redisHitRate, setRedisHitRate] = useState(94.2)
  const [uptime, setUptime] = useState({ days: 2, hours: 14, mins: 32, secs: 10 })

  // Operation loading states
  const [isFlushingCache, setIsFlushingCache] = useState(false)
  const [isRestartingWS, setIsRestartingWS] = useState(false)
  const [isRotatingKeys, setIsRotatingKeys] = useState(false)
  const [verboseLogging, setVerboseLogging] = useState(false)

  // Chart Telemetry History State (15 items)
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryData[]>([
    { time: '12:30', cpu: 18, memory: 56, latency: 45 },
    { time: '12:31', cpu: 22, memory: 56, latency: 38 },
    { time: '12:32', cpu: 25, memory: 57, latency: 42 },
    { time: '12:33', cpu: 19, memory: 57, latency: 35 },
    { time: '12:34', cpu: 32, memory: 58, latency: 68 },
    { time: '12:35', cpu: 45, memory: 59, latency: 110 },
    { time: '12:36', cpu: 28, memory: 58, latency: 48 },
    { time: '12:37', cpu: 23, memory: 58, latency: 39 },
    { time: '12:38', cpu: 20, memory: 58, latency: 42 },
    { time: '12:39', cpu: 26, memory: 58, latency: 37 },
    { time: '12:40', cpu: 24, memory: 58, latency: 40 }
  ])

  // Terminal Log State
  const [logs, setLogs] = useState<LogEntry[]>([
    { timestamp: '12:30:00', type: 'info', module: 'SYSTEM', message: 'SendAPro Production Gateway starting up...' },
    { timestamp: '12:30:02', type: 'success', module: 'DATABASE', message: 'PostgreSQL connection pool initialized: 50 pool size max' },
    { timestamp: '12:30:03', type: 'success', module: 'CACHE', message: 'Redis cache connected at redis://localhost:6379' },
    { timestamp: '12:30:05', type: 'info', module: 'GATEWAY', message: 'WebSocket server listening on ws://localhost:8085' },
    { timestamp: '12:31:40', type: 'info', module: 'AUTH', message: 'JWT Verification module loaded with HMAC-SHA256 authorization' },
    { timestamp: '12:32:15', type: 'success', module: 'SCHEDULER', message: 'Cron manager registered: 4 background workers running' },
    { timestamp: '12:34:02', type: 'warning', module: 'WEBSOCKET', message: 'Client #78fa: latency spike detected (280ms)' },
    { timestamp: '12:35:10', type: 'info', module: 'API', message: 'GET /api/v1/admin/analytics - Status 200 - UserID 0021ae' },
    { timestamp: '12:37:55', type: 'info', module: 'SCHEDULER', message: 'Checked pending technician registration documents: 3 awaiting verification' },
    { timestamp: '12:40:02', type: 'info', module: 'API', message: 'GET /api/v1/admin/users - Status 200 - UserID 0021ae' }
  ])

  const terminalEndRef = useRef<HTMLDivElement>(null)

  // Autoscroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Tick Uptime clock and update telemetry charts
  useEffect(() => {
    const timer = setInterval(() => {
      // 1. Tick Uptime
      setUptime((prev) => {
        let s = prev.secs + 1
        let m = prev.mins
        let h = prev.hours
        let d = prev.days
        if (s >= 60) {
          s = 0
          m += 1
        }
        if (m >= 60) {
          m = 0
          h += 1
        }
        if (h >= 24) {
          h = 0
          d += 1
        }
        return { days: d, hours: h, mins: m, secs: s }
      })

      // 2. Generate new telemetry point
      const now = new Date()
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`

      // CPU fluctuations
      const nextCpu = Math.max(10, Math.min(95, Math.floor(cpuLoad + (Math.random() * 20 - 10))))
      // Memory slow organic growth/movement
      const nextMemory = Math.max(40, Math.min(85, Math.floor(memoryLoad + (Math.random() * 2 - 1))))
      // Latency spike simulation
      const hasSpike = Math.random() > 0.92
      const nextLatency = hasSpike ? Math.floor(Math.random() * 180 + 120) : Math.floor(Math.random() * 30 + 30)

      setCpuLoad(nextCpu)
      setMemoryLoad(nextMemory)

      setTelemetryHistory((prev) => {
        const nextList = [...prev, { time: timeStr, cpu: nextCpu, memory: nextMemory, latency: nextLatency }]
        if (nextList.length > 15) {
          nextList.shift()
        }
        return nextList
      })

      // 3. Generate random background logs sometimes
      if (Math.random() > 0.65) {
        const modules = ['API', 'WEBSOCKET', 'SCHEDULER', 'AUTH', 'CACHE']
        const chosenModule = modules[Math.floor(Math.random() * modules.length)]
        let type: 'info' | 'success' | 'warning' | 'error' = 'info'
        let message = ''

        if (chosenModule === 'API') {
          const endpoints = ['/api/v1/jobs', '/api/v1/disputes', '/api/v1/reports', '/api/v1/users']
          const ep = endpoints[Math.floor(Math.random() * endpoints.length)]
          const status = Math.random() > 0.98 ? 500 : Math.random() > 0.94 ? 404 : 200
          type = status === 200 ? 'info' : status === 404 ? 'warning' : 'error'
          message = `${status === 200 ? 'GET' : 'POST'} ${ep} - Status ${status} - Latency ${nextLatency}ms`
        } else if (chosenModule === 'WEBSOCKET') {
          const acts = [
            `Client ping-pong latency: ${nextLatency}ms`,
            `Broadcasting metrics_update telemetry data to admin clients`,
            `WebSocket subscription established for channel admin:all`,
            `Connection pool size: ${wsClients} active clients`
          ]
          message = acts[Math.floor(Math.random() * acts.length)]
          type = nextLatency > 100 ? 'warning' : 'info'
        } else if (chosenModule === 'SCHEDULER') {
          message = 'Synchronized technician active field state queues'
          type = 'success'
        } else if (chosenModule === 'AUTH') {
          message = 'Refreshed user OAuth tokens for active worker'
          type = 'info'
        } else {
          message = `Evicted ${Math.floor(Math.random() * 12)} stale session cache entries`
          type = 'info'
        }

        const logTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
        setLogs((prevLogs) => [
          ...prevLogs,
          { timestamp: logTime, type, module: chosenModule, message }
        ])
      }
    }, 2500)

    return () => clearInterval(timer)
  }, [cpuLoad, memoryLoad, wsClients])

  // Control Actions
  const appendSystemLog = (type: 'info' | 'success' | 'warning' | 'error' | 'security', module: string, message: string) => {
    const now = new Date()
    const logTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
    setLogs((prev) => [...prev, { timestamp: logTime, type, module, message }])
  }

  const handleFlushCache = () => {
    setIsFlushingCache(true)
    appendSystemLog('info', 'SYSTEM', 'Triggering manual flush of Redis cache database...')
    setTimeout(() => {
      setIsFlushingCache(false)
      setRedisHitRate(92.0)
      appendSystemLog('success', 'CACHE', 'Redis database flush complete: Evicted 1,482 keys. Status OK.')
    }, 1200)
  }

  const handleRestartWS = () => {
    setIsRestartingWS(true)
    appendSystemLog('warning', 'GATEWAY', 'Initiating hot restart of WebSocket gateway...')
    setTimeout(() => {
      setIsRestartingWS(false)
      setWsClients(0)
      appendSystemLog('info', 'GATEWAY', 'WebSocket gateway processes shut down. Purging active sockets...')
      setTimeout(() => {
        setWsClients(32)
        appendSystemLog('success', 'GATEWAY', 'WebSocket Gateway successfully restarted on port 8085. 32 clients re-connected.')
      }, 1000)
    }, 1500)
  }

  const handleRotateKeys = () => {
    setIsRotatingKeys(true)
    appendSystemLog('security', 'AUTH', 'CRITICAL COMMAND: Initiating active token encryption keys rotation...')
    setTimeout(() => {
      setIsRotatingKeys(false)
      appendSystemLog('success', 'AUTH', 'HMAC Secret Key rotated successfully. Re-issued session keys for 4 active admin sessions.')
    }, 2000)
  }

  const handleToggleVerbose = () => {
    const nextVal = !verboseLogging
    setVerboseLogging(nextVal)
    appendSystemLog('info', 'SYSTEM', `Verbose log level toggled to: ${nextVal ? 'VERBOSE / DEBUG' : 'STANDARD / WARN'}`)
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl text-slate-100 space-y-8">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-900 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-sky-400 to-teal-400 bg-clip-text text-transparent flex items-center gap-3.5">
              <HeartPulse className="h-8 w-8 text-sky-400 animate-pulse" />
              System Telemetry & Health
            </h1>
            <Badge variant="success" className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-emerald-950/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              OPERATIONAL
            </Badge>
          </div>
          <p className="text-slate-400 mt-1.5 text-sm">
            Platform performance nodes, connection queues, live log pipeline, and developer controls.
          </p>
        </div>

        {/* Uptime Box */}
        <div className="flex bg-slate-900/40 backdrop-blur-md px-5 py-3 rounded-xl border border-slate-800/80 items-center gap-4">
          <div className="text-right">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest block">System Uptime</span>
            <span className="text-base font-bold text-slate-200 tabular-nums">
              {uptime.days}d {uptime.hours}h {uptime.mins}m {uptime.secs}s
            </span>
          </div>
          <div className="h-8 w-px bg-slate-800" />
          <div className="flex items-center justify-center p-2 rounded-lg bg-sky-500/10">
            <Activity className="h-5 w-5 text-sky-400" />
          </div>
        </div>
      </div>

      {/* Main Core telemetry grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-5 rounded-2xl shadow-lg flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">CPU Load</span>
              <span className="text-3xl font-extrabold text-slate-100 tracking-tight mt-1.5 block tabular-nums">{cpuLoad}%</span>
            </div>
            <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/10">
              <Cpu className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <Progress value={cpuLoad} variant={cpuLoad > 85 ? 'danger' : cpuLoad > 70 ? 'warning' : 'primary'} />
            <div className="flex justify-between items-center mt-2 text-[10px] font-medium text-slate-500">
              <span>Standard idle</span>
              <span>85% Alert Limit</span>
            </div>
          </div>
        </Card>

        <Card className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-5 rounded-2xl shadow-lg flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Memory usage</span>
              <span className="text-3xl font-extrabold text-slate-100 tracking-tight mt-1.5 block tabular-nums">{memoryLoad}%</span>
            </div>
            <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/10">
              <HardDrive className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <Progress value={memoryLoad} variant={memoryLoad > 90 ? 'danger' : 'success'} />
            <div className="flex justify-between items-center mt-2 text-[10px] font-medium text-slate-500">
              <span>4.64 GB of 8 GB</span>
              <span>90% Alert Limit</span>
            </div>
          </div>
        </Card>

        <Card className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-5 rounded-2xl shadow-lg flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Postgres connections</span>
              <span className="text-3xl font-extrabold text-slate-100 tracking-tight mt-1.5 block tabular-nums">{postgresActive} <span className="text-sm font-semibold text-slate-500">/ 50</span></span>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/10">
              <Database className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <Progress value={postgresActive} max={50} variant="success" />
            <div className="flex justify-between items-center mt-2 text-[10px] font-medium text-slate-500">
              <span>Active Pool: 24%</span>
              <span>Max Capacity: 50</span>
            </div>
          </div>
        </Card>

        <Card className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-5 rounded-2xl shadow-lg flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">WebSocket Gateway</span>
              <span className="text-3xl font-extrabold text-slate-100 tracking-tight mt-1.5 block tabular-nums">{wsClients} <span className="text-sm font-semibold text-slate-500">Clients</span></span>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/10">
              <Cable className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <Progress value={wsClients} max={100} variant="primary" />
            <div className="flex justify-between items-center mt-2 text-[10px] font-medium text-slate-500">
              <span>Redis Cache hit: {redisHitRate}%</span>
              <span>100 Active Sockets max</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Center Grid: Chart and Console */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Performance History Chart */}
        <Card className="lg:col-span-2 bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-6 rounded-2xl shadow-lg space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <Activity className="h-5 w-5 text-sky-400" />
              Live Resource History
            </h2>
            <p className="text-xs text-slate-400">
              Sliding real-time monitor sampling gateway statistics (Updated every 2s).
            </p>
          </div>

          <div className="h-72 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={telemetryHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0}/>
                  </linearGradient>
                  <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.5} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#090d16',
                    borderColor: '#1e293b',
                    borderRadius: '8px',
                    color: '#e2e8f0',
                    fontSize: '12px'
                  }}
                />
                <Area type="monotone" dataKey="cpu" name="CPU Load (%)" stroke="#38bdf8" strokeWidth={2} fillOpacity={1} fill="url(#colorCpu)" />
                <Area type="monotone" dataKey="memory" name="Memory Usage (%)" stroke="#2dd4bf" strokeWidth={2} fillOpacity={1} fill="url(#colorMemory)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Live Monospace Terminal Logs */}
        <Card className="bg-slate-950 border border-slate-900 rounded-2xl shadow-xl flex flex-col justify-between h-[395px] overflow-hidden">
          {/* Header */}
          <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="h-4.5 w-4.5 text-emerald-400 animate-pulse" />
              <span className="text-xs font-mono font-bold text-slate-350">telemetry_daemon.log</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
            </div>
          </div>

          {/* Scrolling log console */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-[11px] leading-relaxed select-text bg-black/60 custom-scrollbar">
            {logs.map((log, idx) => (
              <div key={idx} className="flex items-start gap-1.5">
                <span className="text-slate-500 shrink-0 font-light">[{log.timestamp}]</span>
                <span className={`shrink-0 font-bold ${
                  log.type === 'success' 
                    ? 'text-emerald-400' 
                    : log.type === 'warning' 
                    ? 'text-yellow-400' 
                    : log.type === 'error' 
                    ? 'text-red-400 animate-pulse'
                    : log.type === 'security'
                    ? 'text-purple-400 font-extrabold bg-purple-950/40 px-1 rounded'
                    : 'text-sky-400'
                }`}>
                  [{log.module}]
                </span>
                <span className="text-slate-300 word-break-all">{log.message}</span>
              </div>
            ))}
            <div ref={terminalEndRef} />
          </div>

          {/* Console footer */}
          <div className="bg-slate-900 px-4 py-2.5 border-t border-slate-800 text-[10px] text-slate-500 flex justify-between font-mono">
            <span>Level: {verboseLogging ? 'VERBOSE/DEBUG' : 'INFO/WARN'}</span>
            <span>Lines: {logs.length}</span>
          </div>
        </Card>
      </div>

      {/* Developer Control Operations Panel */}
      <Card className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-6 rounded-2xl shadow-lg space-y-6">
        <div>
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <Settings className="h-5 w-5 text-sky-400" />
            DevOps & Operations Control Center
          </h2>
          <p className="text-xs text-slate-400">
            Execute maintenance protocols, clear caches, restart background processors, or rotate secrets.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Button
            variant="ghost"
            onClick={handleFlushCache}
            isLoading={isFlushingCache}
            className="flex items-center justify-center gap-2 border border-slate-800/80 bg-slate-900/60 hover:bg-slate-800 text-slate-200 hover:text-white rounded-xl py-3 font-semibold text-xs shadow transition-all duration-300 hover:scale-[1.02]"
          >
            <Trash2 size={16} className="text-teal-400" />
            Flush Redis Cache
          </Button>

          <Button
            variant="ghost"
            onClick={handleRestartWS}
            isLoading={isRestartingWS}
            className="flex items-center justify-center gap-2 border border-slate-800/80 bg-slate-900/60 hover:bg-slate-800 text-slate-200 hover:text-white rounded-xl py-3 font-semibold text-xs shadow transition-all duration-300 hover:scale-[1.02]"
          >
            <RefreshCcw size={16} className="text-sky-400" />
            Restart WS Gateway
          </Button>

          <Button
            variant="ghost"
            onClick={handleRotateKeys}
            isLoading={isRotatingKeys}
            className="flex items-center justify-center gap-2 border border-slate-800/80 bg-slate-900/60 hover:bg-slate-800 text-slate-200 hover:text-white rounded-xl py-3 font-semibold text-xs shadow transition-all duration-300 hover:scale-[1.02]"
          >
            <Key size={16} className="text-purple-400" />
            Rotate Secret Keys
          </Button>

          <Button
            variant="ghost"
            onClick={handleToggleVerbose}
            className="flex items-center justify-center gap-2 border border-slate-800/80 bg-slate-900/60 hover:bg-slate-800 text-slate-200 hover:text-white rounded-xl py-3 font-semibold text-xs shadow transition-all duration-300 hover:scale-[1.02]"
          >
            {verboseLogging ? (
              <>
                <ToggleRight size={20} className="text-emerald-400" />
                Verbose Mode: ON
              </>
            ) : (
              <>
                <ToggleLeft size={20} className="text-slate-500" />
                Verbose Mode: OFF
              </>
            )}
          </Button>
        </div>

        {/* Warning Alert panel */}
        <div className="p-4 rounded-xl border border-yellow-500/10 bg-yellow-950/10 text-yellow-250 text-xs flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold block">Production Operation Rules</span>
            <p className="text-slate-400 leading-relaxed">
              Modifying these environments invokes real-time cache eviction and state resetting. Ensure that connected field technicians and customers are informed, as keys rotation will invalidate standard session JWTs immediately.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
