import { AccessToken } from 'livekit-server-sdk'

export default async function handler(req, res) {
  const roomName = req.query.room_name || 'quartermaster'
  const identity =
    req.query.identity || `soldier-${Math.random().toString(36).slice(2, 8)}`

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { identity }
  )
  at.addGrant({ roomJoin: true, room: roomName })
  const token = await at.toJwt()

  res.json({ token, url: process.env.LIVEKIT_URL, identity, room: roomName })
}
