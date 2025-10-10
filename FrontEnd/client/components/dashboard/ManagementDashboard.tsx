import { useState } from "react";
import type { SituationRecord } from "./SituationsPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Users, Shield, AlertTriangle, Radio } from "lucide-react";
import { PlayersManagement } from "./PlayersManagement";
import { UnitsManagement } from "./UnitsManagement";
import { SituationsManagement } from "./SituationsManagement";
import { TacticalChannels } from "./TacticalChannels";
import { useData } from "@/contexts/DataContext";

interface ManagementDashboardProps {
  className?: string;
  situations: SituationRecord[];
  setSituations: React.Dispatch<React.SetStateAction<SituationRecord[]>>;
  assignments: Record<string, string | null>;
  setAssignments: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
}

export function ManagementDashboard({ className, situations, setSituations, assignments, setAssignments }: ManagementDashboardProps) {
  const { players } = useData();
  const [activeTab, setActiveTab] = useState("players");

  return (
    <div className={className}>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-6 h-6" />
            Центр управления операциями
          </CardTitle>
          <CardDescription>
            Единая панель управления игроками, юнитами и ситуациями
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="players" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Игроки
          </TabsTrigger>
          <TabsTrigger value="units" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Юниты
          </TabsTrigger>
          <TabsTrigger value="situations" className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Ситуации
          </TabsTrigger>
          <TabsTrigger value="channels" className="flex items-center gap-2">
            <Radio className="w-4 h-4" />
            Каналы
          </TabsTrigger>
        </TabsList>

        <TabsContent value="players" className="mt-6">
          <PlayersManagement />
        </TabsContent>

        <TabsContent value="units" className="mt-6">
          <UnitsManagement
            assignments={assignments}
            setAssignments={setAssignments}
          />
        </TabsContent>

        <TabsContent value="situations" className="mt-6">
          <SituationsManagement
            situations={situations}
            setSituations={setSituations}
            assignments={assignments}
            setAssignments={setAssignments}
          />
        </TabsContent>

        <TabsContent value="channels" className="mt-6">
          <TacticalChannels />
        </TabsContent>
      </Tabs>
    </div>
  );
}