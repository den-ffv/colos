import { type FormEvent, useMemo, useState } from 'react';
import { apiPostJson, type ApiError } from '../../lib/api';
import { getApiBaseUrl } from '../../lib/env';
import { clearAuthTokens, getAuthTokens, setAuthTokens, type AuthTokens } from './auth.storage';
import { Button } from '../../ui/Button';

type SignInResponse = {
  accessToken?: string;
  refreshToken?: string;
  token?: string;
  user?: unknown;
};

type ApiResponse<T> = { success: true; data: T } | { success: false; message: string; details?: unknown };

type Mode = 'signin' | 'signup';

export function AuthForm({ onSignedIn, onSignedOut }: { onSignedIn?: (tokens: AuthTokens) => void; onSignedOut?: () => void }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [tokens, setTokens] = useState<AuthTokens | null>(() => getAuthTokens());

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);

  function finalizeAuth(res: ApiResponse<SignInResponse> | SignInResponse) {
    const payload =
      typeof res === 'object' && res && 'success' in res && (res as { success: unknown }).success === true
        ? (res as ApiResponse<SignInResponse>).data
        : (res as SignInResponse);
    const accessToken = payload.accessToken ?? payload.token;
    if (!accessToken) return false;
    const next = { accessToken, refreshToken: payload.refreshToken };
    setAuthTokens(next);
    setTokens(next);
    onSignedIn?.(next);
    setSuccess('Вхід успішний. Токен збережено локально.');
    window.location.hash = '#/crm';
    return true;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      if (mode === 'signin') {
        const res = await apiPostJson<ApiResponse<SignInResponse>>(
          '/api/auth/signin',
          { email, password },
          { credentials: 'include' },
        );
        if (!finalizeAuth(res)) {
          setSuccess('Запит виконано, але сервер не повернув токен (endpoint ще заглушка?).');
        }
      } else {
        const res = await apiPostJson<ApiResponse<SignInResponse>>(
          '/api/auth/signup',
          { email, password, first_name: firstName, last_name: lastName, company_name: companyName },
          { credentials: 'include' },
        );
        if (!finalizeAuth(res)) {
          setSuccess('Реєстрація успішна. Тепер можна увійти.');
          setMode('signin');
        }
      }
    } catch (err) {
      const apiErr = err as Partial<ApiError>;
      setError(apiErr.message ?? 'Сталася помилка. Перевір API та спробуй ще раз.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function onLogout() {
    clearAuthTokens();
    setTokens(null);
    onSignedOut?.();
    setSuccess('Локальний токен видалено.');
  }

  return (
    <div className="auth">
      <header className="auth__header">
        <h1 className="auth__title">Colos CRM</h1>
        <p className="auth__subtitle">Авторизація</p>
      </header>

      <section className="ui-card auth__card">
        <div className="auth__tabs" role="tablist" aria-label="Auth mode">
          <button
            type="button"
            className={mode === 'signin' ? 'auth__tab auth__tab--active' : 'auth__tab'}
            onClick={() => setMode('signin')}
          >
            Вхід
          </button>
          <button
            type="button"
            className={mode === 'signup' ? 'auth__tab auth__tab--active' : 'auth__tab'}
            onClick={() => setMode('signup')}
          >
            Реєстрація
          </button>
        </div>

        <form className="auth__form" onSubmit={onSubmit}>
          {mode === 'signup' ? (
            <div className="auth__row">
              <label className="auth__field">
                <span className="auth__label">Імʼя</span>
                <input
                  className="ui-input auth__input"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  required
                />
              </label>
              <label className="auth__field">
                <span className="auth__label">Прізвище</span>
                <input
                  className="ui-input auth__input"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  required
                />
              </label>
            </div>
          ) : null}
          {mode === 'signup' ? (
            <label className="auth__field">
              <span className="auth__label">Компанія</span>
              <input
                className="ui-input auth__input"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                autoComplete="organization"
                required
              />
            </label>
          ) : null}

          <label className="auth__field">
            <span className="auth__label">Email</span>
            <input
              className="ui-input auth__input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="name@company.com"
              required
            />
          </label>

          <label className="auth__field">
            <span className="auth__label">Пароль</span>
            <input
              className="ui-input auth__input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={6}
            />
          </label>

          {error ? <div className="auth__alert auth__alert--error">{error}</div> : null}
          {success ? <div className="auth__alert auth__alert--success">{success}</div> : null}

          <Button className="auth__submit" variant="primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Зачекай…' : mode === 'signin' ? 'Увійти' : 'Створити акаунт'}
          </Button>

          <div className="auth__meta">
            <div className="auth__metaRow">
              <span className="auth__metaLabel">API:</span>
              <code className="auth__metaValue">{apiBaseUrl}</code>
            </div>
            <div className="auth__metaRow">
              <span className="auth__metaLabel">Токени:</span>
              <code className="auth__metaValue">{tokens ? 'є (localStorage)' : 'нема'}</code>
              {tokens ? (
                <Button type="button" variant="ghost" size="sm" className="auth__link" onClick={onLogout}>
                  Вийти
                </Button>
              ) : null}
            </div>
          </div>
        </form>
      </section>

      <footer className="auth__footer">
        <span className="auth__hint">Поки що бекенд auth-ендпоїнти можуть бути заглушками.</span>
      </footer>
    </div>
  );
}
