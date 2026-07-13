import { useState, useEffect, useCallback } from 'react'
import { Typography } from '../components/Typography'
import { cn } from '../utils/cn'
import { useDevices } from '../hooks/useDevices'
import { openWiFi, closeWiFi, handleApiError } from '../api'

// Helper untuk format waktu
const formatTimeAgo = (secondsAgo: number) => {
  if (secondsAgo < 60) return `${Math.floor(secondsAgo)}s ago`
  const minutes = Math.floor(secondsAgo / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function Devices() {
  const { devices, loading, error, refetch } = useDevices()
  
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null)
  const [isSending, setIsSending] = useState<boolean>(false)
  const [now, setNow] = useState<number>(() => Math.floor(Date.now() / 1000))
  // Detak jantung (Heartbeat) untuk memperbarui waktu relatif setiap 5 detik
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000))
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  // Handler Kontrol Perangkat dengan Operasional Guard
  const handleCommand = useCallback(async (action: 'open' | 'close') => {
    if (!selectedDevice) return

    // 1. Interseptor Konfirmasi
    const isConfirmed = window.confirm(
      `Peringatan Keamanan:\n\nApakah Anda yakin ingin melakukan ${action.toUpperCase()} WIFI pada perangkat ${selectedDevice}?`
    )
    if (!isConfirmed) return

    // 2. Proteksi Penumpukan Perintah (Flooding)
    setIsSending(true)
    try {
      if (action === 'open') {
        await openWiFi(selectedDevice)
      } else {
        await closeWiFi(selectedDevice)
      }
      alert(`Perintah ${action.toUpperCase()} WiFi berhasil dikirim ke antrean MQTT.`)
    } catch (err) {
      alert(`Gagal mengirim perintah: \n${handleApiError(err)}`)
    } finally {
      setIsSending(false)
    }
  }, [selectedDevice])

  return (
    <div className="animate-fade-up p-5 md:p-8">

      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Typography variant="caption" className="mb-1.5 block">
            DEVICE MANAGEMENT
          </Typography>
          <Typography variant="h1">
            Devices
          </Typography>
        </div>
        <button 
          onClick={refetch} 
          disabled={loading}
          className="mt-4 w-fit border border-border-subtle bg-surface px-4 py-2 font-mono text-[11px] tracking-widest text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50 sm:mt-0"
        >
          {loading ? 'REFRESHING...' : '↺ REFRESH'}
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 border border-red-500/20 bg-red-500/10 p-4 font-mono text-[11px] text-red-500">
          ⚠ Gagal memuat daftar perangkat: {error}
        </div>
      )}

      {/* Main Layout: Stack on mobile (Control first, then Table), Grid on desktop */}
      <div className="flex flex-col-reverse gap-6 md:grid md:grid-cols-[1fr_320px] md:items-start md:gap-4">

        {/* Device table */}
        <div className="border border-border-subtle bg-surface">

          {/* Table header */}
          <div className="hidden border-b border-border-subtle bg-raised px-5 py-3 sm:grid sm:grid-cols-[1fr_120px_100px_80px]">
            {['DEVICE ID', 'LAST SEEN', 'READINGS', 'STATUS'].map((col) => (
              <Typography key={col} variant="caption">
                {col}
              </Typography>
            ))}
          </div>

          {/* Table body */}
          <div className="flex flex-col">
            {devices.map((device) => {
              const isSelected = selectedDevice === device.device_id
              const secondsAgo = Math.max(0, now - device.last_seen)
              const isOnline = secondsAgo < 15 // Toleransi batas 3 interval (3 x 5s)

              return (
                <div
                  key={device.device_id}
                  className={cn(
                    "grid cursor-pointer grid-cols-2 gap-y-3 border-b border-border-subtle px-5 py-4 transition-colors sm:grid-cols-[1fr_120px_100px_80px] sm:gap-y-0",
                    isSelected ? "bg-accent/10" : "bg-transparent hover:bg-raised"
                  )}
                  onClick={() => setSelectedDevice(device.device_id)}
                >
                  <div className="font-mono text-[13px] text-text-primary">
                    <span className="mb-1 block text-[9px] text-text-muted sm:hidden">DEVICE ID</span>
                    {device.device_id}
                  </div>
                  <div className="font-mono text-[12px] text-text-secondary">
                    <span className="mb-1 block text-[9px] text-text-muted sm:hidden">LAST SEEN</span>
                    {formatTimeAgo(secondsAgo)}
                  </div>
                  <div className="font-mono text-[12px] text-text-secondary">
                    <span className="mb-1 block text-[9px] text-text-muted sm:hidden">READINGS</span>
                    {device.total_readings.toLocaleString()}
                  </div>
                  <div>
                    <span className="mb-1 block text-[9px] text-text-muted sm:hidden">STATUS</span>
                    <div className={cn(
                      "inline-block border px-2 py-0.5 font-mono text-[10px]",
                      isOnline 
                        ? "border-green-500/30 bg-green-500/10 text-green-500" 
                        : "border-red-500/30 bg-red-500/10 text-red-500"
                    )}>
                      {isOnline ? 'ONLINE' : 'OFFLINE'}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Empty state */}
            {!loading && devices.length === 0 && (
              <div className="py-10 text-center font-mono text-[11px] text-text-muted">
                no devices found — waiting for data
              </div>
            )}
          </div>

        </div>

        {/* Control panel */}
        <div className="border border-border-subtle bg-surface sticky top-6">
          <div className="border-b border-border-subtle bg-raised px-4 py-3">
            <Typography variant="caption">DEVICE CONTROL</Typography>
          </div>

          <div className="p-4 sm:p-5">

            {/* Selected device */}
            <div className="mb-5">
              <Typography variant="caption" className="mb-1.5 block">SELECTED</Typography>
              <div className={cn(
                "min-h-5 font-mono text-[13px]",
                selectedDevice ? "text-accent font-semibold" : "text-text-muted"
              )}>
                {selectedDevice ?? '— none —'}
              </div>
            </div>

            {/* WiFi portal controls */}
            <div className="mb-5">
              <Typography variant="caption" className="mb-2.5 block">WIFI PORTAL</Typography>
              <div className="flex flex-col gap-2">
                <button
                  disabled={!selectedDevice || isSending}
                  onClick={() => handleCommand('open')}
                  className={cn(
                    "border px-4 py-2.5 text-left font-mono text-[11px] tracking-widest transition-colors",
                    selectedDevice && !isSending
                      ? "cursor-pointer border-accent bg-transparent text-accent hover:bg-accent/10"
                      : "cursor-not-allowed border-border-subtle bg-transparent text-text-muted opacity-60"
                  )}
                >
                  {isSending ? 'PROCESSING...' : '▶ OPEN PORTAL'}
                </button>
                <button
                  disabled={!selectedDevice || isSending}
                  onClick={() => handleCommand('close')}
                  className={cn(
                    "border px-4 py-2.5 text-left font-mono text-[11px] tracking-widest transition-colors",
                    selectedDevice && !isSending
                      ? "cursor-pointer border-border-bright bg-transparent text-text-secondary hover:text-text-primary"
                      : "cursor-not-allowed border-border-subtle bg-transparent text-text-muted opacity-60"
                  )}
                >
                  {isSending ? 'PROCESSING...' : '■ CLOSE PORTAL'}
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="mb-5 border-t border-border-subtle" />

            {/* Info */}
            <div className="font-mono text-[10px] leading-relaxed text-text-muted">
              {selectedDevice 
                ? "WARNING: Opening the WiFi portal will expose the configuration network. Ensure physical security." 
                : "SELECT A DEVICE FROM THE TABLE TO ENABLE CONTROLS"}
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}