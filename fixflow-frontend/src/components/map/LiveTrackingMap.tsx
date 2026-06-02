import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps'
import { useEffect, useMemo } from 'react'

interface LiveTrackingMapProps {
  customerLat: number
  customerLng: number
  technicianLat?: number
  technicianLng?: number
  onMapLoad?: () => void
}

const RouteLine = ({ customerLat, customerLng, technicianLat, technicianLng }: LiveTrackingMapProps) => {
  const map = useMap()

  useEffect(() => {
    if (!map || technicianLat == null || technicianLng == null || !window.google) return
    const polyline = new window.google.maps.Polyline({
      path: [
        { lat: customerLat, lng: customerLng },
        { lat: technicianLat, lng: technicianLng },
      ],
      strokeColor: '#2563eb',
      strokeOpacity: 0.9,
      strokeWeight: 4,
      map,
    })
    return () => polyline.setMap(null)
  }, [map, customerLat, customerLng, technicianLat, technicianLng])

  // Fit bounds once initially when map loads or customer coordinates are set
  useEffect(() => {
    if (!map || technicianLat == null || technicianLng == null || !window.google) return
    const bounds = new window.google.maps.LatLngBounds()
    bounds.extend({ lat: customerLat, lng: customerLng })
    bounds.extend({ lat: technicianLat, lng: technicianLng })
    map.fitBounds(bounds, 60)
  }, [map, customerLat, customerLng])

  // Smoothly pan to the technician's location when it changes
  useEffect(() => {
    if (!map || technicianLat == null || technicianLng == null || !window.google) return
    map.panTo({ lat: technicianLat, lng: technicianLng })
  }, [map, technicianLat, technicianLng])

  // Draw a 10-meter accuracy circle around the technician
  useEffect(() => {
    if (!map || technicianLat == null || technicianLng == null || !window.google) return
    const circle = new window.google.maps.Circle({
      strokeColor: '#3b82f6',
      strokeOpacity: 0.6,
      strokeWeight: 1.5,
      fillColor: '#3b82f6',
      fillOpacity: 0.15,
      map,
      center: { lat: technicianLat, lng: technicianLng },
      radius: 10, // 10m accuracy circle
    })
    return () => circle.setMap(null)
  }, [map, technicianLat, technicianLng])

  return null
}

const LiveTrackingMap = ({ customerLat, customerLng, technicianLat, technicianLng, onMapLoad }: LiveTrackingMapProps) => {
  const isGoogleMapsKeyInvalid = useMemo(() => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_KEY
    return !key || key.trim() === '' || key.trim() === 'your_key_here'
  }, [])

  const center = useMemo(() => {
    if (technicianLat == null || technicianLng == null) return { lat: customerLat, lng: customerLng }
    return { lat: (customerLat + technicianLat) / 2, lng: (customerLng + technicianLng) / 2 }
  }, [customerLat, customerLng, technicianLat, technicianLng])

  // Coordinate projection math for SVG Fallback Map
  const bounds = useMemo(() => {
    const pad = 0.015
    const latArr = [customerLat]
    const lngArr = [customerLng]
    if (technicianLat != null && technicianLng != null) {
      latArr.push(technicianLat)
      lngArr.push(technicianLng)
    }
    const minLat = Math.min(...latArr) - pad
    const maxLat = Math.max(...latArr) + pad
    const minLng = Math.min(...lngArr) - pad
    const maxLng = Math.max(...lngArr) + pad
    return { minLat, maxLat, minLng, maxLng }
  }, [customerLat, customerLng, technicianLat, technicianLng])

  const project = (lat: number, lng: number) => {
    const width = 500
    const height = 320
    const latDiff = bounds.maxLat - bounds.minLat || 1
    const lngDiff = bounds.maxLng - bounds.minLng || 1
    
    // X goes left-to-right, Y goes top-to-bottom
    const x = ((lng - bounds.minLng) / lngDiff) * (width - 100) + 50
    const y = (1 - (lat - bounds.minLat) / latDiff) * (height - 80) + 40
    return { x, y }
  }

  const customerPos = useMemo(() => project(customerLat, customerLng), [customerLat, customerLng, bounds])
  const technicianPos = useMemo(() => {
    if (technicianLat == null || technicianLng == null) return null
    return project(technicianLat, technicianLng)
  }, [technicianLat, technicianLng, bounds])

  // Distance calculation (Haversine)
  const distanceKm = useMemo(() => {
    if (technicianLat == null || technicianLng == null) return null
    const R = 6371
    const dLat = ((technicianLat - customerLat) * Math.PI) / 180
    const dLng = ((technicianLng - customerLng) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((customerLat * Math.PI) / 180) *
        Math.cos((technicianLat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return Math.round(R * c * 10) / 10
  }, [customerLat, customerLng, technicianLat, technicianLng])

  if (isGoogleMapsKeyInvalid) {
    return (
      <div className="relative h-[360px] overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-1 font-sans text-white shadow-inner">
        {/* Animated grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:24px_24px] opacity-60" />
        
        {/* Decorative scanline */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-500/5 to-transparent bg-[size:100%_20px] pointer-events-none animate-[scanline_8s_linear_infinite]" />

        {/* SVG Drawing Canvas */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 500 320">
          <defs>
            <radialGradient id="customer-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="tech-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </radialGradient>
            <style>{`
              @keyframes dash {
                to { stroke-dashoffset: -20; }
              }
              @keyframes pulseGlow {
                0%, 100% { r: 15px; opacity: 0.3; }
                50% { r: 35px; opacity: 0.6; }
              }
              @keyframes scanline {
                0% { transform: translateY(-100%); }
                100% { transform: translateY(100%); }
              }
            `}</style>
          </defs>

          {/* Simulated Roads/Grid Lines */}
          <path d="M 0 60 Q 250 80 500 60" fill="none" stroke="#1e293b" strokeWidth="6" strokeLinecap="round" opacity="0.4" />
          <path d="M 50 0 Q 120 180 80 320" fill="none" stroke="#1e293b" strokeWidth="4" opacity="0.4" />
          <path d="M 400 0 Q 350 160 420 320" fill="none" stroke="#1e293b" strokeWidth="5" opacity="0.4" />
          <path d="M 0 250 Q 250 200 500 240" fill="none" stroke="#1e293b" strokeWidth="4" opacity="0.4" />

          {/* Route path (if technician present) */}
          {technicianPos && (
            <>
              {/* Pulse line */}
              <line
                x1={technicianPos.x}
                y1={technicianPos.y}
                x2={customerPos.x}
                y2={customerPos.y}
                stroke="#3b82f6"
                strokeWidth="3.5"
                strokeDasharray="6,6"
                style={{ animation: 'dash 1.5s linear infinite' }}
              />
              <line
                x1={technicianPos.x}
                y1={technicianPos.y}
                x2={customerPos.x}
                y2={customerPos.y}
                stroke="#60a5fa"
                strokeWidth="1.5"
                opacity="0.7"
              />
            </>
          )}

          {/* Customer Location */}
          <circle cx={customerPos.x} cy={customerPos.y} r="25" fill="url(#customer-glow)" />
          <circle cx={customerPos.x} cy={customerPos.y} r="15" fill="none" stroke="#ef4444" strokeWidth="1" style={{ animation: 'pulseGlow 2.5s infinite ease-in-out' }} />
          <circle cx={customerPos.x} cy={customerPos.y} r="5" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
          <text x={customerPos.x} y={customerPos.y - 12} fill="#ef4444" fontSize="10" fontWeight="bold" textAnchor="middle">
            📍 HOME
          </text>

          {/* Technician Location */}
          {technicianPos ? (
            <g>
              <circle cx={technicianPos.x} cy={technicianPos.y} r="25" fill="url(#tech-glow)" />
              <circle cx={technicianPos.x} cy={technicianPos.y} r="8" fill="#3b82f6" stroke="#ffffff" strokeWidth="1.5" />
              
              {/* Arrow Direction Pointer */}
              <path 
                d="M -4 4 L 0 -6 L 4 4 Z" 
                fill="#ffffff" 
                transform={`translate(${technicianPos.x}, ${technicianPos.y}) rotate(${
                  Math.atan2(customerPos.y - technicianPos.y, customerPos.x - technicianPos.x) * (180 / Math.PI) + 90
                })`} 
              />
              <text x={technicianPos.x} y={technicianPos.y - 14} fill="#60a5fa" fontSize="10" fontWeight="bold" textAnchor="middle">
                ⚡ TECH
              </text>
            </g>
          ) : (
            <g>
              <circle cx="250" cy="160" r="40" fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="4,4" className="animate-spin" style={{ animationDuration: '10s' }} />
              <text x="250" y="165" fill="#94a3b8" fontSize="10" fontWeight="semibold" textAnchor="middle">
                Searching...
              </text>
            </g>
          )}
        </svg>

        {/* Floating status details */}
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/90 p-4 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
            </span>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Telemetry System</p>
              <h4 className="text-xs font-extrabold text-white">Live Match Feed Active</h4>
            </div>
          </div>
          {distanceKm != null && (
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Distance</p>
              <p className="text-sm font-black text-emerald-400">{distanceKm} km away</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-[360px] overflow-hidden rounded-xl border border-slate-900 bg-slate-950 shadow-inner">
      <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_KEY || ''} onLoad={onMapLoad}>
        <Map 
          defaultZoom={14} 
          center={center} 
          gestureHandling="greedy" 
          disableDefaultUI={false}
          mapId="DEMO_MAP_ID"
        >
          <AdvancedMarker 
            position={{ lat: customerLat, lng: customerLng }} 
            title="Customer"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 border-2 border-white text-white shadow-lg">
              <span className="text-xs">🏠</span>
            </div>
          </AdvancedMarker>

          {technicianLat != null && technicianLng != null && (
            <AdvancedMarker
              position={{ lat: technicianLat, lng: technicianLng }}
              title="Technician"
            >
              <div 
                className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 border-2 border-white shadow-xl"
                style={{
                  transition: 'transform 0.5s ease-out',
                }}
              >
                <div className="relative flex h-full w-full items-center justify-center">
                  <span className="text-sm">⚡</span>
                  <div className="absolute inset-0 rounded-full border-2 border-blue-400 animate-ping opacity-75" />
                </div>
              </div>
            </AdvancedMarker>
          )}

          <RouteLine 
            customerLat={customerLat} 
            customerLng={customerLng} 
            technicianLat={technicianLat} 
            technicianLng={technicianLng} 
          />
        </Map>
      </APIProvider>

      {(technicianLat == null || technicianLng == null) && (
        <div className="absolute left-3 top-3 rounded-lg border border-slate-800 bg-slate-950/90 px-3 py-2 text-xs font-bold text-slate-400 shadow-xl backdrop-blur-sm">
          Waiting for technician location...
        </div>
      )}
    </div>
  )
}

export default LiveTrackingMap
