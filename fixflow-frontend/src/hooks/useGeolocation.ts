import { useEffect, useState } from 'react'

interface GeolocationState {
  lat: number | null
  lng: number | null
  address: string
  error: string | null
  loading: boolean
}

export const useGeolocation = (autoRun = false) => {
  const [state, setState] = useState<GeolocationState>({
    lat: null,
    lng: null,
    address: '',
    error: null,
    loading: autoRun,
  })

  const detect = () => {
    if (!navigator.geolocation) {
      setState((prev) => ({ ...prev, loading: false, error: 'Geolocation is not supported by this browser.' }))
      return
    }

    setState((prev) => ({ ...prev, loading: true, error: null }))

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        setState({ lat, lng, address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, error: null, loading: false })
      },
      (error) => {
        console.warn('Geolocation failed, falling back to Kozhikode coordinates:', error)
        setState({
          lat: 11.2588,
          lng: 75.7804,
          address: 'Kozhikode, Kerala (Fallback)',
          error: null,
          loading: false,
        })
      },
      { timeout: 10000, enableHighAccuracy: true },
    )
  }

  useEffect(() => {
    if (autoRun) {
      detect()
    }
  }, [autoRun])

  return { ...state, detect, setAddress: (address: string) => setState((prev) => ({ ...prev, address })) }
}
