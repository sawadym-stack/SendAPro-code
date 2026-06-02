import React, { useState, useEffect } from 'react'
import {
  FileText,
  Calendar,
  Download,
  RefreshCw,
  BarChart2,
  DollarSign,
  Users,
  AlertTriangle,
  History,
  Trash2,
  CheckCircle,
  FileSpreadsheet,
  FileDown
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import analyticsService from '../../services/analytics.service'
import { QUERY_KEYS } from '../../constants/queryKeys'
import { toast } from 'react-hot-toast'
import { formatCurrency } from '../../utils/formatters'

type ReportType = 'jobs' | 'revenue' | 'users'
type FormatType = 'csv' | 'pdf'

interface ExportHistoryItem {
  id: string
  type: ReportType
  from: string
  to: string
  format: FormatType
  timestamp: string
  filename: string
  dataUrl: string // base64 representation for instant local re-download
}

const formatDateForInput = (date: Date): string => {
  return date.toISOString().split('T')[0]
}

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('jobs')
  const [fromDate, setFromDate] = useState<string>(
    formatDateForInput(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
  )
  const [toDate, setToDate] = useState<string>(formatDateForInput(new Date()))
  const [format, setFormat] = useState<FormatType>('csv')
  const [isGenerating, setIsGenerating] = useState(false)
  const [history, setHistory] = useState<ExportHistoryItem[]>([])

  // Load history from LocalStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('fixflow_reports_history')
      if (stored) {
        setHistory(JSON.parse(stored))
      }
    } catch (e) {
      console.error('Failed to load reports history', e)
    }
  }, [])

  // Fetch overview analytics for preview metrics
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: QUERY_KEYS.adminOverview,
    queryFn: analyticsService.getOverview,
    refetchInterval: 60000,
  })

  // Apply Presets
  const applyPreset = (preset: 'today' | '7days' | '30days' | 'thisMonth') => {
    const today = new Date()
    let from = new Date()
    let to = new Date()

    switch (preset) {
      case 'today':
        from = today
        to = today
        break
      case '7days':
        from = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
        to = today
        break
      case '30days':
        from = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
        to = today
        break
      case 'thisMonth':
        from = new Date(today.getFullYear(), today.getMonth(), 1)
        to = today
        break
    }

    setFromDate(formatDateForInput(from))
    setToDate(formatDateForInput(to))
  }

  // Generate and Download Report
  const handleGenerate = async () => {
    if (!fromDate || !toDate) {
      toast.error('Please select both from and to dates.')
      return
    }
    if (new Date(fromDate) > new Date(toDate)) {
      toast.error('From date cannot be after to date.')
      return
    }

    setIsGenerating(true)
    const toastId = toast.loading('Generating report...')

    try {
      const blob = await analyticsService.exportReport({
        type: reportType,
        from: fromDate,
        to: toDate,
        format: format,
      })

      const filename = `fixflow_${reportType}_report_${fromDate}_to_${toDate}.${format}`

      // Create download link
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // Convert Blob to Base64 to save in localStorage for instant re-downloads
      const reader = new FileReader()
      reader.onloadend = () => {
        const dataUrl = reader.result as string
        const newItem: ExportHistoryItem = {
          id: Math.random().toString(36).substring(2, 9),
          type: reportType,
          from: fromDate,
          to: toDate,
          format: format,
          timestamp: new Date().toLocaleString(),
          filename: filename,
          dataUrl: dataUrl,
        }

        const updatedHistory = [newItem, ...history].slice(0, 5)
        setHistory(updatedHistory)
        localStorage.setItem('fixflow_reports_history', JSON.stringify(updatedHistory))
      }
      reader.readAsDataURL(blob)

      toast.success('Report downloaded successfully!', { id: toastId })
    } catch (err: any) {
      console.error(err)
      toast.error('Failed to generate report. Please try again.', { id: toastId })
    } finally {
      setIsGenerating(false)
    }
  }

  // Handle Instant Re-download from Local History
  const handleRedownload = (item: ExportHistoryItem) => {
    try {
      const a = document.createElement('a')
      a.href = item.dataUrl
      a.download = item.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      toast.success('Re-downloaded cached report!')
    } catch (e) {
      toast.error('Failed to re-download cached report.')
    }
  }

  // Clear History Log
  const handleClearHistory = () => {
    localStorage.removeItem('fixflow_reports_history')
    setHistory([])
    toast.success('Clear export logs history.')
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12 text-slate-100">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
          Report Builder
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Configure, preview, and export detailed system logs for jobs, billing, and registrations.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left Column (Span 2): Configurations */}
        <div className="lg:col-span-2 space-y-6">
          {/* Step 1: Report Selection */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              1. Select Report Type
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Jobs Card */}
              <button
                type="button"
                onClick={() => setReportType('jobs')}
                className={`flex flex-col items-start p-5 rounded-2xl border text-left transition-all hover:scale-[1.01] ${
                  reportType === 'jobs'
                    ? 'border-sky-500 bg-sky-950/20 shadow-lg ring-1 ring-sky-500/30'
                    : 'border-slate-800 bg-slate-900/30 hover:border-slate-700/60'
                }`}
              >
                <div
                  className={`p-2.5 rounded-xl mb-4 ${
                    reportType === 'jobs' ? 'bg-sky-500 text-white shadow-lg' : 'bg-slate-950 text-slate-400 border border-slate-800'
                  }`}
                >
                  <BarChart2 size={20} />
                </div>
                <h3 className="font-bold text-slate-200">Jobs Report</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Active job listings, cancellations, completed timeline logs, and response metrics.
                </p>
              </button>

              {/* Revenue Card */}
              <button
                type="button"
                onClick={() => setReportType('revenue')}
                className={`flex flex-col items-start p-5 rounded-2xl border text-left transition-all hover:scale-[1.01] ${
                  reportType === 'revenue'
                    ? 'border-emerald-500 bg-emerald-950/20 shadow-lg ring-1 ring-emerald-500/30'
                    : 'border-slate-800 bg-slate-900/30 hover:border-slate-700/60'
                }`}
              >
                <div
                  className={`p-2.5 rounded-xl mb-4 ${
                    reportType === 'revenue' ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-950 text-slate-400 border border-slate-800'
                  }`}
                >
                  <DollarSign size={20} />
                </div>
                <h3 className="font-bold text-slate-200">Revenue Report</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Captured transactions, payouts, billing statements, and monthly revenue data.
                </p>
              </button>

              {/* Users Card */}
              <button
                type="button"
                onClick={() => setReportType('users')}
                className={`flex flex-col items-start p-5 rounded-2xl border text-left transition-all hover:scale-[1.01] ${
                  reportType === 'users'
                    ? 'border-indigo-500 bg-indigo-950/20 shadow-lg ring-1 ring-indigo-500/30'
                    : 'border-slate-800 bg-slate-900/30 hover:border-slate-700/60'
                }`}
              >
                <div
                  className={`p-2.5 rounded-xl mb-4 ${
                    reportType === 'users' ? 'bg-indigo-500 text-white shadow-lg' : 'bg-slate-950 text-slate-400 border border-slate-800'
                  }`}
                >
                  <Users size={20} />
                </div>
                <h3 className="font-bold text-slate-200">Users Report</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  User accounts metrics, new registrations, technician approvals, and roles tracking.
                </p>
              </button>
            </div>
          </div>

          {/* Step 2: Datepicker Config */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              2. Choose Date Range
            </h2>
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-5 shadow-md">
              {/* Presets */}
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'today', label: 'Today' },
                  { id: '7days', label: 'Last 7 Days' },
                  { id: '30days', label: 'Last 30 Days' },
                  { id: 'thisMonth', label: 'This Month' },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset.id as any)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 transition-colors cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Inputs */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                    <Calendar size={14} className="text-slate-500" />
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-sky-500 transition-all text-slate-200"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                    <Calendar size={14} className="text-slate-500" />
                    End Date
                  </label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-sky-500 transition-all text-slate-200"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Step 3: Format */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              3. Select Format
            </h2>
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 shadow-md flex flex-col sm:flex-row gap-6">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="radio"
                  name="format"
                  value="csv"
                  checked={format === 'csv'}
                  onChange={() => setFormat('csv')}
                  className="w-4.5 h-4.5 text-sky-500 bg-slate-950 border-slate-850 focus:ring-sky-500"
                />
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-slate-300 group-hover:text-slate-100 transition-colors">
                    Comma-Separated Values (.csv)
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="radio"
                  name="format"
                  value="pdf"
                  checked={format === 'pdf'}
                  onChange={() => setFormat('pdf')}
                  className="w-4.5 h-4.5 text-sky-500 bg-slate-950 border-slate-850 focus:ring-sky-500"
                />
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-red-400" />
                  <span className="text-sm font-semibold text-slate-300 group-hover:text-slate-100 transition-colors">
                    Portable Document Format (.pdf)
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Local Download History */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <History size={14} />
                Recent Exports (Local Cache)
              </h2>
              {history.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer bg-transparent border-0"
                >
                  <Trash2 size={12} />
                  Clear history
                </button>
              )}
            </div>

            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 shadow-md">
              {history.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">
                  No reports generated in this browser session.
                </p>
              ) : (
                <div className="divide-y divide-slate-850/60">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="py-3 flex items-center justify-between first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 pr-4">
                        <span className="text-xs font-bold text-slate-300 block truncate font-mono">
                          {item.filename}
                        </span>
                        <span className="text-[10px] text-slate-500 block mt-0.5">
                          Generated on: {item.timestamp} | Range: {item.from} to {item.to}
                        </span>
                      </div>

                      <button
                        onClick={() => handleRedownload(item)}
                        className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-all shrink-0 cursor-pointer"
                      >
                        <FileDown size={12} />
                        Download cached
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Summaries & Action */}
        <div className="space-y-6">
          <div className="space-y-3 lg:sticky lg:top-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              4. Review & Export
            </h2>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-white relative overflow-hidden flex flex-col justify-between min-h-[350px]">
              {/* Blue blur light effect */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-3xl" />

              <div>
                <h3 className="font-extrabold text-lg flex items-center gap-2.5 border-b border-slate-800 pb-3">
                  <FileText className="text-sky-400" size={18} />
                  Export Summary
                </h3>

                <div className="space-y-4 mt-5 text-sm">
                  <div className="flex justify-between border-b border-slate-805 pb-2">
                    <span className="text-slate-400 font-medium">Type:</span>
                    <span className="font-bold text-sky-400 capitalize">{reportType} Report</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-805 pb-2">
                    <span className="text-slate-400 font-medium">Date Range:</span>
                    <span className="font-bold text-slate-200">{fromDate} to {toDate}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-805 pb-2">
                    <span className="text-slate-400 font-medium">Format:</span>
                    <span className="font-bold text-slate-200 uppercase">{format}</span>
                  </div>
                </div>

                {/* Preview / Live Context */}
                <div className="mt-6 bg-slate-950/60 rounded-xl border border-slate-850 p-4 space-y-3">
                  <span className="text-xs text-slate-500 font-bold uppercase tracking-wide">
                    Live Context Preview
                  </span>
                  {overviewLoading ? (
                    <div className="flex items-center gap-2 text-slate-400 text-xs">
                      <RefreshCw size={12} className="animate-spin" />
                      Loading live statistics...
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {reportType === 'jobs' && (
                        <>
                          <div>
                            <p className="text-slate-400">Active Jobs</p>
                            <p className="text-base font-black text-sky-400">{overview?.activeJobs ?? 0}</p>
                          </div>
                          <div>
                            <p className="text-slate-400">Completed Today</p>
                            <p className="text-base font-black text-emerald-400">{overview?.completedToday ?? 0}</p>
                          </div>
                        </>
                      )}
                      {reportType === 'revenue' && (
                        <>
                          <div>
                            <p className="text-slate-400">Total Month</p>
                            <p className="text-base font-black text-emerald-400">
                              {formatCurrency(Number(overview?.revenueThisMonth ?? 0))}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-400">Revenue Today</p>
                            <p className="text-base font-black text-indigo-400">
                              {formatCurrency(Number(overview?.revenueToday ?? 0))}
                            </p>
                          </div>
                        </>
                      )}
                      {reportType === 'users' && (
                        <>
                          <div>
                            <p className="text-slate-400">New Today</p>
                            <p className="text-base font-black text-indigo-400">{overview?.newUsersToday ?? 0}</p>
                          </div>
                          <div>
                            <p className="text-slate-400">Online Techs</p>
                            <p className="text-base font-black text-sky-400">{overview?.onlineTechnicians ?? 0}</p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-500 leading-tight">
                    * Preview values represent total stats. Exported file will contain full granular list filtering by your selected date range.
                  </p>
                </div>
              </div>

              {/* Trigger Button */}
              <div className="mt-8">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="w-full bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-600 hover:to-indigo-600 disabled:from-slate-800 disabled:to-slate-800 text-white disabled:text-slate-500 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-sky-500/10 cursor-pointer"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Generating report...
                    </>
                  ) : (
                    <>
                      <Download size={16} />
                      Export Report
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Confidential Warning */}
            <div className="flex gap-2.5 items-start p-4 bg-slate-900/30 border border-slate-800 rounded-xl text-slate-400">
              <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-normal text-slate-400">
                Data generated includes sensitive user profiles, location history coordinates, and transaction timestamps. Maintain proper confidentiality practices when archiving reports.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
