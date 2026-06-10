import React, { useEffect, useRef } from 'react'

const styles = {
  container: {
    border: '1px solid var(--border)',
    background: '#050505',
    height: '380px',
    overflowY: 'auto',
    padding: '16px',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    lineHeight: '1.7',
  },
  empty: {
    color: '#333',
    fontStyle: 'normal',
    textAlign: 'center',
    marginTop: '160px',
  },
  line: {
    marginBottom: '8px',
    wordBreak: 'break-word',
  },
}

export function Transcript({ transcript }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  return (
    <div style={styles.container}>
      {transcript.length === 0 ? (
        <div style={styles.empty}>// AWAITING TRANSMISSION //</div>
      ) : (
        transcript.map((entry) => (
          <div key={entry.id} style={styles.line}>
            <span
              style={{
                color: entry.speaker === 'QUARTERMASTER' ? '#ffb000' : '#00ff41',
                fontWeight: '700',
              }}
            >
              [{entry.speaker}]
            </span>{' '}
            <span style={{ color: entry.speaker === 'QUARTERMASTER' ? '#e0a000' : '#b0ffb0' }}>
              {entry.text}
            </span>
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  )
}
