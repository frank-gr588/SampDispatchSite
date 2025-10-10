import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { PlayerPointDto, SituationDto, TacticalChannelDto, UnitDto, PlayerStatus, PlayerRole, PlayerRank } from "../shared/api";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // --- Minimal mock endpoints for local development ---
  // In-memory store for mock players (persists while dev server runs)
  const players: PlayerPointDto[] = [
    // Seed a couple of demo players so dev UX is better
    {
      nick: "Officer1",
      x: -10000,
      y: -10000,
      role: PlayerRole.Officer,
      rank: PlayerRank.PoliceOfficer,
      status: PlayerStatus.OnDutyOutOfUnit,
      lastUpdate: new Date().toISOString(),
    },
    {
      nick: "Supervisor1",
      x: -10000,
      y: -10000,
      role: PlayerRole.Supervisor,
      rank: PlayerRank.PoliceSergeant,
      status: PlayerStatus.OnDutyOutOfUnit,
      lastUpdate: new Date().toISOString(),
    },
  ];

  // Coords/players feed
  app.get("/api/coords/all", (_req, res) => {
    res.json(players);
  });

  // Units list
  // In-memory units store for local development
  const units: UnitDto[] = [];

  // Units list
  app.get("/api/units", (_req, res) => {
    // Ensure units returned are well-formed
    const safe = units.map(u => ({
      id: String(u.id),
      marking: String(u.marking ?? ""),
      playerNicks: Array.isArray(u.playerNicks) ? u.playerNicks.map(String) : [],
      playerCount: Number(u.playerNicks?.length ?? 0),
      status: String(u.status ?? ""),
      situationId: u.situationId ?? null,
      isLeadUnit: !!u.isLeadUnit,
      tacticalChannelId: u.tacticalChannelId ?? null,
      createdAt: u.createdAt ?? new Date().toISOString(),
    }));
    res.json(safe);
  });

  // Create unit
  app.post("/api/units", (req, res) => {
    const body = req.body as any;
    const marking = (body?.Marking ?? body?.marking ?? "").toString();
    const rawPlayerNicks = (body?.PlayerNicks ?? body?.playerNicks ?? []);
    const isLead = !!(body?.IsLeadUnit ?? body?.isLeadUnit);

    // Basic validation
    if (!marking || typeof marking !== 'string' || marking.length > 8) {
      return res.status(400).send("Invalid marking: required string up to 8 chars");
    }
    if (!Array.isArray(rawPlayerNicks) || rawPlayerNicks.length === 0) {
      return res.status(400).send("PlayerNicks required and must be an array");
    }

    const playerNicks = rawPlayerNicks.map((p: any) => String(p)).filter((p: string) => p.trim().length > 0);
    if (playerNicks.length === 0) return res.status(400).send("PlayerNicks must contain at least one non-empty nick");

    const id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    const unit: UnitDto = {
      id: id,
      marking: marking,
      playerNicks: playerNicks.slice(),
      playerCount: playerNicks.length,
      status: "",
      situationId: null,
      isLeadUnit: !!isLead,
      tacticalChannelId: null,
      createdAt: new Date().toISOString(),
    };

    // push sanitized unit
    units.push(unit);

    // Update players store: assign unitId and change status
    for (const nick of playerNicks) {
      const p = players.find(x => x.nick.toLowerCase() === nick.toLowerCase());
      if (p) {
        p.unitId = unit.id;
        p.status = p.role === PlayerRole.Supervisor || p.role === PlayerRole.SuperSupervisor
          ? PlayerStatus.OnDutyLeadUnit
          : PlayerStatus.OnDuty;
        p.lastUpdate = new Date().toISOString();
      }
    }

    res.status(201).json(unit);
  });

  // Get unit players
  app.get("/api/units/:id/players", (req, res) => {
    const id = decodeURIComponent(req.params.id || "");
    const unit = units.find(u => u.id === id);
    if (!unit) return res.status(404).end();
    const pls = players.filter(p => unit.playerNicks.find(n => n.toLowerCase() === p.nick.toLowerCase()));
    res.json(pls);
  });

  // Delete unit
  app.delete("/api/units/:id", (req, res) => {
    const id = decodeURIComponent(req.params.id || "");
    const idx = units.findIndex(u => u.id === id);
    if (idx >= 0) {
      const unit = units[idx];
      // free players
      for (const nick of unit.playerNicks) {
        const p = players.find(x => x.nick.toLowerCase() === nick.toLowerCase());
        if (p) {
          p.unitId = null;
          p.status = PlayerStatus.OnDutyOutOfUnit;
          p.lastUpdate = new Date().toISOString();
        }
      }
      units.splice(idx, 1);
      return res.status(204).end();
    }
    return res.status(404).end();
  });

  // Add player to unit
  app.post("/api/units/:id/players/add", (req, res) => {
    const id = decodeURIComponent(req.params.id || "");
    const body = req.body as { playerNick?: string };
    if (!body?.playerNick) return res.status(400).end();
    const unit = units.find(u => u.id === id);
    if (!unit) return res.status(404).end();
    const nick = body.playerNick;
    if (!unit.playerNicks.find(n => n.toLowerCase() === nick.toLowerCase())) {
      unit.playerNicks.push(nick);
      unit.playerCount = unit.playerNicks.length;
    }
    const p = players.find(x => x.nick.toLowerCase() === nick.toLowerCase());
    if (p) {
      p.unitId = unit.id;
      p.status = p.role === PlayerRole.Supervisor || p.role === PlayerRole.SuperSupervisor
        ? PlayerStatus.OnDutyLeadUnit
        : PlayerStatus.OnDuty;
      p.lastUpdate = new Date().toISOString();
    }
    return res.status(204).end();
  });

  // Remove player from unit
  app.post("/api/units/:id/players/remove", (req, res) => {
    const id = decodeURIComponent(req.params.id || "");
    const body = req.body as { playerNick?: string };
    if (!body?.playerNick) return res.status(400).end();
    const unit = units.find(u => u.id === id);
    if (!unit) return res.status(404).end();
    const nick = body.playerNick;
    unit.playerNicks = unit.playerNicks.filter(n => n.toLowerCase() !== nick.toLowerCase());
    unit.playerCount = unit.playerNicks.length;
    const p = players.find(x => x.nick.toLowerCase() === nick.toLowerCase());
    if (p) {
      p.unitId = null;
      p.status = PlayerStatus.OnDutyOutOfUnit;
      p.lastUpdate = new Date().toISOString();
    }
    // If unit empty, delete it
    if (unit.playerNicks.length === 0) {
      const idx = units.findIndex(u => u.id === id);
      if (idx >= 0) units.splice(idx, 1);
    }
    return res.status(204).end();
  });

  // Set unit status
  app.put("/api/units/:id/status", (req, res) => {
    const id = decodeURIComponent(req.params.id || "");
    const body = req.body as { status?: string };
    const unit = units.find(u => u.id === id);
    if (!unit) return res.status(404).end();
    unit.status = body.status ?? unit.status;
    return res.status(204).end();
  });

  // Available units (not on situation)
  app.get("/api/units/available", (_req, res) => {
    const avail = units.filter(u => !u.situationId);
    res.json(avail);
  });

  // Units by situation
  app.get("/api/units/by-situation/:id", (req, res) => {
    const id = decodeURIComponent(req.params.id || "");
    const list = units.filter(u => u.situationId === id);
    res.json(list);
  });


  // In-memory situations store for local development
  const situations: SituationDto[] = [
    {
      id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
      type: "pursuit",
      metadata: { channel: "TAC-1", mode: "active" },
      units: [],
      greenUnitId: null,
      redUnitId: null,
      createdAt: new Date().toISOString(),
      isActive: true,
    }
  ];

  // In-memory tactical channels store for local development
  const tacticalChannels: TacticalChannelDto[] = [
    { id: "1", name: "TAC-1", isBusy: false, situationId: null, notes: "" },
    { id: "2", name: "TAC-2", isBusy: false, situationId: null, notes: "" },
    { id: "3", name: "TAC-3", isBusy: false, situationId: null, notes: "" },
  ];

  // Синхронизация каналов с активными ситуациями
  const syncChannelsWithSituations = () => {
    console.log('[SYNC] Starting channel sync...');
    console.log('[SYNC] Active situations:', situations.filter(s => s.isActive).map(s => ({ id: s.id, channel: (s.metadata as any)?.channel })));
    // Сначала освобождаем все каналы
    tacticalChannels.forEach(channel => {
      channel.isBusy = false;
      channel.situationId = null;
    });

    // Затем помечаем занятые каналы из активных ситуаций
    situations.forEach(situation => {
      if (situation.isActive) {
        const channelName = (situation.metadata as Record<string, string>)?.channel;
        console.log(`[SYNC] Situation ${situation.id.substring(0, 8)}: channel="${channelName}"`);
        if (channelName && channelName !== "none") {
          const channel = tacticalChannels.find(c => c.name === channelName);
          if (channel) {
            channel.isBusy = true;
            channel.situationId = situation.id;
            console.log(`[SYNC] ✓ Marked ${channel.name} as busy`);
          } else {
            console.log(`[SYNC] ✗ Channel "${channelName}" not found`);
          }
        }
      }
    });
    console.log('[SYNC] Channels after sync:', tacticalChannels.map(c => ({ name: c.name, isBusy: c.isBusy })));
  };

  // Синхронизируем каналы при старте сервера
  syncChannelsWithSituations();

  // Tactical channels list
  app.get("/api/channels/all", (_req, res) => {
    syncChannelsWithSituations(); // Синхронизируем перед отправкой
    res.json(tacticalChannels);
  });

  // Update channel notes
  app.put("/api/channels/:id/notes", (req, res) => {
    const { id } = req.params;
    const { notes } = req.body;
    
    const channel = tacticalChannels.find(c => c.id === id);
    if (!channel) {
      return res.status(404).json({ error: "Channel not found" });
    }
    
    channel.notes = notes || "";
    console.log(`[CHANNEL NOTES] Updated notes for ${channel.name}: "${notes}"`);
    res.json(channel);
  });

  // Situations list
  app.get("/api/situations/all", (_req, res) => {
    syncChannelsWithSituations(); // Синхронизируем каналы при каждом запросе ситуаций
    res.json(situations);
  });

  // Create situation
  app.post("/api/situations/create", (req, res) => {
    const body = req.body as Partial<SituationDto> & { type?: string, metadata?: Record<string,string> };
    if (!body.type) return res.status(400).send("Type is required");
    const id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    const sit: SituationDto = {
      id,
      type: body.type,
      metadata: body.metadata ?? {},
      units: [],
      greenUnitId: null,
      redUnitId: null,
      createdAt: new Date().toISOString(),
      isActive: true,
    };
    situations.push(sit);
    
    // Если указан тактический канал, помечаем его как занятый
    const channelName = (body.metadata?.channel ?? "").trim();
    console.log(`[CREATE SITUATION] Channel name from metadata: "${channelName}"`);
    if (channelName && channelName !== "none") {
      const channel = tacticalChannels.find(c => c.name === channelName);
      console.log(`[CREATE SITUATION] Found channel:`, channel);
      if (channel) {
        channel.isBusy = true;
        channel.situationId = id;
        console.log(`[CREATE SITUATION] Marked channel ${channel.name} as busy for situation ${id}`);
      }
    }
    
    res.status(201).json(sit);
  });

  app.post("/api/situations/:id/open", (req, res) => {
    const id = req.params.id;
    const s = situations.find(x => x.id === id);
    if (!s) return res.status(404).end();
    s.isActive = true;
    
    // Занимаем канал, если он указан
    const channelName = (s.metadata as Record<string, string>)?.channel;
    if (channelName && channelName !== "none") {
      const channel = tacticalChannels.find(c => c.name === channelName);
      if (channel) {
        channel.isBusy = true;
        channel.situationId = id;
      }
    }
    
    return res.status(204).end();
  });

  app.post("/api/situations/:id/close", (req, res) => {
    const id = req.params.id;
    const s = situations.find(x => x.id === id);
    if (!s) return res.status(404).end();
    s.isActive = false;
    
    // Освобождаем тактический канал
    const channelName = (s.metadata as Record<string, string>)?.channel;
    if (channelName) {
      const channel = tacticalChannels.find(c => c.name === channelName);
      if (channel && channel.situationId === id) {
        channel.isBusy = false;
        channel.situationId = null;
      }
    }
    
    // free units
    s.units = [];
    s.greenUnitId = null;
    s.redUnitId = null;
    return res.status(204).end();
  });

  app.put("/api/situations/:id/metadata", (req, res) => {
    const id = req.params.id;
    const body = req.body as { metadata?: Record<string,string> };
    const s = situations.find(x => x.id === id);
    if (!s) return res.status(404).end();
    
    // Освобождаем старый канал
    const oldChannelName = (s.metadata as Record<string, string>)?.channel;
    if (oldChannelName) {
      const oldChannel = tacticalChannels.find(c => c.name === oldChannelName);
      if (oldChannel && oldChannel.situationId === id) {
        oldChannel.isBusy = false;
        oldChannel.situationId = null;
      }
    }
    
    // Обновляем metadata
    s.metadata = { ...s.metadata, ...(body.metadata ?? {}) };
    
    // Занимаем новый канал
    const newChannelName = (s.metadata as Record<string, string>)?.channel;
    if (newChannelName && newChannelName !== "none") {
      const newChannel = tacticalChannels.find(c => c.name === newChannelName);
      if (newChannel) {
        newChannel.isBusy = true;
        newChannel.situationId = id;
      }
    }
    
    return res.status(200).json(s);
  });

  app.post("/api/situations/:id/units/add", (req, res) => {
    const id = req.params.id;
    const body = req.body as { unitId?: string, asLeadUnit?: boolean };
    const s = situations.find(x => x.id === id);
    if (!s) return res.status(404).end();
    if (!body.unitId) return res.status(400).end();
    // avoid duplicates
    if (!s.units.includes(body.unitId)) s.units.push(body.unitId);
    
    // Set greenUnitId to first unit if not already set
    if (!s.greenUnitId) {
      s.greenUnitId = body.unitId;
    }
    
    // If asLeadUnit, set as redUnitId (commander)
    if (body.asLeadUnit) {
      s.redUnitId = body.unitId;
    }
    
    // Reflect assignment in units store as well
    const unit = units.find(u => u.id === body.unitId);
    if (unit) {
      unit.situationId = id;
      unit.isLeadUnit = !!body.asLeadUnit;
    }
    return res.status(204).end();
  });

  app.post("/api/situations/:id/units/remove", (req, res) => {
    const id = req.params.id;
    const body = req.body as { unitId?: string };
    const s = situations.find(x => x.id === id);
    if (!s) return res.status(404).end();
    if (!body.unitId) return res.status(400).end();
    s.units = s.units.filter(u => u !== body.unitId);
    
    // Clear greenUnitId or redUnitId if this was that unit
    if (s.greenUnitId === body.unitId) s.greenUnitId = null;
    if (s.redUnitId === body.unitId) s.redUnitId = null;
    
    // Reflect removal in units store
    const unit = units.find(u => u.id === body.unitId);
    if (unit) {
      unit.situationId = null;
      unit.isLeadUnit = false;
    }
    return res.status(204).end();
  });

  app.post("/api/situations/:id/lead-unit", (req, res) => {
    const id = req.params.id;
    const body = req.body as { unitId?: string };
    const s = situations.find(x => x.id === id);
    if (!s) return res.status(404).end();
    if (!body.unitId) return res.status(400).end();
    if (!s.units.includes(body.unitId)) s.units.push(body.unitId);
    
    // Set as red unit (commander)
    s.redUnitId = body.unitId;
    
    // Reflect lead assignment in units store
    units.forEach(u => {
      if (u.id === body.unitId) {
        u.situationId = id;
        u.isLeadUnit = true;
      } else if (u.situationId === id) {
        // other units on the same situation are not lead
        u.isLeadUnit = false;
      }
    });
    return res.status(204).end();
  });

  app.delete("/api/situations/:id", (req, res) => {
    const id = req.params.id;
    const idx = situations.findIndex(x => x.id === id);
    if (idx >= 0) {
      situations.splice(idx, 1);
      return res.status(204).end();
    }
    return res.status(404).end();
  });

  app.post("/api/situations/panic", (req, res) => {
    const body = req.body as { nick?: string, value?: number };
    // For dev server, just echo OK — frontend doesn't rely on response body
    return res.status(200).end();
  });
  

  // Players management with in-memory persistence for local dev
  app.post("/api/players", (req, res) => {
    const body = req.body as Partial<PlayerPointDto>;
    const created: PlayerPointDto = {
      nick: body.nick ?? "",
      x: body.x ?? -10000,
      y: body.y ?? -10000,
      role: (body.role ?? PlayerRole.Officer) as PlayerRole,
      rank: (body.rank ?? PlayerRank.PoliceOfficer) as PlayerRank,
      status: (body.status ?? PlayerStatus.OnDutyOutOfUnit) as PlayerStatus,
      lastUpdate: new Date().toISOString(),
    };

    // Add to in-memory store (avoid duplicates)
    const exists = players.find(p => p.nick.toLowerCase() === created.nick.toLowerCase());
    if (!exists) {
      players.push(created);
    }

    res.status(201).json(created);
  });

  // Players available for unit assignment
  app.get("/api/players/available-for-unit", (_req, res) => {
    const avail = players.filter(p => !p.unitId);
    res.json(avail);
  });

  app.put("/api/players/:nick/role", (req, res) => {
    const nick = decodeURIComponent(req.params.nick || "");
    const body = req.body as { role?: PlayerRole };
    const p = players.find(pl => pl.nick.toLowerCase() === nick.toLowerCase());
    if (p && body.role !== undefined) {
      p.role = body.role;
      p.lastUpdate = new Date().toISOString();
      return res.status(204).end();
    }
    return res.status(404).end();
  });

  app.put("/api/players/:nick/rank", (req, res) => {
    const nick = decodeURIComponent(req.params.nick || "");
    const body = req.body as { rank?: PlayerRank };
    const p = players.find(pl => pl.nick.toLowerCase() === nick.toLowerCase());
    if (p && body.rank !== undefined) {
      p.rank = body.rank;
      p.lastUpdate = new Date().toISOString();
      return res.status(204).end();
    }
    return res.status(404).end();
  });

  app.put("/api/players/:nick/status", (req, res) => {
    const nick = decodeURIComponent(req.params.nick || "");
    const body = req.body as { status?: PlayerStatus };
    const p = players.find(pl => pl.nick.toLowerCase() === nick.toLowerCase());
    if (p && body.status !== undefined) {
      p.status = body.status;
      p.lastUpdate = new Date().toISOString();
      return res.status(204).end();
    }
    return res.status(404).end();
  });

  app.delete("/api/players/:nick", (req, res) => {
    const nick = decodeURIComponent(req.params.nick || "");
    const idx = players.findIndex(pl => pl.nick.toLowerCase() === nick.toLowerCase());
    if (idx >= 0) {
      players.splice(idx, 1);
      return res.status(204).end();
    }
    return res.status(404).end();
  });

  return app;
}
