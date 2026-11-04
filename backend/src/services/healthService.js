export function getHealth() {
  return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
}
