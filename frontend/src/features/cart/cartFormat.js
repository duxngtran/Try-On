import { formatPriceVnd } from '../tryon/tryonFormat.js';

const numberFormat = new Intl.NumberFormat('vi-VN');

export { formatPriceVnd };
/** 199000 -> "199.000 đồng", cho trình đọc màn hình (design: tiền đọc "199.000 đồng"). */
export const spokenVnd = (value) => `${numberFormat.format(value)} đồng`;
