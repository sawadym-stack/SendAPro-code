import React from 'react'
import type { Invoice } from '../../types'
import { Card, Badge } from '../ui'

interface InvoiceSummaryCardProps {
  invoice: Invoice
  showDownloadBtn?: boolean
}

export const InvoiceSummaryCard: React.FC<InvoiceSummaryCardProps> = ({
  invoice,
  showDownloadBtn = true,
}) => {
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  return (
    <Card className="overflow-hidden bg-slate-900/60 border-slate-900 shadow-xl backdrop-blur-xl">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-950 to-indigo-950 border-b border-slate-900 text-white p-6 relative">
        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full -mr-8 -mt-8 opacity-50 pointer-events-none" />
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-indigo-400 font-bold font-mono">Invoice Detail</span>
            <h3 className="text-xl font-black font-display mt-1 text-white tracking-tight">#{invoice.id.substring(0, 8).toUpperCase()}</h3>
            <p className="text-xs text-slate-500 mt-1 font-mono">Job ID: {invoice.jobId.slice(0, 8)}...</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={invoice.status === 'Paid' ? 'success' : 'warning'} size="md">
              {invoice.status === 'Paid' ? '✓ Paid' : '• Pending'}
            </Badge>
            {showDownloadBtn && invoice.pdfUrl && (
              <a
                href={invoice.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 text-indigo-450 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <span>📄</span> Download PDF
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Info Sections */}
      <div className="p-6 border-b border-slate-900 bg-slate-950/40 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Date Issued</span>
          <p className="font-semibold text-slate-200 mt-1 text-sm">{formatDate(invoice.createdAt)}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Customer</span>
          <p className="font-semibold text-slate-200 mt-1 text-sm">{invoice.customerName}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Assigned Technician</span>
          <p className="font-semibold text-slate-200 mt-1 text-sm">{invoice.techName}</p>
        </div>
      </div>

      {/* Line Items */}
      <div className="p-6">
        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 font-mono">Service & Material Summary</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-900 text-slate-500 text-[10px] uppercase font-bold font-mono">
                <th className="py-3 px-2">Description</th>
                <th className="py-3 px-2 text-center w-24">Qty</th>
                <th className="py-3 px-2 text-right w-32">Unit Price</th>
                <th className="py-3 px-2 text-right w-32">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900 text-slate-300 text-sm">
              {invoice.lineItems.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-950/40 transition-colors">
                  <td className="py-3.5 px-2 font-semibold text-white">{item.description}</td>
                  <td className="py-3.5 px-2 text-center text-slate-400 font-mono">{item.quantity}</td>
                  <td className="py-3.5 px-2 text-right text-slate-400 font-mono">Rs. {item.unitPrice.toFixed(2)}</td>
                  <td className="py-3.5 px-2 text-right font-bold text-white font-mono">Rs. {item.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Calculation Details */}
        <div className="mt-6 border-t border-slate-900 pt-4 flex justify-end">
          <div className="w-full md:w-80 space-y-2.5">
            <div className="flex justify-between text-xs text-slate-450 font-mono">
              <span>Subtotal</span>
              <span>Rs. {invoice.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-450 font-mono">
              <span>GST (18%)</span>
              <span>Rs. {invoice.taxAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-slate-200 border-t border-slate-900 pt-2.5 font-display font-mono">
              <span>Grand Total</span>
              <span className="text-indigo-400 font-black text-base">Rs. {invoice.total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
