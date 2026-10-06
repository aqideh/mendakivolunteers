import type { Metadata } from "next";
import Link from "next/link";

import { AttendanceQrScanner } from "@/components/attendance/attendance-qr-scanner";
import { PortalHeader } from "@/components/portal-header";

export const metadata: Metadata = {
  title: "Scan attendance QR",
};

export default function AttendanceScannerPage() {
  return (
    <div className="site-shell">
      <PortalHeader status="Attendance" lite />
      <main className="attendance-self-page page-frame">
        <section className="attendance-self-card attendance-scanner-card">
          <p className="eyebrow">KELUARGA attendance</p>
          <h1>Scan attendance QR</h1>
          <p>
            Point your camera at the check-in or check-out QR shown by MENDAKI staff.
            The scanner only accepts Keluarga MENDAKI attendance links.
          </p>

          <AttendanceQrScanner />

          <p className="muted attendance-scanner-help">
            You can also use your phone's normal Camera app. If you are asked to sign in,
            Keluarga will return you to the attendance confirmation afterwards.
          </p>

          <Link className="text-link" href="/dashboard">
            Back to My Profile
          </Link>
        </section>
      </main>
    </div>
  );
}
