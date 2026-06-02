import { useState, useEffect } from 'react'

export const useVisualViewport = () => {
  const [bottomOffset, setBottomOffset] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return

    const handleResize = () => {
      const vv = window.visualViewport
      if (!vv) return
      // Calculate how much the viewport is pushed up (keyboard height)
      const offset = window.innerHeight - vv.height
      setBottomOffset(offset > 0 ? offset : 0)
    }

    window.visualViewport.addEventListener('resize', handleResize)
    window.visualViewport.addEventListener('scroll', handleResize)

    // Initial check
    handleResize()

    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize)
      window.visualViewport?.removeEventListener('scroll', handleResize)
    }
  }, [])

  return bottomOffset
}

export default useVisualViewport
