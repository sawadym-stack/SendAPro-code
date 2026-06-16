import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default leaflet marker icon references in production builds
const getMarkerIcon = (color: 'blue' | 'red' | 'green' | 'gold') => {
  return L.icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color}.png`,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  })
}

export interface MapMarker {
  id: string
  lat: number
  lng: number
  title: string
  color: 'blue' | 'red' | 'green' | 'gold'
  popupContent?: React.ReactNode | string
  onClick?: () => void
}

interface LeafletMapProps {
  centerLat: number
  centerLng: number
  zoom?: number
  markers?: MapMarker[]
  polylineCoords?: [number, number][] // [lat, lng] array
  accuracyCircleCenter?: { lat: number; lng: number }
  accuracyCircleRadius?: number // in meters
  onMapClick?: (lat: number, lng: number) => void
  markerDraggableId?: string // if matches a marker's id, that marker becomes draggable
  onMarkerDragEnd?: (id: string, lat: number, lng: number) => void
}

const LeafletMap = ({
  centerLat,
  centerLng,
  zoom = 13,
  markers = [],
  polylineCoords,
  accuracyCircleCenter,
  accuracyCircleRadius,
  onMapClick,
  markerDraggableId,
  onMarkerDragEnd,
}: LeafletMapProps) => {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const polylineRef = useRef<L.Polyline | null>(null)
  const circleRef = useRef<L.Circle | null>(null)

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return

    const validLat = typeof centerLat === 'number' && !isNaN(centerLat)
    const validLng = typeof centerLng === 'number' && !isNaN(centerLng)

    if (!validLat || !validLng) {
      console.warn("LeafletMap: Invalid initial center coordinates", centerLat, centerLng)
      return
    }

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([centerLat, centerLng], zoom)
    
    mapRef.current = map

    // Add standard OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map)

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // 2. Handle map panning/zooming when center changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const validLat = typeof centerLat === 'number' && !isNaN(centerLat)
    const validLng = typeof centerLng === 'number' && !isNaN(centerLng)
    if (!validLat || !validLng) {
      console.warn("LeafletMap: Invalid center coordinates update", centerLat, centerLng)
      return
    }

    map.setView([centerLat, centerLng], map.getZoom() || zoom)
  }, [centerLat, centerLng])

  // 3. Handle map clicks
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const handleClick = (e: L.LeafletMouseEvent) => {
      onMapClick?.(e.latlng.lat, e.latlng.lng)
    }

    map.on('click', handleClick)
    return () => {
      map.off('click', handleClick)
    }
  }, [onMapClick])

  // 4. Handle Markers update
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Clear old markers
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    // Add new markers
    markers.forEach((markerData) => {
      const parsedLat = parseFloat(markerData.lat as any)
      const parsedLng = parseFloat(markerData.lng as any)
      if (isNaN(parsedLat) || isNaN(parsedLng)) {
        return
      }

      const isDraggable = markerData.id === markerDraggableId
      const marker = L.marker([parsedLat, parsedLng], {
        icon: getMarkerIcon(markerData.color),
        draggable: isDraggable,
      }).addTo(map)

      if (isDraggable) {
        marker.on('dragend', () => {
          const latLng = marker.getLatLng()
          onMarkerDragEnd?.(markerData.id, latLng.lat, latLng.lng)
        })
      }

      if (markerData.popupContent) {
        if (typeof markerData.popupContent === 'string') {
          marker.bindPopup(markerData.popupContent)
        } else {
          const div = document.createElement('div')
          L.DomEvent.disableClickPropagation(div)
          marker.bindPopup(div)
          marker.on('popupopen', () => {
            div.innerHTML = `<div class="p-1 font-sans text-slate-800 text-xs">${markerData.title}</div>`
          })
        }
      } else {
        marker.bindPopup(markerData.title)
      }

      if (markerData.onClick) {
        marker.on('click', () => {
          markerData.onClick?.()
        })
      }

      markersRef.current.push(marker)
    })
  }, [markers, markerDraggableId, onMarkerDragEnd])

  // 5. Handle Polyline/Route updates
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Clear old polyline
    if (polylineRef.current) {
      polylineRef.current.remove()
      polylineRef.current = null
    }

    // Add new polyline
    if (polylineCoords && polylineCoords.length > 1) {
      const validCoords = polylineCoords
        .map(coord => [parseFloat(coord[0] as any), parseFloat(coord[1] as any)] as [number, number])
        .filter(coord => !isNaN(coord[0]) && !isNaN(coord[1]))

      if (validCoords.length > 1) {
        const polyline = L.polyline(validCoords, {
          color: '#3b82f6',
          weight: 4,
          opacity: 0.85,
          dashArray: '5, 10',
        }).addTo(map)
        polylineRef.current = polyline

        // Fit bounds to polyline
        const bounds = L.latLngBounds(validCoords)
        map.fitBounds(bounds, { padding: [40, 40] })
      }
    }
  }, [polylineCoords])

  // 6. Handle Accuracy Circle updates
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Clear old circle
    if (circleRef.current) {
      circleRef.current.remove()
      circleRef.current = null
    }

    // Add new accuracy circle
    if (accuracyCircleCenter && accuracyCircleRadius) {
      const parsedLat = parseFloat(accuracyCircleCenter.lat as any)
      const parsedLng = parseFloat(accuracyCircleCenter.lng as any)
      if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
        const circle = L.circle([parsedLat, parsedLng], accuracyCircleRadius, {
          color: '#10b981',
          fillColor: '#10b981',
          fillOpacity: 0.12,
          weight: 1.5,
        }).addTo(map)
        circleRef.current = circle
      }
    }
  }, [accuracyCircleCenter, accuracyCircleRadius])

  return <div ref={mapContainerRef} className="w-full h-full rounded-2xl z-10" />
}

export default LeafletMap
