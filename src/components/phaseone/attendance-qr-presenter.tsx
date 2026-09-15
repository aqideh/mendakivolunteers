"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";

import {
  generateAttendanceQr,
  type AttendanceQrResult,
} from "@/app/admin/events/[id]/attendance/qr/actions";

const QR_REFRESH_INTERVAL_MS = (5 * 60 * 1000) - 15_000;

type Props = Readonly<{
  eventId: string;
  timeslotId: string;
  action: "check_in" | "check_out";
}>;

export function AttendanceQrPresenter({ eventId, timeslotId, action }: Props) {
  const [result, setResult] = useState<AttendanceQrResult | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const next = await generateAttendanceQr({ eventId, timeslotId, action });
    setResult(next);
    if (next.ok) {
      setImage(await QRCode.toDataURL(next.url, { width: 720, margin: 2, errorCorrectionLevel: "M" }));
    } else {
      setImage(null);
    }
    setRefreshing(false);
  }, [action, eventId, timeslotId]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), QR_REFRESH_INTERVAL_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  return (
    <div className="attendance-qr-presenter">
      {image && result?.ok ? (
        <>
          {/* qrcode produces a local data URL rather than a remote image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="attendance-qr-image" src={image} alt={`${action === "check_in" ? "Check-in" : "Check-out"} QR code`} />
          <p className="attendance-qr-expiry">Refreshes automatically · valid until {new Date(result.expiresAt).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}</p>
        </>
      ) : (
        <div className="attendance-qr-loading" role="status">{refreshing ? "Generating secure QR…" : result && !result.ok ? result.error : "Preparing QR…"}</div>
      )}
      <button className="button button-secondary" disabled={refreshing} onClick={() => void refresh()} type="button">
        {refreshing ? "Refreshing…" : "Refresh QR now"}
      </button>
    </div>
  );
}
