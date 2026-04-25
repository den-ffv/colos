import { useState, useEffect } from 'react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import type { AuthTokens } from '../auth/auth.storage';
import type { UserDto, UserRole, CreateUserPayload, UpdateUserPayload } from './useUsers';

const ALL_ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'DISPATCHER', 'ACCOUNTANT', 'LOGIST', 'DRIVER'];

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Адмін',
  MANAGER: 'Менеджер',
  DISPATCHER: 'Диспетчер',
  ACCOUNTANT: 'Бухгалтер',
  LOGIST: 'Логіст',
  DRIVER: 'Водій',
};

interface DriverOption {
  id: string;
  firstName: string;
  lastName: string;
  userId: string | null;
}

interface UserModalProps {
  open: boolean;
  user: UserDto | null;
  tokens: AuthTokens;
  onClose: () => void;
  onSubmit: (payload: CreateUserPayload | UpdateUserPayload) => Promise<void>;
}

export function UserModal({ open, user, tokens, onClose, onSubmit }: UserModalProps) {
  const isEdit = user !== null;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [driverId, setDriverId] = useState('');
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (user) {
      setFirstName(user.firstName);
      setLastName(user.lastName);
      setEmail(user.email);
      setPassword('');
      setRoles(user.roles);
      setDriverId(user.driverProfile?.id ?? '');
    } else {
      setFirstName('');
      setLastName('');
      setEmail('');
      setPassword('');
      setRoles([]);
      setDriverId('');
    }
    setError(null);
  }, [open, user]);

  useEffect(() => {
    if (!open || !roles.includes('DRIVER')) {
      setDrivers([]);
      return;
    }
    fetch('/api/drivers?limit=500', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    })
      .then((r) => r.json())
      .then((json) => {
        const all: DriverOption[] = json.data ?? [];
        setDrivers(all.filter((d) => !d.userId || d.id === user?.driverProfile?.id));
      })
      .catch(() => setDrivers([]));
  }, [open, roles, user, tokens.accessToken]);

  const toggleRole = (role: UserRole) => {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
    if (role === 'DRIVER') setDriverId('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (roles.length === 0) {
      setError('Оберіть хоча б одну роль');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit) {
        const payload: UpdateUserPayload = {
          first_name: firstName,
          last_name: lastName,
          email,
          roles,
          driverId: roles.includes('DRIVER') ? (driverId || null) : undefined,
        };
        if (password) payload.password = password;
        await onSubmit(payload);
      } else {
        const payload: CreateUserPayload = {
          first_name: firstName,
          last_name: lastName,
          email,
          password,
          roles,
          ...(roles.includes('DRIVER') && driverId ? { driverId } : {}),
        };
        await onSubmit(payload);
      }
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Помилка збереження');
    } finally {
      setSubmitting(false);
    }
  };

  const showDriverWarning = isEdit && !!user?.driverProfile && !roles.includes('DRIVER');

  return (
    <Modal
      open={open}
      title={isEdit ? 'Редагувати співробітника' : 'Новий співробітник'}
      onClose={onClose}
      size="lg"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && <div className="ui-alert ui-alert--error">{error}</div>}

        {showDriverWarning && (
          <div className="ui-alert ui-alert--warning">
            Роль DRIVER знято, але водій {user!.driverProfile!.firstName}{' '}
            {user!.driverProfile!.lastName} залишається прив&apos;язаним.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="ui-field">
            <span className="ui-label">Ім&apos;я</span>
            <input
              className="ui-input"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </label>
          <label className="ui-field">
            <span className="ui-label">Прізвище</span>
            <input
              className="ui-input"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </label>
        </div>

        <label className="ui-field">
          <span className="ui-label">Email</span>
          <input
            className="ui-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label className="ui-field">
          <span className="ui-label">
            Пароль{isEdit ? ' (залишити порожнім щоб не змінювати)' : ''}
          </span>
          <input
            className="ui-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={!isEdit}
            minLength={6}
          />
        </label>

        <div className="ui-field">
          <span className="ui-label">Ролі</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
            {ALL_ROLES.map((role) => (
              <label
                key={role}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={roles.includes(role)}
                  onChange={() => toggleRole(role)}
                />
                {ROLE_LABELS[role]}
              </label>
            ))}
          </div>
        </div>

        {roles.includes('DRIVER') && (
          <label className="ui-field">
            <span className="ui-label">Прив&apos;язати до водія</span>
            <select
              className="ui-input"
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
            >
              <option value="">— не прив&apos;язувати —</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.firstName} {d.lastName}
                </option>
              ))}
            </select>
          </label>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>
            Скасувати
          </Button>
          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? 'Збереження...' : isEdit ? 'Зберегти' : 'Створити'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
