import React, { useRef, useEffect, useState } from 'react'
import { Card, Button } from '../ui'
import { Sparkles, Trophy, Award } from 'lucide-react'

interface ScratchCardModalProps {
  isOpen: boolean
  onClose: () => void
  rewardAmount: number
}

export const ScratchCardModal: React.FC<ScratchCardModalProps> = ({
  isOpen,
  onClose,
  rewardAmount,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isScratched, setIsScratched] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear and draw silver scratch layer
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    // Create textured silver gradient
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
    grad.addColorStop(0, '#94a3b8') // slate-400
    grad.addColorStop(0.5, '#cbd5e1') // slate-300
    grad.addColorStop(1, '#64748b') // slate-500
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Add some noise/texturing to look realistic
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
    for (let i = 0; i < 400; i++) {
      const x = Math.random() * canvas.width
      const y = Math.random() * canvas.height
      ctx.fillRect(x, y, 2, 2)
    }

    // Add "SCRATCH HERE" label
    ctx.font = 'bold 13px Courier, monospace animate-pulse'
    ctx.fillStyle = '#1e293b' // slate-800
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('⚡ SCRATCH TO REVEAL ⚡', canvas.width / 2, canvas.height / 2)

    setIsScratched(false)
  }, [isOpen])

  if (!isOpen) return null

  // Canvas drawing handlers
  const getMousePos = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 }
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    
    // Check if touch or mouse
    if ('touches' in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 }
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      }
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    }
  }

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true)
    draw(e)
  }

  const stopDrawing = () => {
    setIsDrawing(false)
    checkScratchPercentage()
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || isScratched || !canvasRef.current) return
    e.preventDefault()

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const pos = getMousePos(e)
    
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, 18, 0, Math.PI * 2)
    ctx.fill()
  }

  const checkScratchPercentage = () => {
    if (isScratched || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const pixels = imgData.data
    let transparentCount = 0

    // Check alpha values (every 4th byte)
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] === 0) {
        transparentCount++
      }
    }

    const totalPixels = canvas.width * canvas.height
    const percentage = (transparentCount / totalPixels) * 100

    if (percentage > 40) {
      setIsScratched(true)
      // Clear completely
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-xl transition-all duration-300">
        
        {/* Header decoration */}
        <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500 w-full" />
        
        <div className="p-6 text-center space-y-6">
          <div className="flex flex-col items-center">
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-full mb-3">
              <Trophy size={28} className="animate-bounce" />
            </div>
            <h3 className="text-lg font-black text-white uppercase tracking-wider">Weekly Milestone Reached!</h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">Completed 10+ jobs in Kozhikode operations</p>
          </div>

          {/* Interactive scratch card area */}
          <div className="relative w-72 h-44 mx-auto bg-slate-950 border border-slate-850 rounded-2xl overflow-hidden flex items-center justify-center shadow-inner group">
            
            {/* Underlying reward screen */}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-950/40 via-slate-900 to-emerald-950/20 z-0">
              <Award className="text-yellow-500 w-8 h-8 mb-1 animate-pulse" />
              <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Scratch Reward</p>
              <h2 className="text-3xl font-black text-yellow-400 font-mono tracking-tight mt-1 animate-pulse">
                Rs. {rewardAmount}
              </h2>
              <span className="text-[9px] text-emerald-400 font-mono font-bold mt-1.5 flex items-center gap-1">
                <Sparkles size={10} /> Credited to Wallet
              </span>
            </div>

            {/* Top Scratchable Canvas Layer */}
            {!isScratched && (
              <canvas
                ref={canvasRef}
                width={288}
                height={176}
                onMouseDown={startDrawing}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onMouseMove={draw}
                onTouchStart={startDrawing}
                onTouchEnd={stopDrawing}
                onTouchMove={draw}
                className="absolute inset-0 z-10 cursor-crosshair touch-none transition-opacity duration-300"
              />
            )}
          </div>

          <div className="pt-2 font-mono text-center">
            {isScratched ? (
              <p className="text-xs text-emerald-450 font-bold animate-pulse">
                🎉 Congratulations! Rs. {rewardAmount} has been added to your payouts balance.
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Use your mouse or finger to scratch off the silver coating above!
              </p>
            )}
          </div>

          <Button
            onClick={onClose}
            disabled={!isScratched}
            fullWidth
            className={`font-black py-3 rounded-xl transition duration-200 active:scale-95 ${
              isScratched 
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white' 
                : 'bg-slate-800 text-slate-600 border border-slate-900 cursor-not-allowed'
            }`}
          >
            {isScratched ? 'CLAIM REWARD' : 'SCRATCH CARD FIRST'}
          </Button>
        </div>

      </div>
    </div>
  )
}
