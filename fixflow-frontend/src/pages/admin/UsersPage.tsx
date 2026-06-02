import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { 
  Eye, 
  Search, 
  Users, 
  UserCheck, 
  UserX, 
  ShieldAlert,
  Calendar,
  Phone,
  Mail,
  Award,
  MapPin,
  CheckCircle,
  XCircle,
  Activity,
  User,
  AlertCircle,
  Check,
  X
} from 'lucide-react'
import api from '../../services/api'
import { QUERY_KEYS } from '../../constants/queryKeys'
import Skeleton from '../../components/ui/Skeleton'
import { formatDate } from '../../utils/formatters'
import { Button, Alert, Card, Badge } from '../../components/ui'

const roles = ['All', 'Customer', 'Technician', 'Supplier']

export default function UsersPage() {
  const qc = useQueryClient()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('All')
  const [panelUser, setPanelUser] = useState<any | null>(null)
  const [tab, setTab] = useState<'users' | 'verification'>('users')
  const [note, setNote] = useState('')

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput), 300)
    return () => window.clearTimeout(t)
  }, [searchInput])

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: QUERY_KEYS.adminUsers(search, role),
    queryFn: async () => (await api.get('/admin/users', { 
      params: { search, role: role === 'All' ? undefined : role.toLowerCase() } 
    })).data
  })

  const { data: queue, isLoading: queueLoading } = useQuery({
    queryKey: ['admin', 'technicians', 'queue'],
    queryFn: async () => (await api.get('/admin/technicians/verification-queue')).data
  })

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => 
      api.patch(`/admin/users/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.adminUsers(search, role) })
      if (panelUser) {
        setPanelUser((prev: any) => prev ? { ...prev, status: prev.status === 'Suspended' ? 'Active' : 'Suspended' } : null)
      }
    }
  })

  const verifyMut = useMutation({
    mutationFn: ({ id, approved, note }: { id: string; approved: boolean; note?: string }) => 
      api.patch(`/admin/technicians/${id}/verify`, { approved, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'technicians', 'queue'] })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.adminUsers(search, role) })
      setPanelUser(null)
      setNote('')
    }
  })

  const handleVerify = (id: string, approved: boolean) => {
    verifyMut.mutate({ id, approved, note: note || undefined })
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl text-slate-100">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-sky-400 to-teal-400 bg-clip-text text-transparent flex items-center gap-3">
            <Users className="h-8 w-8 text-sky-400" />
            User Management
          </h1>
          <p className="text-slate-400 mt-1 text-sm md:text-base">
            Search, suspend, and activate platform user accounts or approve pending verifications.
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex bg-slate-900/60 p-1.5 rounded-xl border border-slate-800/80 self-start md:self-auto shadow-inner">
          <button
            onClick={() => setTab('users')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
              tab === 'users'
                ? 'bg-gradient-to-r from-sky-500 to-teal-500 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Accounts
          </button>
          <button
            onClick={() => setTab('verification')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 flex items-center gap-1.5 ${
              tab === 'verification'
                ? 'bg-gradient-to-r from-sky-500 to-teal-500 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Verification Queue
            {queue && queue.length > 0 && (
              <span className="bg-rose-550 text-white text-[10px] font-bold h-4.5 w-4.5 rounded-full flex items-center justify-center animate-pulse">
                {queue.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {tab === 'users' ? (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 space-y-6">
            {/* Search & Filtering */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-900/40 backdrop-blur-md p-4 rounded-xl border border-slate-800/80 shadow-lg">
              <div className="sm:col-span-2 relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search users by name, email, or phone..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-800/85 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm transition-all"
                />
              </div>
              <div>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800/85 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-semibold transition-all [&>option]:bg-slate-950"
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>{r} Accounts</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Users List Grid */}
            {usersLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full rounded-xl bg-slate-900/20" />
                <Skeleton className="h-20 w-full rounded-xl bg-slate-900/20" />
                <Skeleton className="h-20 w-full rounded-xl bg-slate-900/20" />
              </div>
            ) : !users || users.length === 0 ? (
              <Card className="p-12 text-center border-dashed border-2 border-slate-800 bg-slate-900/20 rounded-2xl">
                <AlertCircle className="h-16 w-16 text-slate-500 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-200">No users found</h3>
                <p className="text-slate-400 text-sm mt-1">Try resetting your filters or adjusting your search query.</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {users.map((u: any) => (
                  <Card
                    key={u.id}
                    hover
                    onClick={() => setPanelUser(u)}
                    className={`p-5 cursor-pointer border-slate-800/80 flex items-center justify-between transition-all duration-300 hover:-translate-y-0.5 bg-slate-900/40 backdrop-blur-md shadow-md ${
                      panelUser?.id === u.id ? 'ring-2 ring-sky-500 border-transparent shadow-lg shadow-sky-500/10' : ''
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`h-11 w-11 rounded-full flex items-center justify-center font-bold text-sm shrink-0 uppercase border ${
                        u.role === 'Admin' 
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                          : u.role === 'Technician'
                          ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                          : u.role === 'Supplier'
                          ? 'bg-teal-500/10 text-teal-400 border-teal-500/20'
                          : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                      }`}>
                        {u.name.substring(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-slate-100 truncate leading-tight mb-1">{u.name}</h3>
                        <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5">{u.role}</p>
                        <p className="text-slate-500 text-xs truncate flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                          <span className="truncate">{u.email}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <Badge
                        variant={u.status === 'Suspended' ? 'danger' : 'success'}
                        className="text-[10px] font-bold px-2 py-0.5"
                      >
                        {u.status}
                      </Badge>
                      <Eye className="h-4 w-4 text-slate-500 group-hover:text-sky-400 transition-colors" />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Details & Actions Sidebar panel */}
          {panelUser && (
            <aside className="w-full lg:w-96 bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-6 rounded-2xl shadow-lg self-start lg:sticky lg:top-8 animate-slide-in">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <Badge variant={panelUser.role === 'Technician' ? 'primary' : panelUser.role === 'Supplier' ? 'secondary' : 'neutral'} className="capitalize font-bold text-[10px] px-2.5 py-0.5">
                    {panelUser.role}
                  </Badge>
                  <h2 className="text-2xl font-extrabold text-slate-100 tracking-tight mt-1">{panelUser.name}</h2>
                  <p className="text-slate-500 text-[10px] mt-0.5 truncate">User ID: {panelUser.id}</p>
                </div>
                <button
                  onClick={() => setPanelUser(null)}
                  className="text-slate-400 hover:text-slate-200 bg-slate-950/60 p-1.5 rounded-lg border border-slate-800/80 transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-3.5">
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Account Details</h3>
                  <div className="space-y-3 text-sm text-slate-300 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                    <p className="flex items-center gap-2.5">
                      <Mail className="h-4.5 w-4.5 text-slate-500" />
                      <span className="truncate">{panelUser.email}</span>
                    </p>
                    <p className="flex items-center gap-2.5">
                      <Phone className="h-4.5 w-4.5 text-slate-500" />
                      <span>{panelUser.phone}</span>
                    </p>
                    <p className="flex items-center gap-2.5">
                      <Calendar className="h-4.5 w-4.5 text-slate-500" />
                      <span>Joined: {formatDate(panelUser.createdAt)}</span>
                    </p>
                  </div>
                </div>

                <div className="space-y-3.5">
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Account Status</h3>
                  <div className="flex items-center justify-between bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                    <span className="text-sm font-semibold text-slate-350">Account status</span>
                    <Badge variant={panelUser.status === 'Suspended' ? 'danger' : 'success'} className="font-bold text-xs">
                      {panelUser.status}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-800/80">
                  <button
                    disabled={statusMut.isPending}
                    className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 ${
                      panelUser.status === 'Suspended' 
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-md shadow-emerald-950/20' 
                        : 'bg-rose-600 text-white hover:bg-rose-500 shadow-md shadow-rose-950/20'
                    }`} 
                    onClick={() => statusMut.mutate({ id: panelUser.id, status: panelUser.status === 'Suspended' ? 'Active' : 'Suspended' })}
                  >
                    {panelUser.status === 'Suspended' ? (
                      <>
                        <UserCheck className="h-4.5 w-4.5" />
                        Re-Activate Account
                      </>
                    ) : (
                      <>
                        <UserX className="h-4.5 w-4.5" />
                        Suspend Account
                      </>
                    )}
                  </button>
                  {panelUser.status !== 'Suspended' ? (
                    <p className="text-center text-[10px] font-medium text-slate-500 flex items-center justify-center gap-1">
                      <ShieldAlert className="h-3.5 w-3.5 text-rose-500 animate-bounce" />
                      Suspension locks platform access immediately.
                    </p>
                  ) : (
                    <p className="text-center text-[10px] font-medium text-slate-500">
                      Re-activating grants full system privileges immediately.
                    </p>
                  )}
                </div>
              </div>
            </aside>
          )}
        </div>
      ) : (
        /* Verification Queue Tab */
        <div className="space-y-6">
          {queueLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full rounded-xl bg-slate-900/20" />
              <Skeleton className="h-20 w-full rounded-xl bg-slate-900/20" />
            </div>
          ) : !queue || queue.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-2 border-slate-800 bg-slate-900/20 rounded-2xl">
              <CheckCircle className="h-16 w-16 text-emerald-400 mx-auto mb-4 animate-bounce" />
              <h3 className="text-lg font-bold text-slate-200">Verification queue is empty</h3>
              <p className="text-slate-400 text-sm mt-1">Outstanding technician and supplier approvals are up to date.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {queue.map((q: any) => (
                <Card
                  key={q.approvalId}
                  className="p-6 border-slate-800/80 flex flex-col justify-between h-full bg-slate-900/40 backdrop-blur-md shadow-md hover:shadow-lg hover:shadow-sky-500/5 transition-all duration-300 rounded-2xl"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <Badge variant={q.role === 'supplier' ? 'secondary' : 'primary'} className="capitalize font-bold text-xs px-2.5 py-0.5">
                        {q.role || 'technician'}
                      </Badge>
                      <Badge variant="warning" className="capitalize font-bold text-[10px] px-2 py-0.5">
                        Awaiting Verify
                      </Badge>
                    </div>

                    <h3 className="text-lg font-bold text-slate-100 mb-3">{q.name}</h3>

                    <div className="space-y-2 text-sm text-slate-300 mb-6 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                      <p className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-slate-500" />
                        <span>{q.phone}</span>
                      </p>
                      <p className="text-slate-500 text-xs mt-1">Approval ID: {q.approvalId}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <input
                      type="text"
                      placeholder="Add custom decision note (optional)..."
                      onChange={(e) => setNote(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-950/60 border border-slate-800/80 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 text-xs"
                    />

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => handleVerify(q.approvalId, true)}
                        className="flex-1 py-2 font-bold text-xs rounded-lg"
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleVerify(q.approvalId, false)}
                        className="flex-1 py-2 font-bold text-xs rounded-lg"
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
