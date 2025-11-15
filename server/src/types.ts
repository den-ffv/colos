export type SessionData = {
  cookie: {
    originalMaxAge?: number
    expires: string
    secure: boolean
    httpOnly: boolean
    path: string
    sameSite: 'lax' | 'none' | 'strict'
  }
  type: 'user' | 'customer'
  userId: string
  language: 'ENG' | 'UA'
  roles?: string[]
}
