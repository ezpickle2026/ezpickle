import "server-only";

/**
 * Lightweight realtime fan-out over Server-Sent Events.
 *
 * Chosen over a websocket server because Next.js route handlers stream SSE
 * natively, it survives proxies, and the payloads here are one-directional
 * server -> browser notifications. For multi-instance deployments, back this
 * with Postgres LISTEN/NOTIFY or Redis pub/sub by replacing `publish` and
 * `subscribe` only — no call sites change. See docs/REALTIME.md.
 */
type Listener = (event: { channel: string; data: unknown }) => void;

const globalForBus = globalThis as unknown as { ezpBus?: Set<Listener> };
const listeners: Set<Listener> = (globalForBus.ezpBus ??= new Set());

export async function publish(channel: string, data: unknown) {
  for (const listener of listeners) {
    try {
      listener({ channel, data });
    } catch (error) {
      console.error("[realtime] listener failed", error);
    }
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
