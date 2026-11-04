export const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const fail = (res, status, code, message, details) =>
  res.status(status).json({
    success: false,
    error: { code, message, ...(details === undefined ? {} : { details }) },
  });
