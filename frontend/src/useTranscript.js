import { useCallback, useRef, useState } from 'react'
import { RoomEvent } from 'livekit-client'

export function useTranscript() {
  const [transcript, setTranscript] = useState([])
  const roomRef = useRef(null)
  const listenerRef = useRef(null)

  const attach = useCallback((room) => {
    if (!room || listenerRef.current) return
    roomRef.current = room

    function onTranscription(segments, participant) {
      const finalSegments = segments.filter((s) => s.final)
      if (!finalSegments.length) return

      const text = finalSegments.map((s) => s.text).join(' ').trim()
      if (!text) return

      const isAgent = participant?.isAgent ?? false
      const speaker = isAgent ? 'QUARTERMASTER' : 'SOLDIER'

      setTranscript((prev) => [
        ...prev,
        { speaker, text, id: Date.now() + Math.random() },
      ])
    }

    room.on(RoomEvent.TranscriptionReceived, onTranscription)
    listenerRef.current = onTranscription
  }, [])

  const detach = useCallback(() => {
    if (!roomRef.current || !listenerRef.current) return
    roomRef.current.off(RoomEvent.TranscriptionReceived, listenerRef.current)
    listenerRef.current = null
    roomRef.current = null
  }, [])

  const clear = useCallback(() => setTranscript([]), [])

  return { transcript, attach, detach, clear }
}
