/** Phân vị gần nhất (nearest-rank) của mảng đã sắp tăng dần; mảng rỗng thì null. */
export function percentile(sortedAscending, p) {
  if (sortedAscending.length === 0) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * sortedAscending.length));
  return sortedAscending[rank - 1];
}
