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
        let message = 'Unable to fetch location.'
        if (error.code === error.PERMISSION_DENIED) message = 'Location permission denied. Please allow GPS access.'
        if (error.code === error.POSITION_UNAVAILABLE) message = 'Location unavailable. Please try again in a better signal area.'
        if (error.code === error.TIMEOUT) message = 'Location request timed out. Please retry.'
        setState((prev) => ({ ...prev, loading: false, error: message }))
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
