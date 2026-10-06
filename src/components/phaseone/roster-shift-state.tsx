"use client";

import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

import { rosterKeys } from "@/lib/query/keys";
import {
  mergeAttendanceReadModel,
  type AttendanceReadModelDTO,
  type RosterRowDTO,
} from "@/lib/phaseone/roster-row";

type RosterShiftState = {
  eventId: string;
  timeslotId: string;
  rows: RosterRowDTO[];
};

const RosterShiftStateContext = createContext<RosterShiftState | null>(null);

export function patchRosterShiftCache(
  queryClient: QueryClient,
  eventId: string,
  timeslotId: string,
  updates: AttendanceReadModelDTO | AttendanceReadModelDTO[],
) {
  const byRosterId = new Map(
    (Array.isArray(updates) ? updates : [updates]).map((row) => [
      row.rosterId,
      row,
    ]),
  );

  queryClient.setQueryData<RosterRowDTO[]>(
    rosterKeys.shift(eventId, timeslotId),
    (current) => {
      if (!current) return current;
      return current.map((row) => {
        const update = byRosterId.get(row.rosterId);
        return update ? mergeAttendanceReadModel(row, update) : row;
      });
    },
  );
}

export function RosterShiftStateProvider({
  eventId,
  timeslotId,
  initialRows,
  children,
}: Readonly<{
  eventId: string;
  timeslotId: string;
  initialRows: RosterRowDTO[];
  children: ReactNode;
}>) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => rosterKeys.shift(eventId, timeslotId),
    [eventId, timeslotId],
  );
  const { data = initialRows } = useQuery({
    queryKey,
    queryFn: async () => initialRows,
    initialData: initialRows,
    staleTime: Infinity,
  });

  useEffect(() => {
    queryClient.setQueryData<RosterRowDTO[]>(queryKey, initialRows);
  }, [initialRows, queryClient, queryKey]);

  const value = useMemo(
    () => ({ eventId, timeslotId, rows: data }),
    [data, eventId, timeslotId],
  );

  return (
    <RosterShiftStateContext.Provider value={value}>
      {children}
    </RosterShiftStateContext.Provider>
  );
}

export function useRosterShiftState(): RosterShiftState {
  const state = useContext(RosterShiftStateContext);
  if (!state) {
    throw new Error("Roster shift state must be used inside RosterShiftStateProvider.");
  }
  return state;
}

export function useRosterRow(rosterId: string): RosterRowDTO {
  const { rows } = useRosterShiftState();
  const row = rows.find((item) => item.rosterId === rosterId);
  if (!row) {
    throw new Error(`Roster row ${rosterId} is not present in the active shift cache.`);
  }
  return row;
}
