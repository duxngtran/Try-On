import { useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { TextField } from '../../components/TextField.jsx';
import {
  formatHeight,
  formatWeight,
  parseHeight,
  parseWeight,
  validateMeasurements,
  HEIGHT_MESSAGE,
  WEIGHT_MESSAGE,
} from './measurements.js';
import { mapActionError } from './profileErrors.js';
import { profileApi } from './profileApi.js';

const timeFormat = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' });

/**
 * Card ② Số đo (profile-measurements.md). Lưu độc lập với ảnh; gửi cả hai giá trị dạng số.
 * Giữ nguyên chuỗi người dùng gõ (`,` hoặc `.`), chỉ đổi sang số khi gửi.
 */
export function MeasurementsCard({ profile, applyProfile, onSaved, heightRef }) {
  const weightRef = useRef(null);
  const serverKey = `${profile.heightCm}|${profile.weightKg}`;
  const [syncedKey, setSyncedKey] = useState(serverKey);
  const [height, setHeight] = useState(formatHeight(profile.heightCm));
  const [weight, setWeight] = useState(formatWeight(profile.weightKg));
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  // Số đo trên server đổi (sau khi lưu, hoặc làm mới nền thấy giá trị khác) thì nạp lại vào ô.
  if (syncedKey !== serverKey) {
    setSyncedKey(serverKey);
    setHeight(formatHeight(profile.heightCm));
    setWeight(formatWeight(profile.weightKg));
    setErrors({});
  }

  const heightValue = parseHeight(height);
  const weightValue = parseWeight(weight);
  // Ô có chữ nhưng không hợp lệ cũng tính là đã sửa để user còn bấm Lưu và thấy thông báo lỗi.
  const dirty =
    heightValue !== profile.heightCm ||
    weightValue !== profile.weightKg ||
    (height.trim() !== '' && heightValue === null) ||
    (weight.trim() !== '' && weightValue === null);

  const edit = (setter, field) => (event) => {
    setter(event.target.value);
    setSavedAt(null);
    setGeneral(null);
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const checkOnBlur = (field, value, parse, message) => () => {
    if (value.trim() === '' && profile[field] == null) return; // chưa nhập gì thì chưa báo lỗi
    if (parse(value) === null) setErrors((prev) => ({ ...prev, [field]: message }));
  };

  const focusFirstError = (fieldErrors) => {
    (fieldErrors.heightCm ? heightRef : weightRef).current?.focus();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!dirty || saving) return;
    const { values, errors: fieldErrors } = validateMeasurements({ height, weight });
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      focusFirstError(fieldErrors);
      return;
    }
    setSaving(true);
    setGeneral(null);
    try {
      const next = await profileApi.saveMeasurements(values);
      applyProfile(next);
      setErrors({});
      setSavedAt(new Date());
      onSaved();
    } catch (error) {
      if (error.code === 'CANCELED') return;
      const mapped = mapActionError(error);
      setErrors(mapped.fieldErrors);
      setGeneral(mapped.general);
      if (Object.keys(mapped.fieldErrors).length > 0) focusFirstError(mapped.fieldErrors);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      id="measurements"
      aria-labelledby="measurements-title"
      className="rounded-xl border border-line bg-surface p-5 shadow-card"
    >
      <p className="text-caption font-semibold tracking-wide text-ink-subtle">BƯỚC 2</p>
      <h2 id="measurements-title" className="font-display text-heading font-semibold">
        Số đo
      </h2>
      <form onSubmit={submit} noValidate className="mt-4 space-y-4">
        {general && (
          <Alert variant="danger" role="alert" onClose={() => setGeneral(null)}>
            {general}
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            ref={heightRef}
            label="Chiều cao"
            suffix="cm"
            inputMode="numeric"
            autoComplete="off"
            placeholder="165"
            hint="Từ 100 đến 250 cm."
            value={height}
            error={errors.heightCm}
            onChange={edit(setHeight, 'heightCm')}
            onBlur={checkOnBlur('heightCm', height, parseHeight, HEIGHT_MESSAGE)}
          />
          <TextField
            ref={weightRef}
            label="Cân nặng"
            suffix="kg"
            inputMode="decimal"
            autoComplete="off"
            placeholder="52,5"
            hint="Từ 30 đến 250 kg, tối đa 1 chữ số thập phân."
            value={weight}
            error={errors.weightKg}
            onChange={edit(setWeight, 'weightKg')}
            onBlur={checkOnBlur('weightKg', weight, parseWeight, WEIGHT_MESSAGE)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            loading={saving}
            loadingText="Đang lưu…"
            softDisabled={!dirty}
            className="w-full sm:w-auto"
          >
            Lưu thông tin
          </Button>
          {savedAt && !dirty && (
            <p role="status" className="text-small text-ink-muted">
              Đã lưu lúc {timeFormat.format(savedAt)}
            </p>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-small text-ink-muted">
          <Lock size={14} aria-hidden="true" className="shrink-0" />
          Số đo chỉ dùng để tạo ảnh thử đồ và không hiển thị cho người khác.
        </p>
      </form>
    </section>
  );
}
