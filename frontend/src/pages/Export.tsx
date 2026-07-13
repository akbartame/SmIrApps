import { useState, useCallback } from 'react'
import { useDevices } from '../hooks/useDevices'
import { exportRawDataAPI } from '../api'
import { triggerFileDownload } from '../utils/download'
import { Typography } from '../components/Typography'
import { cn } from '../utils/cn'
import axios from 'axios'

const pad2 = (v: number) => String(v).padStart(2, '0')
const formatDateTimeLocal = (seconds: number) => {
  const d = new Date(seconds * 1000)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
const parseDateTimeLocal = (v: string) => Math.floor(new Date(v).getTime() / 1000)

const PRESETS: { label: string; seconds: number }[] = [
  { label: '1H', seconds: 3600 },
  { label: '6H', seconds: 6 * 3600 },
  { label: '24H', seconds: 24 * 3600 },
  { label: '7D', seconds: 7 * 24 * 3600 },
]

const MAX_RAW_EXPORT_SECONDS = 7 * 24 * 3600

export default function Export() {
  const { devices, loading: devicesLoading } = useDevices()

  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [startTime, setStartTime] = useState<number>(() => Math.floor(Date.now() / 1000) - 24 * 3600)
  const [endTime, setEndTime] = useState<number>(() => Math.floor(Date.now() / 1000))
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activePreset, setActivePreset] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  
  const isAllSelected = devices.length > 0 && selectedDevices.length === devices.length

  const applyPreset = (seconds: number) => {
    setStartTime(endTime - seconds)
    setActivePreset(seconds)
  }

  const handleExportRaw = useCallback(async () => {
    if (selectedDevices.length === 0) {
      setError('Pilih setidaknya satu perangkat.')
      return
    }
    if (endTime <= startTime) {
      setError('Tanggal akhir harus lebih besar dari tanggal awal.')
      return
    }
    if (endTime - startTime > MAX_RAW_EXPORT_SECONDS) {
      setError('Rentang RAW maksimal 7 hari. Gunakan agregasi untuk periode lebih panjang.')
      return
    }

    setIsExporting(true)
    setError(null)
    try {
      const blob = await exportRawDataAPI(selectedDevices, startTime, endTime)
      triggerFileDownload(blob, `fsiot_export_raw_${new Date().toISOString().replace(/[:.]/g, '-')}.zip`)
    } catch (err : unknown) {
      console.error('Export failed', err)
      // Type Narrowing 1: Apakah ini error dari Axios?
      if (axios.isAxiosError(err)) {
        if (err.response?.data instanceof Blob && err.response.data.type === 'application/json') {
          try {
            const text = await err.response.data.text();
            const jsonError = JSON.parse(text);
            setError(jsonError.error || jsonError.message || 'Gagal mengekspor data.');
          } catch {
            setError('Gagal mengekspor data (Respons API tidak dapat dibaca).');
          }
        } else {
          setError(err.message || 'Gagal mengekspor data dari server.');
        }
      } 
      // Type Narrowing 2: Apakah ini error standar JavaScript?
      else if (err instanceof Error) {
        setError(err.message);
      } 
      else {
        setError('Terjadi kesalahan yang tidak diketahui saat mengekspor data.');
      }
    } finally {
      setIsExporting(false)
    }
  }, [selectedDevices, startTime, endTime])

  const handleToggleSelect = useCallback((deviceId: string) => {
    setSelectedDevices(prev => 
      prev.includes(deviceId) 
        ? prev.filter(id => id !== deviceId) 
        : [...prev, deviceId]
    )
  }, [])

  const filteredDevices = devices.filter(d => d.device_id.toLowerCase().includes(searchQuery.toLowerCase()))

  return (
    <div className="animate-fade-up p-5 md:p-8">
      
      {/* Header */}
      <div className="mb-8">
        <Typography variant="caption" className="mb-1.5 block">
          EXPORT DATA
        </Typography>
        <Typography variant="h1">
          Export
        </Typography>
      </div>

      {/* Main Layout: Stack on mobile, Wrap on desktop */}
      <div className="flex flex-col gap-8 md:flex-row md:flex-wrap md:items-start md:gap-8">
        
        {/* DEVICES SECTION */}
        <div className="flex w-full flex-col gap-1.5 md:w-70">
          <Typography variant="caption" as="label">DEVICES</Typography>
          
          <div className="flex min-h-40 max-h-60 flex-col gap-2 border border-border-subtle bg-surface p-2">
            <input 
              type="text" 
              placeholder="Cari device..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full border border-border-subtle bg-transparent px-2.5 py-1.5 font-mono text-[13px] text-text-primary outline-none transition-colors focus:border-border-bright focus:bg-raised"
            />
            
            <div className="flex flex-col gap-1 overflow-y-auto pr-1">
              {filteredDevices.map(d => {
                const isSelected = selectedDevices.includes(d.device_id)
                return (
                  <div 
                    key={d.device_id}
                    onClick={() => handleToggleSelect(d.device_id)}
                    className={cn(
                      "cursor-pointer rounded-[1px] px-2 py-1 font-mono text-[13px] select-none transition-colors",
                      isSelected 
                        ? "bg-accent text-black" 
                        : "bg-transparent text-text-primary hover:bg-raised"
                    )}
                  >
                    {d.device_id}
                  </div>
                )
              })}
              
              {filteredDevices.length === 0 && (
                <div className="px-2 py-1 font-mono text-[11px] text-text-muted">
                  Tidak ada hasil.
                </div>
              )}
            </div>
          </div>

          <button 
            onClick={() => {
              if (isAllSelected) {
                setSelectedDevices([])
              } else {
                setSelectedDevices(devices.map(d => d.device_id).filter(Boolean))
              }
            }}
            className={cn(
              "mt-1 w-fit cursor-pointer border px-2.5 py-1.5 font-mono text-[11px] select-none transition-colors",
              isAllSelected 
                ? "border-border-subtle bg-surface text-text-muted hover:text-text-primary"
                : "border-accent/30 bg-accent/10 text-accent hover:bg-accent/20"
            )}
          >
            {isAllSelected ? 'Unselect All' : 'Select All'}
          </button>
        </div>

        {/* TIME & EXPORT CONTROLS WRAPPER */}
        <div className="flex flex-col gap-8 md:flex-1 md:min-w-100">
          
          {/* PRESETS */}
          <div className="flex flex-col gap-1.5">
            <Typography variant="caption" as="label">PRESET</Typography>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(p => (
                <button 
                  key={p.label} 
                  onClick={() => applyPreset(p.seconds)} 
                  className={cn(
                    "border px-3.5 py-2 font-mono text-[11px] transition-colors",
                    activePreset === p.seconds 
                      ? "border-accent bg-accent text-black" 
                      : "border-border-subtle bg-surface text-text-secondary hover:text-text-primary"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* MANUAL RANGE */}
          <div className="flex flex-col gap-1.5">
            <Typography variant="caption" as="label">MANUAL RANGE</Typography>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <input 
                type="datetime-local" 
                className="datetime-input w-full border border-border-subtle bg-surface px-3 py-2 font-mono text-[11px] text-text-primary outline-none focus:border-border-bright sm:w-auto"
                value={formatDateTimeLocal(startTime)} 
                onChange={e => {
                  setStartTime(parseDateTimeLocal(e.target.value))
                  setActivePreset(null)
                }} 
              />
              <input 
                type="datetime-local"
                className="datetime-input w-full border border-border-subtle bg-surface px-3 py-2 font-mono text-[11px] text-text-primary outline-none focus:border-border-bright sm:w-auto"
                value={formatDateTimeLocal(endTime)} 
                onChange={e => {
                  setEndTime(parseDateTimeLocal(e.target.value))
                  setActivePreset(null)
                }} 
              />
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-text-muted">
              Max RAW export range: 7 days.
            </div>
          </div>

          {/* EXPORT TRIGGER */}
          <div className="flex flex-col gap-1.5 pt-2">
            <Typography variant="caption" as="label">DOWNLOAD</Typography>
            <button 
              onClick={handleExportRaw} 
              disabled={isExporting || devicesLoading || selectedDevices.length === 0} 
              className={cn(
                "w-fit border px-4 py-2 font-mono text-[11px] font-semibold tracking-widest transition-colors",
                isExporting || devicesLoading || selectedDevices.length === 0
                  ? "cursor-not-allowed border-border-subtle bg-surface text-text-muted opacity-50"
                  : "cursor-pointer border-green-500/30 bg-green-500/10 text-green-500 hover:bg-green-500/20"
              )}
            >
              {isExporting ? 'SEDANG MENYIAPKAN...' : '↓ RAW ZIP'}
            </button>
          </div>
          
        </div>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <div className="mt-8 border border-red-500/20 bg-red-500/10 p-4 font-mono text-[11px] text-red-500">
          ⚠ {error}
        </div>
      )}

    </div>
  )
}