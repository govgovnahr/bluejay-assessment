import React, { useCallback, useRef, useState } from 'react'
import { Room, RoomEvent, Track } from 'livekit-client'
import { CallControls } from './components/CallControls'
import { Transcript } from './components/Transcript'
import { Waveform } from './components/Waveform'
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
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  statusLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
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
  const [statusMsg, setStatusMsg] = useState(null)
  const roomRef = useRef(null)
  const connectingRef = useRef(false)

  const { transcript, interim, attach, detach, clear } = useTranscript()

  const handleStart = useCallback(async () => {
    if (connectingRef.current) return
    connectingRef.current = true
    setConnecting(true)
    setError(null)
    setStatusMsg(null)
    clear()

    // Clean up any previous room first
    if (roomRef.current) {
      try { await roomRef.current.disconnect() } catch (_) {}
      roomRef.current = null
    }

    try {
      const res = await fetch(TOKEN_ENDPOINT)
      if (!res.ok) throw new Error(`Token server returned ${res.status}`)
      const { token, url } = await res.json()

      const room = new Room({ adaptiveStream: true, dynacast: true })
      roomRef.current = room

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
      setStatusMsg('// CHANNEL OPEN — STANDING BY //')
    } catch (err) {
      setError(err.message)
    } finally {
      connectingRef.current = false
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
  }, [detach])

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.title}>// QUARTERMASTER FINANCIAL OPS //</div>
        <div style={styles.subtitle}>CFPB FIELD MANUAL · RAG-ENABLED · VOICE SECURE</div>
      </header>

      <div style={styles.statusRow}>
        <div style={styles.statusLeft}>
          <div style={styles.dot(connected)} />
          <span>{connected ? 'CHANNEL OPEN' : 'CHANNEL CLOSED'}</span>
          {error && (
            <span style={{ color: '#ff3333', marginLeft: '16px' }}>ERR: {error}</span>
          )}
        </div>
        <Waveform room={roomRef.current} active={connected} />
      </div>

      <Transcript transcript={transcript} interim={interim} statusMsg={statusMsg} />

      <div style={{ marginTop: '12px', textAlign: 'right' }}>
        <a
          href="/cfpb-guide.pdf"
          download="cfpb-your-money-your-goals.pdf"
          style={{
            fontFamily: 'var(--font)',
            fontSize: '10px',
            letterSpacing: '0.1em',
            color: '#444',
            textDecoration: 'none',
            borderBottom: '1px solid #333',
            paddingBottom: '1px',
          }}
        >
          ↓ DOWNLOAD FIELD MANUAL
        </a>
      </div>

      <div style={{ marginTop: '16px' }}>
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
