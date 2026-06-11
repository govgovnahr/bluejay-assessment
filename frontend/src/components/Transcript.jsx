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
    textAlign: 'center',
    marginTop: '160px',
  },
  line: {
    marginBottom: '8px',
    wordBreak: 'break-word',
  },
  interimLine: {
    marginBottom: '8px',
    wordBreak: 'break-word',
    opacity: 0.5,
  },
}

function speakerColor(speaker) {
  return speaker === 'QUARTERMASTER' ? '#ffb000' : '#00ff41'
}

function textColor(speaker) {
  return speaker === 'QUARTERMASTER' ? '#e0a000' : '#b0ffb0'
}

export function Transcript({ transcript, interim, statusMsg }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript, interim])

  return (
    <div style={styles.container}>
      {transcript.length === 0 && !interim ? (
        <div style={styles.empty}>{statusMsg ?? '// AWAITING TRANSMISSION //'}</div>
      ) : (
        <>
          {transcript.map((entry) => (
            <div key={entry.id} style={styles.line}>
              <span style={{ color: speakerColor(entry.speaker), fontWeight: '700' }}>
                [{entry.speaker}]
              </span>{' '}
              <span style={{ color: textColor(entry.speaker) }}>{entry.text}</span>
            </div>
          ))}
          {interim && (
            <div style={styles.interimLine}>
              <span style={{ color: speakerColor(interim.speaker), fontWeight: '700' }}>
                [{interim.speaker}]
              </span>{' '}
              <span style={{ color: textColor(interim.speaker) }}>
                {interim.text}
                <span style={{ animation: 'blink 1s step-end infinite' }}>▌</span>
              </span>
            </div>
          )}
        </>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
