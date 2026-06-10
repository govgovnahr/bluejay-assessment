import React from 'react'

const styles = {
  wrapper: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '24px',
  },
  btn: {
    fontFamily: 'var(--font)',
    fontSize: '14px',
    fontWeight: '700',
    letterSpacing: '0.15em',
    padding: '14px 48px',
    border: '2px solid',
    cursor: 'pointer',
    background: 'transparent',
    textTransform: 'uppercase',
  },
  start: {
    color: '#00ff41',
    borderColor: '#00ff41',
  },
  end: {
    color: '#ff3333',
    borderColor: '#ff3333',
  },
  disabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
}

export function CallControls({ connected, connecting, onStart, onEnd }) {
  if (connected) {
    return (
      <div style={styles.wrapper}>
        <button style={{ ...styles.btn, ...styles.end }} onClick={onEnd}>
          ■ TERMINATE
        </button>
      </div>
    )
  }

  return (
    <div style={styles.wrapper}>
      <button
        style={{
          ...styles.btn,
          ...styles.start,
          ...(connecting ? styles.disabled : {}),
        }}
        onClick={onStart}
        disabled={connecting}
      >
        {connecting ? '[ CONNECTING... ]' : '▶ INITIATE CONTACT'}
      </button>
    </div>
  )
}
