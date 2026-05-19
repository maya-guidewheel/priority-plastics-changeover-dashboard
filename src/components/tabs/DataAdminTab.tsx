import { useState, useRef, useCallback, useEffect } from 'react'
import { apiFetch } from '../../utils/api'

interface DataStatus {
  changeovers: {
    count: number
    lastUpdated: string | null
    maxDate: string | null
    minDate: string | null
  }
  machine_stats: { count: number; lastUpdated: string | null }
}

interface IngestionLogRow {
  id: number
  file_name: string
  table_name: string
  rows_added: number
  duplicates_skipped: number
  ingested_at: string
}

interface Props {
  status: DataStatus | null
  onUploadSuccess: () => void
}

interface UploadResult {
  fileName: string
  rowsAdded: number
  duplicatesSkipped: number
  total: number
  type: string
}

export default function DataAdminTab({ status, onUploadSuccess }: Props) {
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [log, setLog] = useState<IngestionLogRow[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadLog = useCallback(async () => {
    try {
      const res = await apiFetch('/api/ingestion-log')
      if (res.ok) {
        const data = await res.json() as { log: IngestionLogRow[] }
        setLog(data.log)
      }
    } catch { /* non-fatal */ }
  }, [])

  useEffect(() => { loadLog() }, [loadLog])

  async function uploadFile(file: File) {
    setUploading(true)
    setUploadResult(null)
    setUploadError('')
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await apiFetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? 'Upload failed')
      }
      const result = await res.json() as UploadResult
      setUploadResult(result)
      await onUploadSuccess()
      await loadLog()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.name.endsWith('.csv')) uploadFile(file)
    else setUploadError('Please drop a .csv file.')
  }

  function fmtDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function fmtDatetime(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  }

  const daysCovered =
    status?.changeovers.minDate && status?.changeovers.maxDate
      ? Math.round(
          (new Date(status.changeovers.maxDate).getTime() -
            new Date(status.changeovers.minDate).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : null

  return (
    <div className="space-y-5">

      {/* Data Coverage */}
      <div className="pp-card p-5">
        <div className="pp-section-title">Data Coverage</div>
        {status ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>
                Earliest Data
              </div>
              <div className="font-bold text-lg" style={{ color: '#111827' }}>
                {fmtDate(status.changeovers.minDate)}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>
                Latest Data
              </div>
              <div className="font-bold text-lg" style={{ color: '#111827' }}>
                {fmtDate(status.changeovers.maxDate)}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>
                Days Covered
              </div>
              <div className="font-bold text-lg" style={{ color: '#111827' }}>
                {daysCovered !== null ? `${daysCovered} days` : '—'}
              </div>
              {daysCovered !== null && daysCovered < 30 && (
                <div className="text-xs mt-1" style={{ color: '#f59e0b' }}>
                  Less than 30 days — trends may not be representative.
                </div>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>
                Changeover Records
              </div>
              <div className="font-bold text-lg" style={{ color: '#111827' }}>
                {status.changeovers.count.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>
                Machine Stats Records
              </div>
              <div className="font-bold text-lg" style={{ color: '#111827' }}>
                {status.machine_stats.count.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>
                Last Uploaded
              </div>
              <div className="text-sm font-medium" style={{ color: '#374151' }}>
                {status.changeovers.lastUpdated
                  ? fmtDatetime(status.changeovers.lastUpdated)
                  : '—'}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color: '#9ca3af' }}>No data loaded yet.</div>
        )}
      </div>

      {/* Upload */}
      <div className="pp-card p-5">
        <div className="pp-section-title">Upload New CSV</div>

        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors"
          style={{
            borderColor: isDragging ? '#1e3a5f' : '#d1d5db',
            background: isDragging ? '#eff6ff' : '#fafafa',
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
            disabled={uploading}
          />
          {uploading ? (
            <div>
              <div className="text-2xl mb-2">⏳</div>
              <div className="font-medium" style={{ color: '#374151' }}>Uploading and processing…</div>
            </div>
          ) : (
            <div>
              <div className="text-3xl mb-2">📂</div>
              <div className="font-medium mb-1" style={{ color: '#374151' }}>
                Drop a CSV here, or click to browse
              </div>
              <div className="text-xs" style={{ color: '#9ca3af' }}>
                Accepts Guidewheel Issues exports (.csv). Stats/energy CSVs auto-detected by filename.
              </div>
            </div>
          )}
        </div>

        {uploadResult && (
          <div
            className="mt-3 flex items-start justify-between rounded-lg px-4 py-3 text-sm"
            style={{
              background: uploadResult.rowsAdded > 0 ? '#f0fdf4' : '#fffbeb',
              border: `1px solid ${uploadResult.rowsAdded > 0 ? '#bbf7d0' : '#fde68a'}`,
              color: uploadResult.rowsAdded > 0 ? '#166534' : '#92400e',
            }}
          >
            <div>
              <span className="font-semibold">{uploadResult.fileName}</span>
              {' — '}
              <span className="font-bold">
                {uploadResult.rowsAdded.toLocaleString()} records added
              </span>
              {uploadResult.duplicatesSkipped > 0 && (
                <span className="opacity-70">
                  , {uploadResult.duplicatesSkipped.toLocaleString()} duplicates skipped
                </span>
              )}
              <span className="ml-2 opacity-60">({uploadResult.type})</span>
            </div>
            <button onClick={() => setUploadResult(null)} className="ml-4 font-bold text-lg leading-none opacity-50 hover:opacity-100">
              ×
            </button>
          </div>
        )}

        {uploadError && (
          <div
            className="mt-3 rounded-lg px-4 py-3 text-sm"
            style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
          >
            {uploadError}
          </div>
        )}

        <div className="mt-4 text-xs space-y-1" style={{ color: '#6b7280' }}>
          <p>• Export from the Guidewheel Issues view and upload the CSV here to add new data.</p>
          <p>• Duplicate records are automatically detected and skipped — uploading the same file twice is safe.</p>
          <p>• Files with "stats" or "energy" in the filename are loaded as machine stats for the PVC Capacity tab.</p>
          <p>• Data persists on the server — it is available to all users and survives page refreshes.</p>
        </div>
      </div>

      {/* Ingestion log */}
      {log.length > 0 && (
        <div className="pp-card p-5">
          <div className="pp-section-title">Recent Upload History</div>
          <div className="overflow-x-auto">
            <table className="pp-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Table</th>
                  <th>Added</th>
                  <th>Skipped</th>
                </tr>
              </thead>
              <tbody>
                {log.map(row => (
                  <tr key={row.id}>
                    <td style={{ color: '#6b7280' }}>{fmtDatetime(row.ingested_at)}</td>
                    <td>
                      <span className="pp-badge-green">{row.table_name}</span>
                    </td>
                    <td className="tabular-nums font-semibold" style={{ color: '#16a34a' }}>
                      +{row.rows_added.toLocaleString()}
                    </td>
                    <td className="tabular-nums" style={{ color: '#9ca3af' }}>
                      {row.duplicates_skipped.toLocaleString()} skipped
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="pp-caption mt-2">
            File names are stored as hashed values for privacy.
          </p>
        </div>
      )}

    </div>
  )
}
