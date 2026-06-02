import { useMemo, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import Papa from 'papaparse'
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Upload,
  AlertTriangle,
  CheckCircle,
  FileText,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  Zap,
  Droplet,
  ToggleLeft,
  Paintbrush,
  Wrench,
  Package,
} from 'lucide-react'
import { QUERY_KEYS } from '../../constants/queryKeys'
import supplierService from '../../services/supplier.service'
import { formatCurrency } from '../../utils/formatters'
import type { Material } from '../../types'

const getCategoryIcon = (category: string) => {
  const cat = category.toLowerCase()
  switch (cat) {
    case 'wires':
      return <Zap className="h-5 w-5 text-amber-500" />
    case 'pipes':
      return <Droplet className="h-5 w-5 text-blue-500" />
    case 'sanitary':
      return <Droplet className="h-5 w-5 text-teal-500" />
    case 'switches':
      return <ToggleLeft className="h-5 w-5 text-orange-500" />
    case 'paint':
      return <Paintbrush className="h-5 w-5 text-purple-500" />
    case 'tools':
      return <Wrench className="h-5 w-5 text-slate-500" />
    default:
      return <Package className="h-5 w-5 text-indigo-500" />
  }
}

const CATEGORIES = ['All', 'Wires', 'Pipes', 'Sanitary', 'Switches', 'Paint', 'Tools', 'Other'] as const
const VALID_CATEGORIES = ['wires', 'pipes', 'sanitary', 'switches', 'paint', 'tools', 'other'] as const

// Zod schema for material form
const materialSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters' }),
  category: z.enum(VALID_CATEGORIES, { message: 'Please select a valid category' }),
  price: z.number().min(0.01, { message: 'Price must be greater than 0' }),
  stock: z.number().int().min(0, { message: 'Stock cannot be negative' }),
  description: z.string().max(500, { message: 'Description must be under 500 characters' }).optional(),
})

type MaterialFormValues = z.infer<typeof materialSchema>

// Helper to get category badge styles
const getCategoryStyles = (category: string) => {
  const cat = category.toLowerCase()
  switch (cat) {
    case 'wires':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'pipes':
      return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'sanitary':
      return 'bg-teal-50 text-teal-700 border-teal-200'
    case 'switches':
      return 'bg-orange-50 text-orange-700 border-orange-200'
    case 'paint':
      return 'bg-purple-50 text-purple-700 border-purple-200'
    case 'tools':
      return 'bg-slate-100 text-slate-700 border-slate-300'
    default:
      return 'bg-indigo-50 text-indigo-700 border-indigo-200'
  }
}

// Switch Toggle component
const Switch = ({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
      checked ? 'bg-emerald-500' : 'bg-slate-200'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    <span
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
)

const MaterialsPage = () => {
  const queryClient = useQueryClient()
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORIES)[number]>('All')
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [editItem, setEditItem] = useState<Material | null>(null)
  const [deleteItem, setDeleteItem] = useState<Material | null>(null)
  const [isCsvCollapsed, setIsCsvCollapsed] = useState(true)

  // Fetch materials
  const { data, isLoading } = useQuery({
    queryKey: [...QUERY_KEYS.materials, activeCategory],
    queryFn: () =>
      supplierService.getMaterials({
        category: activeCategory === 'All' ? undefined : activeCategory.toLowerCase(),
      }),
  })

  // Local state for stock inputs to debounce updates
  const [localStock, setLocalStock] = useState<Record<string, number>>({})
  const [pendingDeltas, setPendingDeltas] = useState<Record<string, number>>({})

  const materials = useMemo(() => data?.materials ?? [], [data])

  // Reset local stock state when materials are loaded
  useEffect(() => {
    if (materials.length > 0) {
      const stockMap: Record<string, number> = {}
      materials.forEach((m) => {
        stockMap[m.id] = m.stock
      })
      setLocalStock(stockMap)
    }
  }, [materials])

  // Filter client-side for instant tab response
  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      const matchesCategory = activeCategory === 'All' || m.category.toLowerCase() === activeCategory.toLowerCase()
      const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase())
      return matchesCategory && matchesSearch
    })
  }, [materials, activeCategory, search])

  // Mutation for updating availability (optimistic update)
  const toggleAvailableMutation = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      supplierService.updateMaterial(id, { isAvailable }),
    onMutate: async ({ id, isAvailable }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.materials })
      const previous = queryClient.getQueryData<{ materials: Material[]; totalCount: number }>(QUERY_KEYS.materials)

      if (previous) {
        queryClient.setQueryData(QUERY_KEYS.materials, {
          ...previous,
          materials: previous.materials.map((m) => (m.id === id ? { ...m, isAvailable } : m)),
        })
      }
      return { previous }
    },
    onError: (err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.materials, context.previous)
      }
      toast.error('Failed to update availability')
    },
    onSuccess: () => {
      toast.success('Availability updated')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.materials })
    },
  })

  // Debounced stock update helpers
  const [debouncers] = useState<Record<string, NodeJS.Timeout>>({})

  const handleStockChange = (id: string, currentStock: number, delta: number) => {
    const newStock = Math.min(Math.max(0, currentStock + delta), 9999)
    setLocalStock((prev) => ({ ...prev, [id]: newStock }))

    setPendingDeltas((prev) => {
      const currentPending = prev[id] ?? 0
      const nextPending = currentPending + delta

      if (debouncers[id]) {
        clearTimeout(debouncers[id])
      }

      debouncers[id] = setTimeout(async () => {
        try {
          await supplierService.updateStock(id, nextPending)
          setPendingDeltas((p) => {
            const copy = { ...p }
            delete copy[id]
            return copy
          })
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.materials })
        } catch (error) {
          toast.error('Failed to update stock')
          const fresh = materials.find((m) => m.id === id)
          if (fresh) {
            setLocalStock((prevLocal) => ({ ...prevLocal, [id]: fresh.stock }))
          }
          setPendingDeltas((p) => {
            const copy = { ...p }
            delete copy[id]
            return copy
          })
        }
      }, 800)

      return { ...prev, [id]: nextPending }
    })
  }

  // Delete material mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => supplierService.deleteMaterial(id),
    onSuccess: () => {
      toast.success('Material deleted successfully')
      setDeleteItem(null)
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.materials })
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to delete material')
    },
  })

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">My Materials Directory</h1>
          <p className="text-sm text-slate-500">Manage and update your available catalog products</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 font-medium text-white shadow-md transition hover:bg-blue-700 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <Plus className="h-5 w-5" />
          Add Material
        </button>
      </div>

      {/* Filters row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
        {/* Category Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition ${
                activeCategory === cat
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:max-w-xs">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-slate-400" />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search catalog..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Materials display */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
          <div className="rounded-full bg-slate-50 p-4 text-slate-400">
            <Search className="h-8 w-8" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-700">No materials found</h3>
          <p className="mt-1 text-sm text-slate-500">Try adjusting your filters or search terms</p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:block">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Thumbnail
                  </th>
                  <th className="px-6 py-4.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Name
                  </th>
                  <th className="px-6 py-4.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Category
                  </th>
                  <th className="px-6 py-4.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Price
                  </th>
                  <th className="px-6 py-4.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Stock Availability
                  </th>
                  <th className="px-6 py-4.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Active Status
                  </th>
                  <th className="px-6 py-4.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredMaterials.map((m) => {
                  const stockVal = localStock[m.id] !== undefined ? localStock[m.id] : m.stock
                  let stockColor = 'text-green-600 font-semibold'
                  let stockLabel = `${stockVal}`
                  if (stockVal === 0) {
                    stockColor = 'text-rose-600 font-bold'
                    stockLabel = 'Out of stock'
                  } else if (stockVal <= 5) {
                    stockColor = 'text-amber-600 font-medium'
                    stockLabel = `${stockVal} left`
                  }

                  return (
                    <tr key={m.id} className="hover:bg-slate-50 transition duration-150">
                      <td className="whitespace-nowrap px-6 py-4">
                        {m.imageUrl ? (
                          <img
                            src={m.imageUrl}
                            alt={m.name}
                            className="h-10 w-10 rounded-lg object-cover shadow-sm border border-slate-100"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 border border-slate-150 shadow-xs">
                            {getCategoryIcon(m.category)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-800">{m.name}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider ${getCategoryStyles(
                            m.category,
                          )}`}
                        >
                          {m.category}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold text-slate-900">
                        Rs. {m.price.toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex flex-col items-center gap-1.5">
                          <span className={`text-xs ${stockColor}`}>{stockLabel}</span>
                          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1">
                            <button
                              type="button"
                              disabled={stockVal <= 0}
                              onClick={() => handleStockChange(m.id, stockVal, -1)}
                              className="flex h-6 w-6 items-center justify-center rounded bg-white text-slate-600 shadow-sm transition hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              -
                            </button>
                            <span className="w-10 text-center text-xs font-semibold text-slate-700">{stockVal}</span>
                            <button
                              type="button"
                              disabled={stockVal >= 9999}
                              onClick={() => handleStockChange(m.id, stockVal, 1)}
                              className="flex h-6 w-6 items-center justify-center rounded bg-white text-slate-600 shadow-sm transition hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-center">
                        <Switch
                          checked={m.isAvailable}
                          onChange={(isAvailable) => toggleAvailableMutation.mutate({ id: m.id, isAvailable })}
                        />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-center text-sm font-medium">
                        <div className="flex items-center justify-center gap-3">
                          <button
                            onClick={() => setEditItem(m)}
                            className="text-blue-600 hover:text-blue-900 transition"
                            title="Edit Material"
                          >
                            <Edit className="h-4.5 w-4.5" />
                          </button>
                          <button
                            onClick={() => setDeleteItem(m)}
                            className="text-rose-600 hover:text-rose-900 transition"
                            title="Delete Material"
                          >
                            <Trash2 className="h-4.5 w-4.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Grid/Cards View */}
          <div className="grid gap-4 sm:grid-cols-2 lg:hidden">
            {filteredMaterials.map((m) => {
              const stockVal = localStock[m.id] !== undefined ? localStock[m.id] : m.stock
              let stockColor = 'text-green-600 font-semibold'
              let stockLabel = `${stockVal}`
              if (stockVal === 0) {
                stockColor = 'text-rose-600 font-bold'
                stockLabel = 'Out of stock'
              } else if (stockVal <= 5) {
                stockColor = 'text-amber-600 font-medium'
                stockLabel = `${stockVal} left`
              }

              return (
                <div
                  key={m.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4 hover:shadow-md transition duration-150"
                >
                  <div className="flex items-start gap-3">
                    {m.imageUrl ? (
                      <img src={m.imageUrl} alt={m.name} className="h-12 w-12 rounded-xl object-cover border" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 border border-slate-150 shadow-xs">
                        {getCategoryIcon(m.category)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-slate-800 truncate">{m.name}</h4>
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${getCategoryStyles(
                            m.category,
                          )}`}
                        >
                          {m.category}
                        </span>
                        <span className="text-sm font-bold text-slate-900">Rs. {m.price.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-medium">Available:</span>
                      <Switch
                        checked={m.isAvailable}
                        onChange={(isAvailable) => toggleAvailableMutation.mutate({ id: m.id, isAvailable })}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${stockColor}`}>{stockLabel}</span>
                      <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                        <button
                          type="button"
                          disabled={stockVal <= 0}
                          onClick={() => handleStockChange(m.id, stockVal, -1)}
                          className="flex h-6.5 w-6.5 items-center justify-center rounded bg-white text-slate-600 shadow-sm"
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-xs font-semibold text-slate-700">{stockVal}</span>
                        <button
                          type="button"
                          disabled={stockVal >= 9999}
                          onClick={() => handleStockChange(m.id, stockVal, 1)}
                          className="flex h-6.5 w-6.5 items-center justify-center rounded bg-white text-slate-600 shadow-sm"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 border-t border-slate-100 pt-3">
                    <button
                      onClick={() => setEditItem(m)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-900"
                    >
                      <Edit className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => setDeleteItem(m)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-900"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Bulk CSV Import Section */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          onClick={() => setIsCsvCollapsed(!isCsvCollapsed)}
          className="flex w-full items-center justify-between bg-slate-50 px-6 py-4 text-left font-semibold text-slate-700 hover:bg-slate-100 transition"
        >
          <span className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-slate-500" />
            Bulk CSV Import
          </span>
          {isCsvCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
        </button>
        {!isCsvCollapsed && (
          <div className="p-6 space-y-4">
            <div className="rounded-xl bg-slate-50 border border-slate-150 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-700 mb-1">Expected CSV columns:</p>
              <code className="block bg-slate-200 p-2 rounded text-xs overflow-x-auto">
                name,category,price,stock,description
                <br />
                "Copper Wire 2.5mm",wires,45.00,100,"Standard electrical wire"
              </code>
            </div>

            <BulkImportCsv queryClient={queryClient} />
          </div>
        )}
      </div>

      {/* Modals & Dialogs */}
      {addOpen && (
        <MaterialDialog
          title="Add New Material Product"
          onClose={() => setAddOpen(false)}
          queryClient={queryClient}
        />
      )}

      {editItem && (
        <MaterialDialog
          title="Edit Material Product"
          material={editItem}
          onClose={() => setEditItem(null)}
          queryClient={queryClient}
        />
      )}

      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-100">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600 mb-4">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Delete {deleteItem.name}?</h3>
            <p className="mt-2 text-sm text-slate-500">
              This will remove the material from your listing. Pending quotations will not be affected.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteItem(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 focus:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteItem.id)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete Material
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Bulk CSV Import Internal Component
const BulkImportCsv = ({ queryClient }: { queryClient: any }) => {
  const [previewRows, setPreviewRows] = useState<any[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [validationResults, setValidationResults] = useState<{
    validRows: any[]
    invalidCount: number
    errors: Record<number, string[]>
  }>({ validRows: [], invalidCount: 0, errors: {} })

  const parseCsvFile = (selectedFile: File) => {
    setFile(selectedFile)
    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data
        setPreviewRows(rows)

        // Validate rows
        const validRows: any[] = []
        let invalidCount = 0
        const errors: Record<number, string[]> = {}

        rows.forEach((row: any, idx: number) => {
          const rowErrors: string[] = []
          const name = row.name?.trim()
          const category = row.category?.trim()?.toLowerCase()
          const price = parseFloat(row.price)
          const stock = parseInt(row.stock, 10)

          if (!name) {
            rowErrors.push('Name is required')
          }
          if (!category || !VALID_CATEGORIES.includes(category as any)) {
            rowErrors.push(`Category must be one of: ${VALID_CATEGORIES.join(', ')}`)
          }
          if (isNaN(price) || price <= 0) {
            rowErrors.push('Price must be a positive number')
          }
          if (isNaN(stock) || stock < 0) {
            rowErrors.push('Stock must be a non-negative integer')
          }

          if (rowErrors.length > 0) {
            invalidCount++
            errors[idx] = rowErrors
          } else {
            validRows.push({
              name,
              category,
              price,
              stock,
              description: row.description?.trim() || '',
            })
          }
        })

        setValidationResults({ validRows, invalidCount, errors })
      },
    })
  }

  const importMutation = useMutation({
    mutationFn: () => supplierService.bulkImport(validationResults.validRows),
    onSuccess: (data) => {
      toast.success(`${data.importedCount} rows imported successfully. ${data.failedCount} failed.`)
      setFile(null)
      setPreviewRows([])
      setValidationResults({ validRows: [], invalidCount: 0, errors: {} })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.materials })
    },
    onError: (err: any) => {
      toast.error(err.message || 'Import failed. Check CSV syntax')
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition">
          <FileText className="h-4.5 w-4.5 text-slate-500" />
          {file ? file.name : 'Select CSV File'}
          <input
            type="file"
            accept=".csv"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) parseCsvFile(f)
            }}
            className="hidden"
          />
        </label>
        {file && (
          <button
            onClick={() => {
              setFile(null)
              setPreviewRows([])
              setValidationResults({ validRows: [], invalidCount: 0, errors: {} })
            }}
            className="rounded-full p-1.5 hover:bg-slate-100 transition"
          >
            <X className="h-4 w-4 text-slate-500" />
          </button>
        )}
      </div>

      {previewRows.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-700">Preview (First 10 Rows)</h4>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-xs divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-slate-500 font-semibold">Row</th>
                  <th className="px-4 py-2.5 text-left text-slate-500 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-left text-slate-500 font-semibold">Name</th>
                  <th className="px-4 py-2.5 text-left text-slate-500 font-semibold">Category</th>
                  <th className="px-4 py-2.5 text-right text-slate-500 font-semibold">Price</th>
                  <th className="px-4 py-2.5 text-center text-slate-500 font-semibold">Stock</th>
                  <th className="px-4 py-2.5 text-left text-slate-500 font-semibold">Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {previewRows.slice(0, 10).map((row, idx) => {
                  const hasErrors = !!validationResults.errors[idx]
                  const rowErrors = validationResults.errors[idx] ?? []

                  return (
                    <tr 
                      key={idx} 
                      className={hasErrors ? 'bg-rose-50/50' : 'hover:bg-slate-50'}
                      title={hasErrors ? `Validation errors: ${rowErrors.join(', ')}` : 'Valid row'}
                    >
                      <td className="px-4 py-2 font-medium text-slate-500">{idx + 1}</td>
                      <td className="px-4 py-2 text-center">
                        {hasErrors ? (
                          <span title={rowErrors.join(', ')} className="cursor-help"><AlertTriangle className="h-4 w-4 text-rose-500 mx-auto" /></span>
                        ) : (
                          <CheckCircle className="h-4 w-4 text-emerald-500 mx-auto" />
                        )}
                      </td>
                      <td className="px-4 py-2 font-medium text-slate-800">{row.name}</td>
                      <td className="px-4 py-2 text-slate-600">{row.category}</td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-800">{row.price}</td>
                      <td className="px-4 py-2 text-center text-slate-700">{row.stock}</td>
                      <td className="px-4 py-2 text-rose-600 font-medium">
                        {rowErrors.length > 0 ? rowErrors.join(', ') : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={validationResults.validRows.length === 0 || importMutation.isPending}
              onClick={() => importMutation.mutate()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
            >
              {importMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Import {validationResults.validRows.length} Valid Rows
            </button>
            {validationResults.invalidCount > 0 && (
              <span className="text-xs text-rose-600 font-semibold flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                Skipping {validationResults.invalidCount} invalid rows
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Material Add/Edit dialog modal
const MaterialDialog = ({
  title,
  material,
  onClose,
  queryClient,
}: {
  title: string
  material?: Material
  onClose: () => void
  queryClient: any
}) => {
  const isEdit = !!material
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>(material?.imageUrl ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, dirtyFields },
  } = useForm<MaterialFormValues>({
    resolver: zodResolver(materialSchema),
    defaultValues: {
      name: material?.name ?? '',
      category: (material?.category as any) ?? 'other',
      price: material?.price ?? 0.01,
      stock: material?.stock ?? 0,
      description: material?.description ?? '',
    },
  })

  const onSubmit = async (values: MaterialFormValues) => {
    setIsSubmitting(true)
    try {
      let finalImageUrl = material?.imageUrl ?? ''

      // If an image is selected, upload it first
      if (imageFile) {
        const uploadResult = await supplierService.uploadGeneralFile(imageFile)
        finalImageUrl = uploadResult.imageUrl
      }

      if (isEdit && material) {
        // Send only modified fields
        const dirtyValues: any = {}
        Object.keys(dirtyFields).forEach((key) => {
          dirtyValues[key] = (values as any)[key]
        })
        if (imageFile) {
          dirtyValues.imageUrl = finalImageUrl
        }

        await supplierService.updateMaterial(material.id, dirtyValues)
        toast.success('Product updated successfully')
      } else {
        await supplierService.addMaterial({
          ...values,
          isAvailable: true,
          imageUrl: finalImageUrl,
        })
        toast.success('Product added successfully')
      }

      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.materials })
      onClose()
    } catch (error: any) {
      toast.error(error.message || 'Action failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-100 my-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-xl font-bold text-slate-800 mb-6">{title}</h3>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4.5">
          {/* File Upload / Image Preview */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 block">Product Image</label>
            <div className="flex items-center gap-4">
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="h-16 w-16 rounded-xl object-cover border border-slate-200"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 text-slate-400">
                  No Image
                </div>
              )}
              <div className="flex-1">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      if (f.size > 2 * 1024 * 1024) {
                        toast.error('Image size must be under 2MB')
                        return
                      }
                      setImageFile(f)
                      setImagePreview(URL.createObjectURL(f))
                    }
                  }}
                  className="w-full text-xs text-slate-500 file:mr-3 file:cursor-pointer file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                />
                <p className="mt-1 text-[10px] text-slate-400">JPG, PNG or WEBP, max 2MB</p>
              </div>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 block">Product Name</label>
            <input
              type="text"
              {...register('name')}
              placeholder="e.g. Copper Wire 2.5mm"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {errors.name && <p className="text-xs text-rose-500 font-medium">{errors.name.message}</p>}
          </div>

          {/* Category */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 block">Category</label>
            <select
              {...register('category')}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select Category</option>
              {VALID_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.toUpperCase()}
                </option>
              ))}
            </select>
            {errors.category && <p className="text-xs text-rose-500 font-medium">{errors.category.message}</p>}
          </div>

          {/* Price & Initial Stock Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 block">Unit Price (Rs.)</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 text-sm font-semibold">
                  Rs.
                </span>
                <input
                  type="number"
                  step="0.01"
                  {...register('price', { valueAsNumber: true })}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              {errors.price && <p className="text-xs text-rose-500 font-medium">{errors.price.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 block">Stock Quantity</label>
              <input
                type="number"
                {...register('stock', { valueAsNumber: true })}
                placeholder="0"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {errors.stock && <p className="text-xs text-rose-500 font-medium">{errors.stock.message}</p>}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 block">Description (Optional)</label>
            <textarea
              {...register('description')}
              placeholder="Enter product description..."
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {errors.description && <p className="text-xs text-rose-500 font-medium">{errors.description.message}</p>}
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 focus:outline-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default MaterialsPage
