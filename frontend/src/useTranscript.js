import { useCallback, useRef, useState } from 'react'
import { RoomEvent } from 'livekit-client'

export function useTranscript() {
  const [transcript, setTranscript] = useState([])
  const [interim, setInterim] = useState(null)
  const roomRef = useRef(null)
  const listenerRef = useRef(null)
  const pendingRef = useRef({}) // segmentId -> { speaker, text }

  const attach = useCallback((room) => {
    if (!room || listenerRef.current) return
    roomRef.current = room

    function onTranscription(segments, participant) {
      const isAgent = participant?.isAgent ?? false
      const speaker = isAgent ? 'QUARTERMASTER' : 'SOLDIER'

      for (const seg of segments) {
        if (seg.final) {
          if (seg.text?.trim()) {
            setTranscript((prev) => [
              ...prev,
              { speaker, text: seg.text.trim(), id: seg.id ?? Date.now() + Math.random() },
            ])
          }
          delete pendingRef.current[seg.id]
        } else {
          pendingRef.current[seg.id ?? '_'] = { speaker, text: seg.text }
        }
      }

      const pending = Object.values(pendingRef.current)
      if (pending.length) {
        const text = pending.map((s) => s.text).join(' ').trim()
        setInterim(text ? { speaker: pending[0].speaker, text } : null)
      } else {
        setInterim(null)
      }
    }

    room.on(RoomEvent.TranscriptionReceived, onTranscription)
    listenerRef.current = onTranscription
  }, [])

  const detach = useCallback(() => {
    if (!roomRef.current || !listenerRef.current) return
    roomRef.current.off(RoomEvent.TranscriptionReceived, listenerRef.current)
    listenerRef.current = null
    roomRef.current = null
    pendingRef.current = {}
  }, [])

  const clear = useCallback(() => {
    setTranscript([])
    setInterim(null)
    pendingRef.current = {}
  }, [])

  return { transcript, interim, attach, detach, clear }
}
