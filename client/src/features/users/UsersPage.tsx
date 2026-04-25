import { useState } from 'react';
import { Button } from '../../ui/Button';
import type { AuthTokens } from '../auth/auth.storage';
import { useUsers, type UserDto, type CreateUserPayload, type UpdateUserPayload } from './useUsers';
import { UserModal } from './UserModal';
import './users.css';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Адмін',
  MANAGER: 'Менеджер',
  DISPATCHER: 'Диспетчер',
  ACCOUNTANT: 'Бухгалтер',
  LOGIST: 'Логіст',
  DRIVER: 'Водій',
};

export function UsersPage({ tokens, onUnauthorized }: { tokens: AuthTokens; onUnauthorized: () => void }) {
  const { users, total, loading, error, fetchUsers, createUser, updateUser, toggleStatus } =
    useUsers(tokens, onUnauthorized);

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const openCreate = () => {
    setEditingUser(null);
    setModalOpen(true);
  };

  const openEdit = (user: UserDto) => {
    setEditingUser(user);
    setModalOpen(true);
  };

  const handleSubmit = async (payload: CreateUserPayload | UpdateUserPayload) => {
    if (editingUser) {
      await updateUser(editingUser.id, payload as UpdateUserPayload);
    } else {
      await createUser(payload as CreateUserPayload);
    }
    await fetchUsers(search);
  };

  const handleToggleStatus = async (id: string) => {
    setActionError(null);
    try {
      await toggleStatus(id);
      await fetchUsers(search);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Помилка');
    }
    setConfirmId(null);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers(search);
  };

  const confirmTarget = users.find((u) => u.id === confirmId);

  return (
    <div className="users-page">
      <div className="users-page__header">
        <h1 className="users-page__title">Співробітники</h1>
        <Button variant="primary" onClick={openCreate}>
          + Створити співробітника
        </Button>
      </div>

      <form className="users-page__search" onSubmit={handleSearch}>
        <input
          className="ui-input"
          placeholder="Пошук за ім'ям або email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="secondary" type="submit">
          Пошук
        </Button>
      </form>

      {(error ?? actionError) && (
        <div className="ui-alert ui-alert--error">{error ?? actionError}</div>
      )}

      {loading ? (
        <div className="users-page__loading">Завантаження...</div>
      ) : (
        <div className="ui-card">
          <table className="ui-table">
            <thead>
              <tr>
                <th>Ім'я</th>
                <th>Email</th>
                <th>Ролі</th>
                <th>Водій</th>
                <th>Статус</th>
                <th>Дії</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}
                  >
                    Співробітників не знайдено
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      {u.firstName} {u.lastName}
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {u.roles.map((r) => (
                          <span key={r} className="ui-badge">
                            {ROLE_LABELS[r] ?? r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      {u.driverProfile
                        ? `${u.driverProfile.firstName} ${u.driverProfile.lastName}`
                        : '—'}
                    </td>
                    <td>
                      <span
                        className={
                          u.isActive
                            ? 'users-page__status--active'
                            : 'users-page__status--inactive'
                        }
                      >
                        {u.isActive ? 'Активний' : 'Неактивний'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                          Ред.
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmId(u.id)}
                          title={u.isActive ? 'Деактивувати' : 'Активувати'}
                        >
                          {u.isActive ? 'Деакт.' : 'Акт.'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {total > 0 && <div className="users-page__footer">Всього: {total}</div>}
        </div>
      )}

      {confirmId && confirmTarget && (
        <div className="ui-modal__overlay" onMouseDown={() => setConfirmId(null)}>
          <div
            className="ui-modal ui-card"
            onMouseDown={(e) => e.stopPropagation()}
            style={{ maxWidth: 380 }}
          >
            <div className="ui-modal__head">
              <div className="ui-modal__title">Підтвердження</div>
            </div>
            <div className="ui-modal__body">
              {confirmTarget.isActive
                ? `Деактивувати ${confirmTarget.firstName} ${confirmTarget.lastName}?`
                : `Активувати ${confirmTarget.firstName} ${confirmTarget.lastName}?`}
            </div>
            <div
              className="ui-modal__footer"
              style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}
            >
              <Button variant="secondary" onClick={() => setConfirmId(null)}>
                Скасувати
              </Button>
              <Button variant="primary" onClick={() => handleToggleStatus(confirmId)}>
                Підтвердити
              </Button>
            </div>
          </div>
        </div>
      )}

      <UserModal
        open={modalOpen}
        user={editingUser}
        tokens={tokens}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
