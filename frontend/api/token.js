import { AccessToken } from 'livekit-server-sdk'
import { randomBytes } from 'crypto'

export default async function handler(req, res) {
  const roomName =
    req.query.room_name ||
    `quartermaster-${randomBytes(4).toString('hex')}`
  const identity =
    req.query.identity || `soldier-${randomBytes(3).toString('hex')}`

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { identity }
  )
  at.addGrant({ roomJoin: true, room: roomName })
  const token = await at.toJwt()

  res.json({ token, url: process.env.LIVEKIT_URL, identity, room: roomName })
}
