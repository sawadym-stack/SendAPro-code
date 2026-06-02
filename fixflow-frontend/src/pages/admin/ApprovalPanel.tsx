import { useEffect, useState } from 'react'
import { Loader2, Check, X, Clock, AlertCircle, ShieldAlert, Award, MapPin, User, Mail, Phone, Calendar } from 'lucide-react'
import api from '../../services/api'
import { Button, Alert, Card, Badge, Spinner, EmptyState } from '../../components/ui'
import { useAuthStore } from '../../store/authStore'
import { formatDate } from '../../utils/formatters'

interface ApprovalRequest {
  id: string
  userId: string
  userName: string
  email: string
  phone: string
  role: 'technician' | 'supplier'
  skills?: string[]
  yearsExperience?: number
  address?: string
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  requestedAt: string
  expiresAt: string
}

export default function AdminApprovalPanel() {
  const { user } = useAuthStore()
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')

  useEffect(() => {
    if (user?.role !== 'admin') {
      setError('Unauthorized access')
      return
    }
    fetchRequests()
  }, [user, filter])

  const fetchRequests = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api.get('/admin/approvals', {
        params: { status: filter === 'pending' ? 'pending' : '' }
      })
      setRequests(response.data.requests || [])
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch approval requests')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (req: ApprovalRequest) => {
    setSubmitting(true)
    setError('')
    try {
      await api.post(`/admin/approvals/${req.id}/approve`, {
        adminId: user?.id || '00000000-0000-0000-0000-000000000001'
      })
      setRequests((prev) => prev.filter((r) => r.id !== req.id))
      setSelectedRequest(null)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to approve request')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReject = async (req: ApprovalRequest) => {
    if (!rejectionReason.trim()) {
      setError('Please provide a reason for rejection')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await api.post(`/admin/approvals/${req.id}/reject`, {
        adminId: user?.id || '00000000-0000-0000-0000-000000000001',
        reason: rejectionReason
      })
      setRequests((prev) => prev.filter((r) => r.id !== req.id))
      setSelectedRequest(null)
      setRejectionReason('')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reject request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl text-slate-100">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-sky-400 to-teal-400 bg-clip-text text-transparent flex items-center gap-3">
            <ShieldAlert className="h-8 w-8 text-sky-400" />
            Registration Approvals
          </h1>
          <p className="text-slate-400 mt-1 text-sm md:text-base">
            Review and approve registration requests for technicians and suppliers.
          </p>
        </div>
        
        {/* Toggle Filters */}
        <div className="flex items-center bg-slate-900/60 p-1.5 rounded-xl border border-slate-800/80 self-start md:self-auto shadow-inner">
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
              filter === 'pending'
                ? 'bg-gradient-to-r from-sky-500 to-teal-500 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Pending Only
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
              filter === 'all'
                ? 'bg-gradient-to-r from-sky-500 to-teal-500 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Show All
          </button>
        </div>
      </div>

      {error && (
        <Alert variant="danger" className="mb-6 rounded-xl animate-fade-in shadow-lg border border-red-500/20 bg-red-950/20 text-red-200">
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Spinner size="lg" />
          <p className="text-slate-400 mt-4 font-medium animate-pulse">Loading registration requests...</p>
        </div>
      ) : requests.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-2 border-slate-800 bg-slate-900/20 rounded-2xl">
          <EmptyState
            icon={<Clock className="h-16 w-16 text-slate-500 mx-auto" />}
            title="No registration requests"
            description={
              filter === 'pending'
                ? 'Great! All technician and supplier registration requests have been processed.'
                : 'No registration requests were found in the system.'
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {requests.map((req) => (
            <Card
              key={req.id}
              hover
              onClick={() => setSelectedRequest(req)}
              className="cursor-pointer border-slate-800/80 overflow-hidden shadow-md flex flex-col justify-between h-full bg-slate-900/40 backdrop-blur-md hover:-translate-y-1 hover:shadow-sky-500/5 transition-all duration-300 rounded-2xl"
            >
              <div className="p-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <Badge variant={req.role === 'technician' ? 'primary' : 'secondary'} className="capitalize font-bold text-xs px-2.5 py-1">
                    {req.role}
                  </Badge>
                  <Badge
                    variant={
                      req.status === 'approved'
                        ? 'success'
                        : req.status === 'pending'
                        ? 'warning'
                        : 'danger'
                    }
                    className="capitalize font-semibold text-xs px-2 py-0.5"
                  >
                    {req.status}
                  </Badge>
                </div>

                <h3 className="text-xl font-bold text-slate-100 mb-1 line-clamp-1">{req.userName}</h3>
                <p className="text-slate-500 text-xs mb-4 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-500" />
                  Requested: {formatDate(req.requestedAt)}
                </p>

                <div className="space-y-2.5 text-sm text-slate-300 mb-4 border-t border-slate-800/60 pt-4">
                  <p className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-slate-500 shrink-0" />
                    <span className="truncate">{req.email}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-slate-500 shrink-0" />
                    <span>{req.phone}</span>
                  </p>
                </div>

                {req.role === 'technician' && (
                  <div className="mt-4 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Award className="h-3.5 w-3.5 text-sky-400" />
                      Skills & Experience
                    </p>
                    <p className="text-sm font-semibold text-slate-200 mb-2">
                      Experience: {req.yearsExperience || 0} years
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {req.skills && req.skills.map((skill) => (
                        <span key={skill} className="px-2 py-0.5 bg-slate-900 text-slate-300 border border-slate-800 text-xs rounded-md capitalize font-medium">
                          {skill.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {req.role === 'supplier' && (
                  <div className="mt-4 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-teal-400" />
                      Address Details
                    </p>
                    <p className="text-sm text-slate-300 font-medium line-clamp-2">
                      {req.address || 'N/A'}
                    </p>
                  </div>
                )}
              </div>

              {req.status === 'pending' && (
                <div className="bg-slate-950/60 px-6 py-4 border-t border-slate-800/80 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-slate-500">Action Required</span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="success"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleApprove(req)
                      }}
                      className="px-3.5 py-1.5 text-xs rounded-lg font-bold"
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedRequest(req)
                      }}
                      className="px-3.5 py-1.5 text-xs rounded-lg font-bold"
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Detail & Action Modal Dialog */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 rounded-2xl max-w-lg w-full shadow-2xl border border-slate-800/85 overflow-hidden transform transition-all animate-scale-in my-8">
            <div className="bg-slate-950 p-6 text-white border-b border-slate-850 flex items-start justify-between">
              <div>
                <Badge variant={selectedRequest.role === 'technician' ? 'primary' : 'secondary'} className="mb-2 capitalize font-bold text-xs px-2.5 py-0.5">
                  {selectedRequest.role}
                </Badge>
                <h2 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-sky-400 to-teal-400 bg-clip-text text-transparent">{selectedRequest.userName}</h2>
                <p className="text-slate-500 text-xs mt-1">Request ID: {selectedRequest.id}</p>
              </div>
              <button
                onClick={() => {
                  setSelectedRequest(null)
                  setRejectionReason('')
                }}
                className="text-slate-400 hover:text-white transition-colors bg-slate-900/60 p-2 rounded-lg border border-slate-800/80"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="space-y-3.5">
                <h3 className="text-sm font-semibold text-slate-450 uppercase tracking-wider">Contact Information</h3>
                <div className="space-y-2.5 text-sm text-slate-300 bg-slate-950/60 p-4 rounded-xl border border-slate-850">
                  <p className="flex items-center gap-2.5">
                    <User className="h-4.5 w-4.5 text-slate-550" />
                    <span className="font-semibold text-slate-200">{selectedRequest.userName}</span>
                  </p>
                  <p className="flex items-center gap-2.5">
                    <Mail className="h-4.5 w-4.5 text-slate-550" />
                    <span>{selectedRequest.email}</span>
                  </p>
                  <p className="flex items-center gap-2.5">
                    <Phone className="h-4.5 w-4.5 text-slate-550" />
                    <span>{selectedRequest.phone}</span>
                  </p>
                  <p className="flex items-center gap-2.5">
                    <Calendar className="h-4.5 w-4.5 text-slate-550" />
                    <span>Requested: {formatDate(selectedRequest.requestedAt)}</span>
                  </p>
                </div>
              </div>

              {selectedRequest.role === 'technician' && (
                <div className="space-y-3.5">
                  <h3 className="text-sm font-semibold text-slate-450 uppercase tracking-wider">Qualifications</h3>
                  <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-850 space-y-3">
                    <p className="text-sm font-semibold text-slate-200">
                      Experience: {selectedRequest.yearsExperience || 0} years
                    </p>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 mb-1.5">Registered Skills:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedRequest.skills && selectedRequest.skills.map((skill) => (
                          <span key={skill} className="px-2.5 py-1 bg-slate-900 text-slate-300 border border-slate-800 text-xs rounded-lg capitalize font-bold">
                            {skill.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedRequest.role === 'supplier' && (
                <div className="space-y-3.5">
                  <h3 className="text-sm font-semibold text-slate-450 uppercase tracking-wider">Business Address</h3>
                  <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-850 text-sm text-slate-300 font-semibold flex items-start gap-2">
                    <MapPin className="h-5 w-5 text-teal-400 shrink-0 mt-0.5" />
                    <span>{selectedRequest.address || 'No address provided'}</span>
                  </div>
                </div>
              )}

              {/* Rejection Form Input */}
              {selectedRequest.status === 'pending' && (
                <div className="space-y-3 pt-4 border-t border-slate-850">
                  <label className="text-sm font-bold text-slate-350 block">
                    Rejection Reason
                  </label>
                  <textarea
                    placeholder="Provide a constructive reason for rejection..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-950/60 border border-slate-850 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm resize-none"
                    rows={3}
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 pt-2">
                {selectedRequest.status === 'pending' && (
                  <div className="flex gap-3">
                    <Button
                      onClick={() => handleApprove(selectedRequest)}
                      disabled={submitting}
                      className="flex-1 bg-green-600 hover:bg-green-505 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-green-950/20"
                    >
                      {submitting ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                      Approve
                    </Button>
                    <Button
                      onClick={() => handleReject(selectedRequest)}
                      disabled={submitting}
                      className="flex-1 bg-red-600 hover:bg-red-505 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-red-950/20"
                    >
                      {submitting ? <Loader2 size={18} className="animate-spin" /> : <X size={18} />}
                      Reject
                    </Button>
                  </div>
                )}
                <Button
                  onClick={() => {
                    setSelectedRequest(null)
                    setRejectionReason('')
                  }}
                  variant="outline"
                  className="w-full text-slate-300 font-bold py-3 rounded-xl hover:bg-slate-850 border-slate-800"
                >
                  Close Detail View
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
