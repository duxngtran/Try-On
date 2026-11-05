import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, Clock } from 'lucide-react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Select } from '../../components/Select.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { TextField } from '../../components/TextField.jsx';
import { formatMmSs, useCountdown } from '../../hooks/useCountdown.js';
import { loadImage } from '../profile/imageLoader.js';
import { LeaveDialog } from './LeaveDialog.jsx';
import { FlatLayGuide, ProductImageField } from './ProductImageField.jsx';
import { mapProductSaveError } from './productErrors.js';
import {
  PRODUCT_IMAGE_MESSAGES,
  checkProductImageDimensions,
  checkProductImageFile,
} from './productImageRules.js';
import {
  PRODUCT_MESSAGES,
  formatPriceInput,
  parsePriceInput,
  productNameSchema,
  validateProductFields,
} from './productSchemas.js';
import { productsApi } from './productsApi.js';
import { useCategories } from './useCategories.js';
import { useUnsavedGuard } from './useUnsavedGuard.js';

const RATE_FALLBACK_SECONDS = 10; // D-34: thiếu retryAfterSeconds thì mở lại nút sau 10 giây

/** 3725 -> "1 giờ 02 phút"; dưới 1 giờ -> "mm:ss". */
function formatWait(totalSeconds) {
  if (totalSeconds < 3600) return formatMmSs(totalSeconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours} giờ ${String(minutes).padStart(2, '0')} phút`;
}

/**
 * Form Thêm/Sửa sản phẩm dùng chung (screens/product-form.md). Một request multipart ghi nguyên tử (D-50).
 * @param {{
 *   mode: 'create' | 'edit',
 *   product?: object,
 *   backTo: string,
 *   initialCategoryId?: string,
 *   successTo: string,
 * }} props `backTo`: đích của Hủy/"← Sản phẩm"; `successTo`: nơi về sau khi lưu (sửa giữ lọc + trang, thêm về trang 1).
 */
export function ProductForm({ mode, product, backTo, successTo, initialCategoryId = '' }) {
  const editing = mode === 'edit';
  const navigate = useNavigate();
  const categories = useCategories();
  const countdown = useCountdown();

  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(product ? formatPriceInput(product.priceVnd) : '');
  const [categoryId, setCategoryId] = useState(product?.category.id ?? initialCategoryId);
  const [preview, setPreview] = useState(null); // { file, url, width, height }
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState(null); // { variant, message, waitSeconds? }
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  const nameRef = useRef(null);
  const priceRef = useRef(null);
  const categoryRef = useRef(null);
  const imageRef = useRef(null);
  const previewUrlRef = useRef(null);
  const pickSeq = useRef(0);

  // Thu hồi object URL khi rời trang để không rò bộ nhớ.
  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  const categoriesReady = categories.status === 'ready';
  const noCategories = categoriesReady && categories.categories.length === 0;
  // Danh mục đã chọn mà không còn trong danh sách (vừa bị xóa) thì coi như chưa chọn.
  const effectiveCategoryId =
    categoriesReady && !categories.categories.some((c) => c.id === categoryId) ? '' : categoryId;

  const parsedPrice = parsePriceInput(price);
  const nameParsed = productNameSchema.safeParse(name);
  const dirty = editing
    ? !nameParsed.success ||
      nameParsed.data !== product.name ||
      parsedPrice.value !== product.priceVnd ||
      effectiveCategoryId !== product.category.id ||
      preview !== null
    : name.trim() !== '' ||
      price.trim() !== '' ||
      effectiveCategoryId !== initialCategoryId ||
      preview !== null;

  const { blocker, allowNext } = useUnsavedGuard(dirty || saving);
  const waiting = countdown.state === 'running';
  const canSave = categoriesReady && !noCategories && !saving && !waiting && (!editing || dirty);
  const locked = saving;

  const setFieldError = (field, message) =>
    setErrors((prev) => ({ ...prev, [field]: message ?? undefined }));

  const focusFirstError = (found) => {
    const order = [
      ['name', nameRef],
      ['price', priceRef],
      ['categoryId', categoryRef],
      ['image', imageRef],
    ];
    const first = order.find(([field]) => found[field]);
    first?.[1].current?.focus();
  };

  const pickImage = async (file) => {
    if (locked) return;
    const seq = (pickSeq.current += 1);
    const fileError = checkProductImageFile(file);
    if (fileError) {
      setFieldError('image', fileError);
      return;
    }
    try {
      const image = await loadImage(file);
      if (seq !== pickSeq.current) {
        URL.revokeObjectURL(image.url);
        return;
      }
      const dimensionError = checkProductImageDimensions(image);
      if (dimensionError) {
        // Ảnh sai không thay ảnh đang có trong form.
        URL.revokeObjectURL(image.url);
        setFieldError('image', dimensionError);
        return;
      }
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = image.url;
      setPreview({ file, ...image });
      setFieldError('image', null);
    } catch {
      if (seq === pickSeq.current) setFieldError('image', PRODUCT_IMAGE_MESSAGES.unreadable);
    }
  };

  const keepOldImage = () => {
    pickSeq.current += 1;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreview(null);
    setFieldError('image', null);
  };

  const onNameBlur = () => {
    if (name.trim() !== '' && !nameParsed.success) setFieldError('name', PRODUCT_MESSAGES.name);
  };
  const onPriceBlur = () => {
    if (price.trim() === '') return;
    if ('value' in parsedPrice) setPrice(formatPriceInput(parsedPrice.value));
    else setFieldError('price', parsedPrice.error);
  };

  const onProgress = (percent) => setProgress(percent);

  const submit = async (event) => {
    event.preventDefault();
    if (!canSave) return;
    setAlert(null);

    const { errors: fieldErrors, data } = validateProductFields({
      name,
      price,
      categoryId: effectiveCategoryId,
    });
    const found = { ...fieldErrors };
    if (!editing && !preview) found.image = PRODUCT_IMAGE_MESSAGES.required;
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstError(found);
      return;
    }

    // Sửa: chỉ gửi trường đã đổi (US-04 §4.3).
    const fields = editing
      ? Object.fromEntries(
          Object.entries({
            name: data.name !== product.name ? data.name : undefined,
            priceVnd: data.priceVnd !== product.priceVnd ? data.priceVnd : undefined,
            categoryId: data.categoryId !== product.category.id ? data.categoryId : undefined,
          }).filter(([, value]) => value !== undefined),
        )
      : data;
    if (editing && Object.keys(fields).length === 0 && !preview) {
      setAlert({ variant: 'info', message: PRODUCT_MESSAGES.noChange });
      return;
    }

    setSaving(true);
    setProgress(0);
    const file = preview?.file ?? null;
    try {
      if (editing) await productsApi.update({ id: product.id, fields, file, onProgress });
      else await productsApi.create({ fields, file, onProgress });
      allowNext();
      navigate(successTo, {
        state: { notice: { message: editing ? 'Đã cập nhật sản phẩm' : 'Đã thêm sản phẩm' } },
      });
    } catch (error) {
      setSaving(false);
      const mapped = mapProductSaveError(error, { hasImage: file !== null });
      switch (mapped.kind) {
        case 'fields':
          setErrors((prev) => ({ ...prev, ...mapped.fields }));
          focusFirstError(mapped.fields);
          break;
        case 'category':
          setErrors({ categoryId: mapped.message });
          setCategoryId('');
          categories.reload();
          categoryRef.current?.focus();
          break;
        case 'gone':
          allowNext();
          navigate('/admin/products', {
            replace: true,
            state: { notice: { message: mapped.message, variant: 'error' } },
          });
          break;
        case 'nochange':
          setAlert({ variant: 'info', message: mapped.message });
          break;
        case 'rate':
          setAlert({
            variant: 'warning',
            message: mapped.message,
            waitSeconds: mapped.retryAfterSeconds,
          });
          countdown.start(mapped.retryAfterSeconds ?? RATE_FALLBACK_SECONDS);
          break;
        default:
          setAlert({ variant: 'danger', message: mapped.message });
      }
    }
  };

  const processing = saving && progress >= 100;
  const showProgress = saving && Boolean(preview);

  return (
    <section>
      <Link
        to={backTo}
        className="inline-flex h-11 items-center gap-2 text-small font-semibold text-accent-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Sản phẩm
      </Link>
      <h1 className="mt-1 font-display text-title font-semibold md:text-display">
        {editing ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}
      </h1>

      <form
        onSubmit={submit}
        noValidate
        aria-busy={saving || undefined}
        className="mt-6 grid gap-8 rounded-lg border border-line bg-surface p-4 md:p-6 lg:grid-cols-[20rem_1fr]"
      >
        <div className="flex flex-col items-center gap-4 md:flex-row md:items-start lg:flex-col lg:items-stretch">
          <div className="w-full max-w-xs md:w-60 md:shrink-0 lg:w-full">
            <ProductImageField
              preview={preview}
              current={product ? { url: product.image.url, name: product.name } : null}
              error={errors.image}
              disabled={locked}
              saving={saving}
              onPick={pickImage}
              onKeep={keepOldImage}
              buttonRef={imageRef}
            />
          </div>
          <div className="w-full">
            <FlatLayGuide defaultOpen={!editing} />
          </div>
        </div>

        <div className="max-w-md space-y-5">
          <TextField
            label="Tên sản phẩm"
            hint="Bắt buộc. 2 đến 120 ký tự. Được trùng tên sản phẩm khác."
            autoComplete="off"
            ref={nameRef}
            value={name}
            readOnly={locked}
            error={errors.name}
            onChange={(event) => {
              setName(event.target.value);
              if (errors.name) setFieldError('name', null);
            }}
            onBlur={onNameBlur}
          />
          <TextField
            label="Giá"
            hint="Bắt buộc. Từ 1.000 đến 100.000.000 ₫"
            suffix="₫"
            inputMode="numeric"
            autoComplete="off"
            ref={priceRef}
            value={price}
            readOnly={locked}
            error={errors.price}
            onChange={(event) => {
              setPrice(event.target.value);
              if (errors.price) setFieldError('price', null);
            }}
            onBlur={onPriceBlur}
          />

          {noCategories ? (
            <Alert variant="warning" role="alert">
              Cần tạo danh mục trước.{' '}
              <Link to="/admin/categories" className="font-semibold underline">
                Tạo danh mục
              </Link>
            </Alert>
          ) : (
            <div>
              <Select
                label="Danh mục"
                ref={categoryRef}
                value={effectiveCategoryId}
                disabled={!categoriesReady || locked}
                error={errors.categoryId}
                onChange={(event) => {
                  setCategoryId(event.target.value);
                  if (errors.categoryId) setFieldError('categoryId', null);
                }}
              >
                <option value="" disabled>
                  Chọn danh mục
                </option>
                {categories.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                {!categoriesReady && product && (
                  <option value={product.category.id}>{product.category.name}</option>
                )}
              </Select>
              {categories.status === 'loading' && (
                <p className="mt-1.5 flex items-center gap-2 text-small text-ink-muted">
                  <Spinner label="Đang tải danh mục" /> Đang tải danh mục…
                </p>
              )}
              {categories.status === 'error' && (
                <p className="mt-1.5 text-small text-danger" role="alert">
                  Không tải được danh mục.{' '}
                  <button
                    type="button"
                    onClick={() => categories.reload({ silent: false })}
                    className="font-semibold underline"
                  >
                    Thử lại
                  </button>
                </p>
              )}
            </div>
          )}

          <div className="space-y-3 pt-2">
            {alert &&
              (alert.variant === 'warning' ? (
                countdown.state === 'finished' ? (
                  <Alert variant="info" role="status">
                    Bạn có thể lưu lại.
                  </Alert>
                ) : (
                  <Alert variant="warning" role="alert">
                    <p>{alert.message}</p>
                    {alert.waitSeconds && waiting && (
                      <p className="mt-1 flex items-center gap-1.5">
                        <Clock size={14} aria-hidden="true" />
                        <span aria-hidden="true">
                          Thử lại sau {formatWait(countdown.remainingSeconds)}
                        </span>
                      </p>
                    )}
                  </Alert>
                )
              ) : (
                <Alert
                  variant={alert.variant}
                  role={alert.variant === 'danger' ? 'alert' : 'status'}
                >
                  {alert.message}
                </Alert>
              ))}

            {showProgress && (
              <div>
                {processing ? (
                  <p role="status" className="text-small text-ink-muted">
                    Đang xử lý ảnh…
                  </p>
                ) : (
                  <p className="text-small text-ink-muted">Đang tải lên… {progress}%</p>
                )}
                <div
                  role={processing ? undefined : 'progressbar'}
                  aria-label="Tiến trình tải ảnh"
                  aria-valuemin={processing ? undefined : 0}
                  aria-valuemax={processing ? undefined : 100}
                  aria-valuenow={processing ? undefined : progress}
                  className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted"
                >
                  <div
                    className={`h-full origin-left bg-ink motion-reduce:transition-none ${
                      processing ? 'w-full animate-pulse' : 'transition-transform'
                    }`}
                    style={
                      processing
                        ? undefined
                        : { transform: `scaleX(${progress / 100})`, width: '100%' }
                    }
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                disabled={saving}
                onClick={() => navigate(backTo)}
                size="lg"
                className="sm:w-auto"
                fullWidth
              >
                Hủy
              </Button>
              <Button
                type="submit"
                size="lg"
                loading={saving}
                loadingText="Đang lưu…"
                disabled={!canSave && !saving}
                fullWidth
                className="sm:w-auto"
              >
                Lưu
              </Button>
            </div>
          </div>
        </div>
      </form>

      <LeaveDialog blocker={blocker} saving={saving} />
    </section>
  );
}
