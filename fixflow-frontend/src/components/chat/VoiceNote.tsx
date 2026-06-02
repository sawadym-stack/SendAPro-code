import React, { useRef, useState, useEffect } from 'react'
import { Mic, Square, Send, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import VoiceNotePlayer from './VoiceNotePlayer'

interface VoiceNoteProps {
  roomId: string
  onSend: (file: File) => Promise<void>
}

export const VoiceNote: React.FC<VoiceNoteProps> = ({ onSend }) => {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<any>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  // Start recording voice
  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error('Voice recording is not supported in this browser.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const url = URL.createObjectURL(blob)
        setPreviewBlob(blob)
        setPreviewUrl(url)
      }

      mediaRecorder.start(100) // Collect chunks every 100ms
      setIsRecording(true)
      setDuration(0)

      timerRef.current = setInterval(() => {
        setDuration((d) => {
          if (d >= 119) {
            // Auto-stop at 120s (2 minutes)
            stopRecording()
            toast.success('Recording reached maximum duration limit (2 minutes).')
            return 120
          }
          return d + 1
        })
      }, 1000)
    } catch (err) {
      console.error('Microphone access error:', err)
      toast.error('Microphone permission required')
    }
  }

  // Stop recording voice
  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    setIsRecording(false)
  }

  const formatDuration = (sec: number) => {
    const minutes = Math.floor(sec / 60)
    const seconds = sec % 60
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
  }

  const handleSend = async () => {
    if (!previewBlob) return
    const file = new File([previewBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' })
    
    try {
      await onSend(file)
      discardPreview()
    } catch (err) {
      console.error('Failed to send voice note:', err)
    }
  }

  const discardPreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setPreviewBlob(null)
    setPreviewUrl(null)
    setDuration(0)
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    // Clear any existing preview first
    discardPreview()
    startRecording()
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    if (isRecording) {
      stopRecording()
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* 1. Preview State */}
      {previewUrl && (
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-2 rounded-2xl animate-fade-in shadow-xl">
          <VoiceNotePlayer url={previewUrl} duration={duration} />
          
          <button
            onClick={discardPreview}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all active:scale-95"
            title="Discard Voice Note"
          >
            <X className="h-4 w-4" />
          </button>

          <button
            onClick={handleSend}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-450 hover:bg-emerald-500/20 transition-all active:scale-95"
            title="Send Voice Note"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 2. Recording State UI */}
      {isRecording && (
        <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 px-4 py-2.5 rounded-2xl animate-pulse shadow-md">
          {/* Pulsing indicator */}
          <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
          <span className="text-xs font-bold text-red-400 font-mono">{formatDuration(duration)}</span>
          <span className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase font-mono hidden sm:inline">
            Release to send
          </span>
        </div>
      )}

      {/* 3. Idle / Record Button */}
      {!previewUrl && (
        <button
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          className={`flex h-11 w-11 items-center justify-center rounded-xl border text-sm font-semibold transition-all duration-200 select-none cursor-pointer ${
            isRecording
              ? 'bg-red-500/10 border-red-500/30 text-red-400 scale-110 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-sky-500/30 hover:text-sky-400 hover:bg-slate-900/60 active:scale-95'
          }`}
          title="Hold to Record Voice Note"
          style={{ touchAction: 'none' }}
        >
          {isRecording ? <Square className="h-5 w-5 animate-pulse" /> : <Mic className="h-5 w-5" />}
        </button>
      )}
    </div>
  )
}
export default VoiceNote
