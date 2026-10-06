"use client";

import { useRouter } from "next/navigation";
import type QrScanner from "qr-scanner";
import { useEffect, useRef, useState } from "react";

const CANONICAL_ORIGIN = "https://keluarga.mendaki.org.sg";

function attendancePath(rawValue: string): string | null {
  try {
    const url = new URL(rawValue);
    const allowedOrigins = new Set([window.location.origin, CANONICAL_ORIGIN]);
    if (!allowedOrigins.has(url.origin)) return null;
    if (url.pathname !== "/attendance/scan") return null;

    const token = url.searchParams.get("t");
    if (!token || token.length < 20 || token.length > 200) return null;

    return `${url.pathname}?t=${encodeURIComponent(token)}`;
  } catch {
    return null;
  }
}

export function AttendanceQrScanner() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const activeRef = useRef(false);
  const handlingRef = useRef(false);
  const [state, setState] = useState<"idle" | "starting" | "scanning" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function stopScanner() {
    activeRef.current = false;
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    scanner.stop();
    scanner.destroy();
  }

  async function startScanner() {
    if (state === "starting" || state === "scanning" || !videoRef.current) return;

    setState("starting");
    setMessage(null);
    handlingRef.current = false;

    try {
      const { default: Scanner } = await import("qr-scanner");
      if (!videoRef.current) return;

      const scanner = new Scanner(
        videoRef.current,
        async (result) => {
          if (handlingRef.current) return;
          const rawValue = typeof result === "string" ? result : result.data;
          const path = attendancePath(rawValue);

          if (!path) {
            setMessage("This is not a Keluarga MENDAKI attendance QR code.");
            return;
          }

          handlingRef.current = true;
          setMessage("QR recognised. Opening attendance…");
          await stopScanner();
          router.push(path);
        },
        {
          preferredCamera: "environment",
          highlightScanRegion: true,
          highlightCodeOutline: true,
          returnDetailedScanResult: true,
          onDecodeError: () => undefined,
        },
      );

      scannerRef.current = scanner;
      await scanner.start();
      activeRef.current = true;
      setState("scanning");
    } catch (error) {
      await stopScanner();
      setState("error");
      setMessage(
        error instanceof Error && /permission|denied/i.test(error.message)
          ? "Camera access was not granted. You can still scan the attendance QR using your phone's Camera app."
          : "The camera could not be started. You can still use your phone's Camera app to scan the attendance QR.",
      );
    }
  }

  useEffect(() => {
    async function handleVisibilityChange() {
      const scanner = scannerRef.current;
      if (!scanner || handlingRef.current) return;

      if (document.hidden) {
        activeRef.current = false;
        scanner.stop();
        return;
      }

      if (state === "scanning" && !activeRef.current) {
        try {
          await scanner.start();
          activeRef.current = true;
        } catch {
          setState("error");
          setMessage("The camera could not be resumed. Tap Start camera to try again.");
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      const scanner = scannerRef.current;
      scannerRef.current = null;
      activeRef.current = false;
      if (scanner) {
        scanner.stop();
        scanner.destroy();
      }
    };
  }, [state]);

  return (
    <div className="attendance-scanner">
      <div className="attendance-scanner-video-wrap" data-active={state === "scanning" ? "true" : "false"}>
        <video ref={videoRef} className="attendance-scanner-video" playsInline muted />
        {state !== "scanning" ? (
          <div className="attendance-scanner-placeholder">
            <span aria-hidden="true">⌗</span>
            <p>Camera starts only when you tap the button below.</p>
          </div>
        ) : null}
      </div>

      {message ? (
        <div className={state === "error" ? "notice notice-error" : "notice"} role={state === "error" ? "alert" : "status"}>
          {message}
        </div>
      ) : null}

      <div className="actions attendance-scanner-actions">
        <button
          className="button button-primary"
          disabled={state === "starting" || state === "scanning"}
          onClick={() => void startScanner()}
          type="button"
        >
          {state === "starting" ? "Starting camera…" : state === "scanning" ? "Camera active" : "Start camera"}
        </button>
        {state === "scanning" ? (
          <button
            className="button button-secondary"
            onClick={() => {
              void stopScanner().then(() => {
                setState("idle");
                setMessage(null);
              });
            }}
            type="button"
          >
            Stop camera
          </button>
        ) : null}
      </div>
    </div>
  );
}
