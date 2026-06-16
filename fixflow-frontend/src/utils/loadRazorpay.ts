/**
 * Lazy-loads the Razorpay Checkout SDK on demand.
 * The script is only injected once; subsequent calls resolve immediately.
 */
let razorpayPromise: Promise<void> | null = null

export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()

  if (!razorpayPromise) {
    razorpayPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => {
        razorpayPromise = null
        reject(new Error('Failed to load Razorpay SDK'))
      }
      document.head.appendChild(script)
    })
  }

  return razorpayPromise
}
