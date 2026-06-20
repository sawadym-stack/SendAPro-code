import { useEffect, useMemo, useRef, useState } from 'react'
import LeafletMap from './LeafletMap'
import type { MapMarker } from './LeafletMap'

interface LiveTrackingMapProps {
  customerLat: number
  customerLng: number
  technicianLat?: number
  technicianLng?: number
  onMapLoad?: () => void
}

const LiveTrackingMap = ({
  customerLat,
  customerLng,
  technicianLat,
  technicianLng,
  onMapLoad,
}: LiveTrackingMapProps) => {
  const parsedCustLat = customerLat != null ? parseFloat(customerLat as any) : NaN
  const parsedCustLng = customerLng != null ? parseFloat(customerLng as any) : NaN
  const parsedTechLat = technicianLat != null ? parseFloat(technicianLat as any) : NaN
  const parsedTechLng = technicianLng != null ? parseFloat(technicianLng as any) : NaN

  const hasCust = !isNaN(parsedCustLat) && !isNaN(parsedCustLng)
  const hasTech = !isNaN(parsedTechLat) && !isNaN(parsedTechLng)

  const [roadCoords, setRoadCoords] = useState<[number, number][]>([])
  const lastFetchedRef = useRef<{ lat: number; lng: number } | null>(null)

  // Fetch actual driving road route from OSRM when coordinates change
  useEffect(() => {
    if (!hasCust || !hasTech) return

    // Calculate distance since last fetch to prevent spamming OSRM during fast simulations
    const dist = lastFetchedRef.current
      ? Math.sqrt(
          Math.pow(parsedTechLat - lastFetchedRef.current.lat, 2) +
            Math.pow(parsedTechLng - lastFetchedRef.current.lng, 2)
        )
      : 999

    // Only refetch if the technician moved by ~100m or if it's the first render
    if (dist < 0.001) return

    const getRoadRoute = async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${parsedTechLng},${parsedTechLat};${parsedCustLng},${parsedCustLat}?overview=full&geometries=geojson`
        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json()
          if (data.routes && data.routes.length > 0) {
            const coords = data.routes[0].geometry.coordinates.map(
              (c: [number, number]) => [c[1], c[0]] as [number, number]
            )
            setRoadCoords(coords)
            lastFetchedRef.current = { lat: parsedTechLat, lng: parsedTechLng }
          }
        }
      } catch (err) {
        console.error('Failed to fetch road route for map:', err)
      }
    }

    getRoadRoute()
  }, [parsedCustLat, parsedCustLng, parsedTechLat, parsedTechLng, hasCust, hasTech])

  // Center is the midpoint between customer and technician
  const center = useMemo(() => {
    if (!hasCust) {
      return { lat: 0, lng: 0 }
    }
    if (!hasTech) {
      return { lat: parsedCustLat, lng: parsedCustLng }
    }
    return {
      lat: (parsedCustLat + parsedTechLat) / 2,
      lng: (parsedCustLng + parsedTechLng) / 2,
    }
  }, [parsedCustLat, parsedCustLng, parsedTechLat, parsedTechLng, hasCust, hasTech])

  // Build map markers
  const markers = useMemo((): MapMarker[] => {
    const list: MapMarker[] = []

    if (hasCust) {
      list.push({
        id: 'customer_home',
        lat: parsedCustLat,
        lng: parsedCustLng,
        title: 'Customer (Home)',
        color: 'green',
      })
    }

    if (hasTech) {
      list.push({
        id: 'technician_pos',
        lat: parsedTechLat,
        lng: parsedTechLng,
        title: '⚡ Technician',
        color: 'blue',
      })
    }

    return list
  }, [parsedCustLat, parsedCustLng, parsedTechLat, parsedTechLng, hasCust, hasTech])

  // Route path coords along roads
  const polylineCoords = useMemo((): [number, number][] | undefined => {
    if (!hasCust || !hasTech) return undefined
    if (roadCoords.length > 0) {
      // Connect current technician location to the start of the fetched road coords
      return [[parsedTechLat, parsedTechLng], ...roadCoords]
    }
    // Fallback to straight line
    return [
      [parsedCustLat, parsedCustLng],
      [parsedTechLat, parsedTechLng],
    ]
  }, [parsedCustLat, parsedCustLng, parsedTechLat, parsedTechLng, hasCust, hasTech, roadCoords])

  // Fire loading handler immediately as Leaflet is loaded
  if (onMapLoad) {
    onMapLoad()
  }


  return (
    <div className="relative h-[360px] overflow-hidden rounded-xl border border-slate-900 bg-slate-950 shadow-inner">
      <LeafletMap
        centerLat={center.lat}
        centerLng={center.lng}
        zoom={14}
        markers={markers}
        polylineCoords={polylineCoords}
        accuracyCircleCenter={
          hasTech
            ? { lat: parsedTechLat, lng: parsedTechLng }
            : undefined
        }
        accuracyCircleRadius={10} // 10m accuracy circle
      />

      {(technicianLat == null || technicianLng == null) && (
        <div className="absolute left-3 top-3 rounded-lg border border-slate-800 bg-slate-950/90 px-3 py-2 text-xs font-bold text-slate-450 shadow-xl backdrop-blur-sm z-20">
          Waiting for technician location...
        </div>
      )}
    </div>
  )
}

export default LiveTrackingMap
