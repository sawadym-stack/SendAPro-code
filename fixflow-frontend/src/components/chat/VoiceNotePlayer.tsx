import React, { useEffect, useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'

interface VoiceNotePlayerProps {
  url: string
  duration?: number
}

// Generate consistent random-like heights based on the URL hash
const getSeededHeights = (url: string) => {
  let hash = 0
  for (let i = 0; i < url.length; i++) {
    hash = url.charCodeAt(i) + ((hash << 5) - hash)
  }
  const heights = []
  for (let i = 0; i < 12; i++) {
    const val = Math.abs((hash >> (i * 2)) % 60) + 30 // height between 30% and 90%
    heights.push(val)
  }
  return heights
}

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({ url, duration }) => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(duration ?? 0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const progressBarRef = useRef<HTMLDivElement>(null)

  const seededHeights = React.useMemo(() => getSeededHeights(url), [url])

  useEffect(() => {
    // Create audio instance
    const audio = new Audio(url)
    audioRef.current = audio

    const onLoadedMetadata = () => {
      if (audio.duration && audio.duration !== Infinity) {
        setAudioDuration(audio.duration)
      }
    }

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const onEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEnded)

    // Attempt to load metadata immediately if already available
    if (audio.readyState >= 1) {
      onLoadedMetadata()
    }

    return () => {
      audio.pause()
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended', onEnded)
      audioRef.current = null
    }
  }, [url])

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play().catch((err) => {
        console.error('Failed to play audio:', err)
      })
      setIsPlaying(true)
    }
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !progressBarRef.current || audioDuration === 0) return

    const rect = progressBarRef.current.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const percentage = Math.max(0, Math.min(1, clickX / rect.width))

    audioRef.current.currentTime = percentage * audioDuration
    setCurrentTime(percentage * audioDuration)
  }

  const formatTime = (time: number) => {
    if (isNaN(time) || time === Infinity) return '0:00'
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
  }

  const progressPercent = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0

  return (
    <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-800/60 p-3 rounded-2xl w-[240px] select-none text-slate-100 shadow-md">
      {/* Play/Pause Trigger */}
      <button
        onClick={togglePlay}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/20 hover:scale-105 active:scale-95 transition-all duration-150"
      >
        {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
      </button>

      {/* Progress & Waveform */}
      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        <div
          ref={progressBarRef}
          onClick={handleProgressClick}
          className="relative h-7 flex items-end gap-[3px] cursor-pointer"
        >
          {/* Active progress background bar */}
          <div
            className="absolute inset-y-0 left-0 bg-sky-500/10 pointer-events-none rounded transition-all duration-100"
            style={{ width: `${progressPercent}%` }}
          />

          {/* Waveform bars */}
          {seededHeights.map((height, i) => {
            const isActive = progressPercent > (i / seededHeights.length) * 100
            return (
              <div
                key={i}
                className={`w-[4px] rounded-full transition-all duration-150 ${
                  isActive ? 'bg-sky-400 shadow-[0_0_8px_rgba(14,165,233,0.4)]' : 'bg-slate-700'
                }`}
                style={{
                  height: `${height}%`,
                  animation: isPlaying && isActive ? `pulseWave 0.8s ease-in-out infinite alternate` : undefined,
                  animationDelay: `${i * 80}ms`,
                }}
              />
            )
          })}
        </div>

        {/* Time display */}
        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(audioDuration)}</span>
        </div>
      </div>

      <style>{`
        @keyframes pulseWave {
          0% { transform: scaleY(1); }
          100% { transform: scaleY(1.3); }
        }
      `}</style>
    </div>
  )
}
export default VoiceNotePlayer
