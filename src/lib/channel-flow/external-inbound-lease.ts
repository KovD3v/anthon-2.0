export const EXTERNAL_INBOUND_LEASE_MS = 5 * 60 * 1000;
export const EXTERNAL_INBOUND_HEARTBEAT_MS = 30 * 1000;

export function getExternalInboundLeaseExpiry(now = new Date()) {
  return new Date(now.getTime() + EXTERNAL_INBOUND_LEASE_MS);
}
