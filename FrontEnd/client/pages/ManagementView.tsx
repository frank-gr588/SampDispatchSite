import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlayersTable } from "@/components/dashboard/PlayersTable";
import { UnitsManagement } from "@/components/dashboard/UnitsManagement";
import { SituationsManagement } from "@/components/dashboard/SituationsManagement";
import { TacticalChannels } from "@/components/dashboard/TacticalChannels";
import { usePlayers, useUnits, useSituations, useTacticalChannels } from "@/hooks/useDataQueries";

export default function ManagementView() {
  const { data: players } = usePlayers();
  const { data: units } = useUnits();
  const { data: situations } = useSituations();
  const { data: channels } = useTacticalChannels();

  const [playerSearch, setPlayerSearch] = useState("");
  const [playerStatusFilter, setPlayerStatusFilter] = useState("all");

  return (
    <div className="h-full overflow-auto p-4">
      <Tabs defaultValue="players" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="players">Игроки ({players?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="units">Юниты ({units?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="situations">Ситуации ({situations?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="channels">Каналы ({channels?.length ?? 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="players">
          <PlayersTable
            players={players ?? []}
            searchTerm={playerSearch}
            onSearchTermChange={setPlayerSearch}
            statusFilter={playerStatusFilter}
            onStatusFilterChange={setPlayerStatusFilter}
          />
        </TabsContent>
        <TabsContent value="units">
          <UnitsManagement />
        </TabsContent>
        <TabsContent value="situations">
          <SituationsManagement />
        </TabsContent>
        <TabsContent value="channels">
          <TacticalChannels />
        </TabsContent>
      </Tabs>
    </div>
  );
}
