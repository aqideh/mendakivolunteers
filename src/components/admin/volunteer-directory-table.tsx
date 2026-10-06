"use client";

import { useQuery } from "@tanstack/react-query";
import {
  createSortedRowModel,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
  type ColumnDef,
} from "@tanstack/react-table";
import Fuse from "fuse.js";
import { useEffect, useMemo, useState } from "react";

import { volunteerKeys } from "@/lib/query/keys";

export type VolunteerDirectoryRow = {
  id: string;
  volunteerCode: string;
  displayName: string;
  email: string | null;
  mobile: string | null;
  postalCode: string | null;
  neighbourhood: string | null;
  planningArea: string | null;
  electoralDivision: string | null;
  tshirtSize: string | null;
  highestQualification: string | null;
  age: number | null;
};

export type VolunteerDirectoryInitialFilters = {
  query: string;
  planningArea: string;
  electoralDivision: string;
  tshirtSize: string;
  qualification: string;
  minAge: string;
  maxAge: string;
};

type Props = Readonly<{
  initialRows: VolunteerDirectoryRow[];
  planningAreas: string[];
  electoralDivisions: string[];
  qualifications: string[];
  initialFilters: VolunteerDirectoryInitialFilters;
}>;

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
});

const columns: Array<ColumnDef<typeof features, VolunteerDirectoryRow>> = [
  {
    accessorKey: "displayName",
    header: "Volunteer",
    cell: (info) => {
      const row = info.row.original;
      return (
        <>
          <strong>{row.displayName || "Volunteer"}</strong>
          <br />
          <span className="muted">{row.volunteerCode}</span>
        </>
      );
    },
  },
  {
    accessorKey: "postalCode",
    header: "Postal code",
    cell: (info) => info.getValue<string | null>() ?? "—",
  },
  {
    id: "area",
    accessorFn: (row) => row.neighbourhood ?? row.planningArea ?? "",
    header: "Neighbourhood / planning area",
    cell: (info) =>
      info.row.original.neighbourhood ??
      info.row.original.planningArea ??
      "Pending location verification",
  },
  {
    accessorKey: "electoralDivision",
    header: "GRC / SMC",
    cell: (info) => info.getValue<string | null>() ?? "Pending verification",
  },
  {
    accessorKey: "age",
    header: "Age",
    cell: (info) => info.getValue<number | null>() ?? "—",
  },
  {
    accessorKey: "tshirtSize",
    header: "Shirt",
    cell: (info) => info.getValue<string | null>() ?? "—",
  },
  {
    accessorKey: "highestQualification",
    header: "Qualification",
    cell: (info) => {
      const value = info.getValue<string | null>();
      return value ? value.replaceAll("_", " ") : "—";
    },
  },
];

function numberFilter(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function VolunteerDirectoryTable({
  initialRows,
  planningAreas,
  electoralDivisions,
  qualifications,
  initialFilters,
}: Props) {
  const { data = initialRows } = useQuery({
    queryKey: volunteerKeys.directory(),
    queryFn: async () => initialRows,
    initialData: initialRows,
    staleTime: Infinity,
  });

  const [query, setQuery] = useState(initialFilters.query);
  const [planningArea, setPlanningArea] = useState(initialFilters.planningArea);
  const [electoralDivision, setElectoralDivision] = useState(initialFilters.electoralDivision);
  const [tshirtSize, setTshirtSize] = useState(initialFilters.tshirtSize);
  const [qualification, setQualification] = useState(initialFilters.qualification);
  const [minAge, setMinAge] = useState(initialFilters.minAge);
  const [maxAge, setMaxAge] = useState(initialFilters.maxAge);

  const fuse = useMemo(
    () =>
      new Fuse(data, {
        threshold: 0.32,
        ignoreLocation: true,
        includeScore: true,
        keys: [
          { name: "displayName", weight: 1 },
          { name: "volunteerCode", weight: 0.9 },
          { name: "email", weight: 0.8 },
          { name: "mobile", weight: 0.8 },
          { name: "postalCode", weight: 0.5 },
          { name: "neighbourhood", weight: 0.5 },
          { name: "planningArea", weight: 0.5 },
          { name: "electoralDivision", weight: 0.4 },
        ],
      }),
    [data],
  );

  const filteredRows = useMemo(() => {
    const searched = query.trim()
      ? fuse.search(query.trim()).map(({ item }) => item)
      : data;
    const minimumAge = numberFilter(minAge);
    const maximumAge = numberFilter(maxAge);

    return searched.filter((row) => {
      if (planningArea && row.planningArea !== planningArea) return false;
      if (electoralDivision && row.electoralDivision !== electoralDivision) return false;
      if (tshirtSize && row.tshirtSize !== tshirtSize) return false;
      if (qualification && row.highestQualification !== qualification) return false;
      if (minimumAge !== null && (row.age === null || row.age < minimumAge)) return false;
      if (maximumAge !== null && (row.age === null || row.age > maximumAge)) return false;
      return true;
    });
  }, [
    data,
    electoralDivision,
    fuse,
    maxAge,
    minAge,
    planningArea,
    qualification,
    query,
    tshirtSize,
  ]);

  const table = useTable({
    key: "volunteer-directory",
    features,
    columns,
    data: filteredRows,
    initialState: {
      sorting: [{ id: "displayName", desc: false }],
    },
  });

  const exportParams = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (planningArea) params.set("planningArea", planningArea);
    if (electoralDivision) params.set("electoralDivision", electoralDivision);
    if (tshirtSize) params.set("tshirtSize", tshirtSize);
    if (qualification) params.set("qualification", qualification);
    if (minAge.trim()) params.set("minAge", minAge.trim());
    if (maxAge.trim()) params.set("maxAge", maxAge.trim());
    return params;
  }, [electoralDivision, maxAge, minAge, planningArea, qualification, query, tshirtSize]);

  useEffect(() => {
    const next = exportParams.toString();
    const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    window.history.replaceState(window.history.state, "", url);
  }, [exportParams]);

  function clearFilters() {
    setQuery("");
    setPlanningArea("");
    setElectoralDivision("");
    setTshirtSize("");
    setQualification("");
    setMinAge("");
    setMaxAge("");
  }

  return (
    <>
      <section className="phaseone-admin-form" aria-label="Volunteer directory filters">
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="volunteer-search">Search</label>
            <input
              id="volunteer-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, volunteer ID, email, postal code"
            />
          </div>
          <div className="form-field">
            <label htmlFor="volunteer-planning-area">Planning area</label>
            <select id="volunteer-planning-area" value={planningArea} onChange={(event) => setPlanningArea(event.target.value)}>
              <option value="">All</option>
              {planningAreas.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="volunteer-electoral-division">GRC / SMC</label>
            <select id="volunteer-electoral-division" value={electoralDivision} onChange={(event) => setElectoralDivision(event.target.value)}>
              <option value="">All</option>
              {electoralDivisions.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="volunteer-shirt-size">T-shirt size</label>
            <select id="volunteer-shirt-size" value={tshirtSize} onChange={(event) => setTshirtSize(event.target.value)}>
              <option value="">All</option>
              {["S", "M", "L", "XL", "2XL", "3XL", "5XL", "7XL"].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="volunteer-qualification">Highest qualification</label>
            <select id="volunteer-qualification" value={qualification} onChange={(event) => setQualification(event.target.value)}>
              <option value="">All</option>
              {qualifications.map((value) => (
                <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="volunteer-min-age">Minimum age</label>
            <input id="volunteer-min-age" inputMode="numeric" min={0} max={120} type="number" value={minAge} onChange={(event) => setMinAge(event.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="volunteer-max-age">Maximum age</label>
            <input id="volunteer-max-age" inputMode="numeric" min={0} max={120} type="number" value={maxAge} onChange={(event) => setMaxAge(event.target.value)} />
          </div>
        </div>
        <div className="actions">
          <button className="button button-secondary" onClick={clearFilters} type="button">Clear filters</button>
          <a className="button button-secondary" href={`/admin/volunteers/export?${exportParams.toString()}`}>
            Export filtered CSV
          </a>
        </div>
      </section>

      <section className="section" aria-labelledby="volunteer-results-title">
        <div className="section-header">
          <div>
            <h2 id="volunteer-results-title">Volunteers</h2>
            <p className="muted">{filteredRows.length} matching records · filters update instantly</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="content-table">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id}>
                      {header.isPlaceholder ? null : (
                        <button
                          className="km-table-sort"
                          disabled={!header.column.getCanSort()}
                          onClick={header.column.getToggleSortingHandler()}
                          type="button"
                        >
                          <table.FlexRender header={header} />
                          {{
                            asc: " ↑",
                            desc: " ↓",
                          }[header.column.getIsSorted() as string] ?? ""}
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <td key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                </tr>
              ))}
              {filteredRows.length === 0 ? (
                <tr><td colSpan={columns.length}>No volunteers match these filters.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
