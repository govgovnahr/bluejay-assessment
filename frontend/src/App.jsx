import React, { useCallback, useRef, useState } from 'react'
import { Room, RoomEvent, Track } from 'livekit-client'
import { CallControls } from './components/CallControls'
import { Transcript } from './components/Transcript'
import { useTranscript } from './useTranscript'

const TOKEN_ENDPOINT = import.meta.env.VITE_TOKEN_ENDPOINT || '/api/token'

const styles = {
  app: {
    width: '720px',
    maxWidth: '96vw',
    padding: '32px 24px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  title: {
    color: '#ffb000',
    fontSize: '18px',
    fontFamily: 'var(--font)',
    letterSpacing: '0.2em',
    fontWeight: '700',
    marginBottom: '6px',
  },
  subtitle: {
    color: '#444',
    fontSize: '11px',
    fontFamily: 'var(--font)',
    letterSpacing: '0.1em',
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
    fontSize: '11px',
    fontFamily: 'var(--font)',
    color: '#555',
    letterSpacing: '0.05em',
  },
  dot: (connected) => ({
    width: '8px',
    height: '8px',
    background: connected ? '#00ff41' : '#333',
    borderRadius: '50%',
    flexShrink: 0,
  }),
}

export default function App() {
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)
  const roomRef = useRef(null)

  const { transcript, attach, detach, clear } = useTranscript()

  const handleStart = useCallback(async () => {
    setConnecting(true)
    setError(null)

    try {
      const res = await fetch(TOKEN_ENDPOINT)
      if (!res.ok) throw new Error(`Token server returned ${res.status}`)
      const { token, url } = await res.json()

      const room = new Room({ adaptiveStream: true, dynacast: true })
      roomRef.current = room

      // Play remote audio tracks as they arrive
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach()
          el.autoplay = true
          document.body.appendChild(el)
          room.once(RoomEvent.Disconnected, () => {
            track.detach(el)
            el.remove()
          })
        }
      })

      room.on(RoomEvent.Disconnected, () => {
        setConnected(false)
        detach()
      })

      await room.connect(url, token)
      await room.localParticipant.setMicrophoneEnabled(true)

      attach(room)
      setConnected(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setConnecting(false)
    }
  }, [attach, detach])

  const handleEnd = useCallback(async () => {
    if (roomRef.current) {
      detach()
      await roomRef.current.disconnect()
      roomRef.current = null
    }
    setConnected(false)
    clear()
  }, [detach, clear])

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.title}>// QUARTERMASTER FINANCIAL OPS //</div>
        <div style={styles.subtitle}>CFPB FIELD MANUAL · RAG-ENABLED · VOICE SECURE</div>
      </header>

      <div style={styles.statusBar}>
        <div style={styles.dot(connected)} />
        <span>{connected ? 'CHANNEL OPEN' : 'CHANNEL CLOSED'}</span>
        {error && (
          <span style={{ color: '#ff3333', marginLeft: '16px' }}>ERR: {error}</span>
        )}
      </div>

      <Transcript transcript={transcript} />

      <div style={{ marginTop: '20px' }}>
        <CallControls
          connected={connected}
          connecting={connecting}
          onStart={handleStart}
          onEnd={handleEnd}
        />
      </div>
    </div>
  )
}
