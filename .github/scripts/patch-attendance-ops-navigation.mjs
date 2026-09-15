import { readFileSync, writeFileSync } from "node:fs";

function replace(path, before, after) {
  const source = readFileSync(path, "utf8");
  if (!source.includes(before)) throw new Error(`Expected source not found in ${path}`);
  writeFileSync(path, source.replace(before, after));
}

replace(
  "src/app/admin/events/[id]/attendance/page.tsx",
  '            <Link className="button button-secondary" href={`/admin/events/${id}/edit`}>Event settings / upload roster</Link>\n            {selectedTimeslot ? (',
  '            <Link className="button button-secondary" href={`/admin/events/${id}/edit`}>Event settings / upload roster</Link>\n            <Link className="button button-secondary" href={`/admin/events/${id}/attendance/monitor`}>Live monitor</Link>\n            <Link className="button button-secondary" href={`/admin/events/${id}/attendance/reconcile`}>Reconcile</Link>\n            {selectedTimeslot ? ('
);

replace(
  "src/app/admin/events/[id]/edit/page.tsx",
  '          <Link href={`/admin/events/${id}/insights`}>Insights</Link>\n          <Link href={`/admin/events/${id}/attendance`}>Attendance</Link>\n        </nav>',
  '          <Link href={`/admin/events/${id}/insights`}>Insights</Link>\n          <Link href={`/admin/events/${id}/attendance`}>Attendance</Link>\n          <Link href={`/admin/events/${id}/attendance/monitor`}>Live monitor</Link>\n          <Link href={`/admin/events/${id}/attendance/reconcile`}>Reconcile</Link>\n        </nav>'
);
