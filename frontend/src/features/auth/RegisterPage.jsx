import { useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, Circle, XCircle } from 'lucide-react';
import { AuthShell } from '../../components/AuthShell.jsx';
import { Button } from '../../components/Button.jsx';
import { TextField } from '../../components/TextField.jsx';
import { formatMmSs, useCountdown } from '../../hooks/useCountdown.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { GeneralStatus } from './AuthFormStatus.jsx';
import { useAuth } from './authContext.js';
import { mapAuthError } from './authErrors.js';
import { PASSWORD_MAX, PASSWORD_MIN, registerSchema, validateRegisterForm } from './authSchemas.js';

const FIELD_ORDER = ['email', 'password', 'confirmPassword'];
const isDesktop = () => window.matchMedia?.('(min-width: 1024px)').matches ?? false;

/** Các tiêu chí hiển thị trong checklist; `ok` tính trực tiếp từ mật khẩu đang gõ. */
function getRules(password) {
  return [
    {
      id: 'length',
      label: `Từ ${PASSWORD_MIN} đến ${PASSWORD_MAX} ký tự`,
      ok: password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX,
    },
    { id: 'letter', label: 'Có ít nhất 1 chữ cái', ok: /[A-Za-z]/.test(password) },
    { id: 'digit', label: 'Có ít nhất 1 chữ số', ok: /[0-9]/.test(password) },
    {
      id: 'charset',
      label: 'Chỉ dùng chữ không dấu, số và ký hiệu',
      ok: !/[^\x20-\x7E]/.test(password),
      onlyWhenViolated: true,
    },
  ];
}

function PasswordChecklist({ id, password, blurred }) {
  const rules = getRules(password).filter((rule) => !rule.onlyWhenViolated || !rule.ok);
  return (
    <ul id={id} aria-live={blurred ? 'polite' : 'off'} className="mt-2 space-y-1 text-small">
      {rules.map((rule) => {
        const failed = !rule.ok && blurred;
        const Icon = rule.ok ? CheckCircle2 : failed ? XCircle : Circle;
        const color = rule.ok ? 'text-success' : failed ? 'text-danger' : 'text-ink-subtle';
        return (
          <li key={rule.id} className="flex items-center gap-2 text-ink-muted">
            <Icon size={16} aria-hidden="true" className={`shrink-0 transition ${color}`} />
            <span>{rule.label}</span>
            <span className="sr-only">{rule.ok ? 'đã đạt' : 'chưa đạt'}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function RegisterPage() {
  usePageTitle('Đăng ký');
  const { register } = useAuth();
  const [values, setValues] = useState({ email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [emailTaken, setEmailTaken] = useState(false);
  const [passwordBlurred, setPasswordBlurred] = useState(false);
  const [general, setGeneral] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [autoFocusEmail] = useState(isDesktop);
  const countdown = useCountdown();
  const submittingRef = useRef(false);
  const checklistId = useId();
  const fieldRefs = {
    email: useRef(null),
    password: useRef(null),
    confirmPassword: useRef(null),
  };
  const cooling = countdown.state === 'running';

  const setError = (field, message) => setErrors((prev) => ({ ...prev, [field]: message }));

  const onChange = (field) => (event) => {
    const next = { ...values, [field]: event.target.value };
    setValues(next);
    if (field === 'email') setEmailTaken(false);
    // Đổi mật khẩu khi ô nhập lại đã có chữ: kiểm tra lại độ khớp ngay
    if (field === 'password' && next.confirmPassword) {
      setError('confirmPassword', validateRegisterForm(next).confirmPassword);
    }
  };

  const onEmailBlur = () => {
    const next = { ...values, email: values.email.trim() };
    setValues(next);
    setError('email', validateRegisterForm(next).email);
  };

  const onPasswordBlur = () => {
    setPasswordBlurred(true);
    setError('password', validateRegisterForm(values).password);
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
    countdown.reset();
    setPasswordBlurred(true);

    const fieldErrors = validateRegisterForm(values);
    setErrors(fieldErrors);
    if (focusFirstError(fieldErrors)) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const { email, password } = registerSchema.parse(values); // không gửi confirmPassword/role
      await register({ email, password });
      // Thành công: AuthProvider đã điều hướng tới /profile.
    } catch (error) {
      const mapped = mapAuthError(error);
      setErrors(mapped.fieldErrors);
      setEmailTaken(error?.code === 'EMAIL_ALREADY_EXISTS');
      setGeneral(mapped.general);
      if (mapped.cooldownSeconds) countdown.start(mapped.cooldownSeconds);
      if (mapped.clearPasswords) {
        setValues((v) => ({ ...v, password: '', confirmPassword: '' }));
        setPasswordBlurred(false);
      }
      focusFirstError(mapped.fieldErrors);
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const emailError = emailTaken ? (
    <>
      {errors.email}{' '}
      <Link
        to="/login"
        state={{ email: values.email.trim() }}
        className="font-semibold underline hover:text-ink"
      >
        Đăng nhập?
      </Link>
    </>
  ) : (
    errors.email
  );

  return (
    <AuthShell
      title="Tạo tài khoản"
      subtitle="Chỉ cần email và mật khẩu. Bạn sẽ thêm ảnh và số đo ở bước sau."
      slogan="Tạo hồ sơ một lần, thử đồ mọi lúc."
    >
      <GeneralStatus
        general={general}
        countdown={countdown}
        retryNoun="đăng ký"
        onClose={() => setGeneral(null)}
      />
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        <TextField
          ref={fieldRefs.email}
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus={autoFocusEmail}
          value={values.email}
          onChange={onChange('email')}
          onBlur={onEmailBlur}
          readOnly={submitting}
          error={emailError}
        />
        <div>
          <TextField
            ref={fieldRefs.password}
            label="Mật khẩu"
            name="password"
            type="password"
            autoComplete="new-password"
            hint="8–72 ký tự, gồm chữ cái và chữ số, không dấu."
            describedBy={checklistId}
            value={values.password}
            onChange={onChange('password')}
            onBlur={onPasswordBlur}
            readOnly={submitting}
            error={errors.password}
          />
          <PasswordChecklist
            id={checklistId}
            password={values.password}
            blurred={passwordBlurred}
          />
        </div>
        <TextField
          ref={fieldRefs.confirmPassword}
          label="Nhập lại mật khẩu"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={values.confirmPassword}
          onChange={onChange('confirmPassword')}
          onBlur={() => setError('confirmPassword', validateRegisterForm(values).confirmPassword)}
          readOnly={submitting}
          error={errors.confirmPassword}
        />
        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={submitting}
          loadingText="Đang tạo tài khoản…"
          disabled={cooling}
          className="tabular-nums"
        >
          {cooling ? `Thử lại sau ${formatMmSs(countdown.remainingSeconds)}` : 'Đăng ký'}
        </Button>
      </form>
      <p className="mt-6 text-center text-small text-ink-muted">
        Đã có tài khoản?{' '}
        <Link to="/login" className="font-semibold text-accent-strong underline hover:text-ink">
          Đăng nhập
        </Link>
      </p>
    </AuthShell>
  );
}
