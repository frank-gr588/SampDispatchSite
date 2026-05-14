import { useState, useMemo, useCallback } from "react";
import { AssignmentBoard } from "@/components/dashboard/AssignmentBoard";
import { useUnits, useSituations } from "@/hooks/useDataQueries";
import { apiPost, apiPut } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/hooks/useDataQueries";

export default function BoardView() {
  const { data: units } = useUnits();
  const { data: situations } = useSituations();
  const qc = useQueryClient();

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: qk.units });
    qc.invalidateQueries({ queryKey: qk.situations });
  }, [qc]);

  const assignments = useMemo(() => {
    const a: Record<string, string | null> = {};
    (units ?? []).forEach(u => {
      a[u.id] = u.situationId ?? null;
    });
    return a;
  }, [units]);

  const handleAssignmentChange = useCallback(async (unitId: string, situationId: string | null) => {
    const unit = (units ?? []).find(u => u.id === unitId);
    if (!unit) return;
    try {
      if (situationId) {
        await apiPut(`/api/units/${unitId}/status`, { status: "Code 2" });
        await apiPost(`/api/situations/${situationId}/units/add`, { unitId, asLeadUnit: unit.isLeadUnit });
      } else if (unit.situationId) {
        await apiPost(`/api/situations/${unit.situationId}/units/remove`, { unitId });
      }
      await invalidate();
    } catch (e) {
      console.error("Assignment error:", e);
    }
  }, [units, invalidate]);

  return (
    <AssignmentBoard
      units={units ?? []}
      situations={situations ?? []}
      assignments={assignments}
      onAssignmentChange={handleAssignmentChange}
    />
  );
}
