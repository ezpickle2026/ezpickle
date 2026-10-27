"use client";
import { useEffect, useRef } from "react";

/**
 * Subscribes to the SSE stream. Reconnects with backoff, and pauses while the
 * tab is hidden so a backgrounded phone is not holding a connection open.
 */
export function useRealtime(channel: string, onEvent: (data: unknown) => void) {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    let source: EventSource | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout>;
    let closed = false;

    const connect = () => {
      if (closed || document.visibilityState === "hidden") return;

      source = new EventSource("/api/events");
      source.addEventListener(channel, (event) => {
        try {
          handler.current(JSON.parse((event as MessageEvent).data));
        } catch {
          /* ignore malformed frame */
        }
      });
      source.addEventListener("open", () => {
        retry = 0;
      });
      source.addEventListener("error", () => {
        source?.close();
        source = null;
        retry = Math.min(retry + 1, 6);
        timer = setTimeout(connect, 1000 * 2 ** retry);
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !source) connect();
    };

    connect();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      closed = true;
      clearTimeout(timer);
      source?.close();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [channel]);
}
