import { FormEvent, useState } from "react"

type LoginFormProps = {
  onSuccess?: () => Promise<void> | void
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [loginOrEmail, setLoginOrEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ loginOrEmail, password }),
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        throw new Error(payload?.message ?? "Login failed")
      }

      await onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Sign in to COLOS</h1>
          <p className="text-sm text-[var(--muted-foreground)]">Введіть логін або email щоб продовжити</p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="loginOrEmail">
              Login або Email
            </label>
            <input
              id="loginOrEmail"
              type="text"
              required
              value={loginOrEmail}
              onChange={(e) => setLoginOrEmail(e.target.value)}
              className="w-full rounded-xl border border-[var(--input)] bg-transparent px-4 py-2.5 text-sm outline-none focus:border-[var(--primary)]"
              placeholder="name@example.com"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="password">
              Пароль
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-[var(--input)] bg-transparent px-4 py-2.5 text-sm outline-none focus:border-[var(--primary)]"
              placeholder="********"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Вхід..." : "Увійти"}
          </button>
        </form>
      </div>
    </div>
  )
}
