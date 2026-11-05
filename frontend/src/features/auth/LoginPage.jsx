import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { AuthShell } from '../../components/AuthShell.jsx';
import { Button } from '../../components/Button.jsx';
import { TextField } from '../../components/TextField.jsx';
import { formatMmSs, useCountdown } from '../../hooks/useCountdown.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { ContextNotice, GeneralStatus } from './AuthFormStatus.jsx';
import { useAuth } from './authContext.js';
import { mapAuthError } from './authErrors.js';
import { loginSchema, validateLoginForm } from './authSchemas.js';

const FIELD_ORDER = ['email', 'password'];

const isDesktop = () => window.matchMedia?.('(min-width: 1024px)').matches ?? false;

export function LoginPage() {
  usePageTitle('Đăng nhập');
  const { login } = useAuth();
  const { state: locationState } = useLocation();
  const [values, setValues] = useState({ email: locationState?.email ?? '', password: '' });
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState(null);
  const [notice, setNotice] = useState(locationState?.notice ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [autoFocusEmail] = useState(isDesktop);
  const countdown = useCountdown();
  const submittingRef = useRef(false);
  const fieldRefs = { email: useRef(null), password: useRef(null) };

  const from = locationState?.from;
  const cooling = countdown.state === 'running';

  const setValue = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));

  const validateField = (field, nextValues = values) => {
    const message = validateLoginForm(nextValues)[field];
    setErrors((prev) => ({ ...prev, [field]: message }));
  };

  const onEmailBlur = () => {
    const trimmed = values.email.trim();
    const next = { ...values, email: trimmed };
    setValues(next);
    validateField('email', next);
  };

  const focusFirstError = (fieldErrors) => {
    const first = FIELD_ORDER.find((field) => fieldErrors[field]);
    if (first) fieldRefs[first].current?.focus();
    return Boolean(first);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (submittingRef.current || cooling) return;
    setGeneral(null);
    setNotice(null);
    countdown.reset();

    const fieldErrors = validateLoginForm(values);
    setErrors(fieldErrors);
    if (focusFirstError(fieldErrors)) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await login(loginSchema.parse(values), { from });
      // Thành công: AuthProvider đã điều hướng, trang này sắp bị gỡ nên không cập nhật state nữa.
    } catch (error) {
      const mapped = mapAuthError(error);
      setErrors(mapped.fieldErrors);
      setGeneral(mapped.general);
      if (mapped.cooldownSeconds) countdown.start(mapped.cooldownSeconds);
      if (mapped.clearPasswords) setValues((v) => ({ ...v, password: '' }));
      if (!focusFirstError(mapped.fieldErrors) && mapped.clearPasswords) {
        fieldRefs.password.current?.focus();
      }
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Chào mừng trở lại"
      subtitle="Đăng nhập để vào phòng thử đồ của bạn."
      slogan="Thử đồ trên chính bạn."
    >
      <ContextNotice notice={notice} />
      <GeneralStatus general={general} countdown={countdown} onClose={() => setGeneral(null)} />
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        <TextField
          ref={fieldRefs.email}
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus={autoFocusEmail}
          value={values.email}
          onChange={setValue('email')}
          onBlur={onEmailBlur}
          readOnly={submitting}
          error={errors.email}
        />
        <TextField
          ref={fieldRefs.password}
          label="Mật khẩu"
          name="password"
          type="password"
          autoComplete="current-password"
          value={values.password}
          onChange={setValue('password')}
          onBlur={() => validateField('password')}
          readOnly={submitting}
          error={errors.password}
        />
        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={submitting}
          loadingText="Đang đăng nhập…"
          disabled={cooling}
          className="tabular-nums"
        >
          {cooling ? `Thử lại sau ${formatMmSs(countdown.remainingSeconds)}` : 'Đăng nhập'}
        </Button>
      </form>
      <p className="mt-6 text-center text-small text-ink-muted">
        Chưa có tài khoản?{' '}
        <Link
          to="/register"
          state={from ? { from } : undefined}
          className="font-semibold text-accent-strong underline hover:text-ink"
        >
          Đăng ký
        </Link>
      </p>
    </AuthShell>
  );
}
