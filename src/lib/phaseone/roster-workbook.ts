import "server-only";

import { Buffer } from "node:buffer";

export type ProgrammeRosterVolunteer = Readonly<{
  name: string;
  contactNumber: string | null;
  email: string | null;
  dateOfBirth: string | null;
  tshirtSize: string | null;
  dietaryRestrictions: string | null;
  status: string;
}>;

export type ProgrammeRosterSheet = Readonly<{
  label: string;
  date: string;
  time: string;
  volunteers: readonly ProgrammeRosterVolunteer[];
}>;

export type ProgrammeRosterWorkbook = Readonly<{
  title: string;
  venue: string | null;
  generatedAt: string;
  shifts: readonly ProgrammeRosterSheet[];
}>;

const heading = [
  "Name",
  "Contact number",
  "Email",
  "Date of birth",
  "T-shirt size",
  "Dietary restrictions",
  "Status",
  "Check-in / notes",
] as const;

function xml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cell(column: string, row: number, value: string | null, style: number): string {
  // Every volunteer-controlled field is an inline string: it can never become an Excel formula.
  const safe = xml(value ?? "");
  return '<c r="' + column + row + '" s="' + style +
    '" t="inlineStr"><is><t xml:space="preserve">' + safe + '</t></is></c>';
}

function sheetName(input: string, used: Set<string>): string {
  const base = (input.replace(/[\\/\?\*\[\]:]/g, " ").replace(/^'+|'+$/g, "").trim() || "Roster")
    .slice(0, 31);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    const ending = " (" + suffix + ")";
    candidate = base.slice(0, 31 - ending.length) + ending;
    suffix += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function worksheet(sheet: ProgrammeRosterSheet, programme: ProgrammeRosterWorkbook): string {
  const rows: string[] = [];
  function banner(index: number, value: string, style: number, height: number) {
    rows.push('<row r="' + index + '" ht="' + height + '" customHeight="1">' +
      cell("A", index, value, style) + '</row>');
  }

  banner(1, programme.title, 1, 38);
  banner(2, sheet.date + "  |  " + sheet.label + "  |  " + sheet.time, 2, 28);
  banner(3, "Venue: " + (programme.venue || "Not specified") +
    "    |    " + sheet.volunteers.length + " roster assignment(s)", 3, 25);
  banner(4, "Printed from Keluarga MENDAKI: " + programme.generatedAt +
    " SGT. Check the live system for subsequent changes.", 3, 23);
  banner(5, "CONFIDENTIAL — personal data for authorised event operations only. Store and dispose of printed copies securely.", 8, 27);

  rows.push('<row r="6" ht="30" customHeight="1">' +
    heading.map((label, index) => cell(String.fromCharCode(65 + index), 6, label, 4)).join("") +
    '</row>');

  // Provide five empty handwriting lines for walk-in additions even when the roster is empty.
  const displayed = Math.max(sheet.volunteers.length + 5, 5);
  for (let index = 0; index < displayed; index += 1) {
    const rowIndex = 7 + index;
    const volunteer = sheet.volunteers[index];
    const fields = volunteer
      ? [volunteer.name, volunteer.contactNumber, volunteer.email, volunteer.dateOfBirth,
        volunteer.tshirtSize, volunteer.dietaryRestrictions, volunteer.status, ""]
      : ["", "", "", "", "", "", "", ""];
    const style = index % 2 === 0 ? 5 : 6;
    rows.push('<row r="' + rowIndex + '" ht="32" customHeight="1">' +
      fields.map((value, column) =>
        cell(String.fromCharCode(65 + column), rowIndex, value, style)).join("") +
      '</row>');
  }

  const lastRow = 6 + displayed;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    '<dimension ref="A1:H' + lastRow + '"/>' +
    '<sheetViews><sheetView workbookViewId="0" showGridLines="0">' +
    '<pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/>' +
    '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="22"/>' +
    '<cols>' + [28, 19, 34, 16, 15, 34, 15, 26]
      .map((width, index) => '<col min="' + (index + 1) + '" max="' + (index + 1) +
        '" width="' + width + '" customWidth="1"/>').join("") + '</cols>' +
    '<sheetData>' + rows.join("") + '</sheetData>' +
    '<mergeCells count="5">' + [1, 2, 3, 4, 5]
      .map((row) => '<mergeCell ref="A' + row + ':H' + row + '"/>').join("") +
      '</mergeCells>' +
    '<autoFilter ref="A6:H' + lastRow + '"/>' +
    '<printOptions horizontalCentered="1"/>' +
    '<pageMargins left="0.25" right="0.25" top="0.42" bottom="0.48" header="0.18" footer="0.22"/>' +
    '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
    '<headerFooter><oddFooter>&amp;LKeluarga MENDAKI — Confidential&amp;CPage &amp;P of &amp;N&amp;RInternal use only</oddFooter></headerFooter>' +
    '</worksheet>';
}

const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="5">' +
  '<font><sz val="10"/><name val="Aptos"/></font>' +
  '<font><b/><sz val="17"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FF182B44"/><name val="Aptos"/></font>' +
  '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font>' +
  '<font><sz val="9"/><color rgb="FF7D3340"/><name val="Aptos"/></font>' +
  '</fonts>' +
  '<fills count="6">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF182B44"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFFE08A"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF0F4F8"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="2">' +
  '<border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left/><right/><top/><bottom style="hair"><color rgb="FFD9E0E7"/></bottom><diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="9">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>' +
  '<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>' +
  '<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1" indent="1"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1" indent="1"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1" indent="1"/></xf>' +
  '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="4" fillId="4" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries: readonly [string, string][]): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const fileName = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const crc = crc32(data);
    const file = Buffer.alloc(30);
    file.writeUInt32LE(0x04034b50, 0);
    file.writeUInt16LE(20, 4);
    file.writeUInt16LE(0x0800, 6);
    file.writeUInt32LE(crc, 14);
    file.writeUInt32LE(data.length, 18);
    file.writeUInt32LE(data.length, 22);
    file.writeUInt16LE(fileName.length, 26);
    local.push(file, fileName, data);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(fileName.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, fileName);
    offset += file.length + fileName.length + data.length;
  }
  const centralLength = central.reduce((sum, entry) => sum + entry.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralLength, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

export function createProgrammeRosterWorkbook(input: ProgrammeRosterWorkbook): Buffer {
  const shifts = input.shifts.length ? input.shifts : [{
    label: "Unscheduled",
    date: "No date scheduled",
    time: "—",
    volunteers: [],
  }];
  if (shifts.length > 500) throw new Error("Too many shifts for an Excel workbook.");

  const used = new Set<string>();
  const sheetNames = shifts.map((shift) => sheetName(shift.date + " " + shift.label, used));
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    shifts.map((_, index) => '<Override PartName="/xl/worksheets/sheet' + (index + 1) +
      '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("") +
    '</Types>';
  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<bookViews><workbookView activeTab="0"/></bookViews>' +
    '<sheets>' + sheetNames.map((name, index) =>
      '<sheet name="' + xml(name) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>').join("") +
    '</sheets><definedNames>' + sheetNames.map((name, index) =>
      '<definedName name="_xlnm.Print_Titles" localSheetId="' + index + '">' +
      xml("'" + name.replace(/'/g, "''") + "'!$1:$6") + '</definedName>').join("") +
    '</definedNames></workbook>';
  const relations = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';
  const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    shifts.map((_, index) => '<Relationship Id="rId' + (index + 1) +
      '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' +
      (index + 1) + '.xml"/>').join("") +
    '<Relationship Id="rId' + (shifts.length + 1) +
    '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  return zip([
    ["[Content_Types].xml", contentTypes],
    ["_rels/.rels", relations],
    ["xl/workbook.xml", workbook],
    ["xl/_rels/workbook.xml.rels", workbookRels],
    ["xl/styles.xml", styles],
    ...shifts.map((shift, index): [string, string] => [
      "xl/worksheets/sheet" + (index + 1) + ".xml",
      worksheet(shift, input),
    ]),
  ]);
}
