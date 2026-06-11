import React, { useEffect, useRef } from 'react'
import { Track } from 'livekit-client'

const BAR_COUNT = 20

export function Waveform({ room, active }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const analyserRef = useRef(null)
  const audioCtxRef = useRef(null)

  useEffect(() => {
    if (!active || !room) {
      cancelAnimationFrame(animRef.current)
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      return
    }

    const pub = room.localParticipant?.getTrackPublication(Track.Source.Microphone)
    const mediaStreamTrack = pub?.track?.mediaStreamTrack
    if (!mediaStreamTrack) return

    const audioCtx = new AudioContext()
    audioCtxRef.current = audioCtx
    const source = audioCtx.createMediaStreamSource(new MediaStream([mediaStreamTrack]))
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 64
    source.connect(analyser)
    analyserRef.current = analyser

    const data = new Uint8Array(analyser.frequencyBinCount)
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    function draw() {
      animRef.current = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(data)

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const barW = canvas.width / BAR_COUNT
      const step = Math.floor(data.length / BAR_COUNT)

      for (let i = 0; i < BAR_COUNT; i++) {
        const value = data[i * step] / 255
        const barH = Math.max(2, value * canvas.height)
        const x = i * barW + barW * 0.15
        const w = barW * 0.7
        const y = (canvas.height - barH) / 2

        ctx.fillStyle = `rgba(0, 255, 65, ${0.4 + value * 0.6})`
        ctx.fillRect(x, y, w, barH)
      }
    }

    draw()

    return () => {
      cancelAnimationFrame(animRef.current)
      audioCtx.close()
    }
  }, [active, room])

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={40}
      style={{ display: 'block' }}
    />
  )
}
