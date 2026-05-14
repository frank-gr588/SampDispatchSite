import path from "path";
import "dotenv/config";
import * as express from "express";
import express__default from "express";
import cors from "cors";
const handleDemo = (req, res) => {
  const response = {
    message: "Hello from Express server"
  };
  res.status(200).json(response);
};
var PlayerStatus = /* @__PURE__ */ ((PlayerStatus2) => {
  PlayerStatus2[PlayerStatus2["OutOfDuty"] = 0] = "OutOfDuty";
  PlayerStatus2[PlayerStatus2["OnDuty"] = 1] = "OnDuty";
  PlayerStatus2[PlayerStatus2["OnDutyLeadUnit"] = 2] = "OnDutyLeadUnit";
  PlayerStatus2[PlayerStatus2["OnDutyOutOfUnit"] = 3] = "OnDutyOutOfUnit";
  return PlayerStatus2;
})(PlayerStatus || {});
var PlayerRole = /* @__PURE__ */ ((PlayerRole2) => {
  PlayerRole2[PlayerRole2["Officer"] = 0] = "Officer";
  PlayerRole2[PlayerRole2["Supervisor"] = 1] = "Supervisor";
  PlayerRole2[PlayerRole2["SuperSupervisor"] = 2] = "SuperSupervisor";
  return PlayerRole2;
})(PlayerRole || {});
var PlayerRank = /* @__PURE__ */ ((PlayerRank2) => {
  PlayerRank2[PlayerRank2["ChiefOfPolice"] = 0] = "ChiefOfPolice";
  PlayerRank2[PlayerRank2["AssistantChiefOfPolice"] = 1] = "AssistantChiefOfPolice";
  PlayerRank2[PlayerRank2["DeputyChiefOfPolice"] = 2] = "DeputyChiefOfPolice";
  PlayerRank2[PlayerRank2["PoliceCommander"] = 3] = "PoliceCommander";
  PlayerRank2[PlayerRank2["PoliceCaptain"] = 4] = "PoliceCaptain";
  PlayerRank2[PlayerRank2["PoliceLieutenant"] = 5] = "PoliceLieutenant";
  PlayerRank2[PlayerRank2["PoliceSergeant"] = 6] = "PoliceSergeant";
  PlayerRank2[PlayerRank2["PoliceInspector"] = 7] = "PoliceInspector";
  PlayerRank2[PlayerRank2["PoliceOfficer"] = 8] = "PoliceOfficer";
  return PlayerRank2;
})(PlayerRank || {});
function createServer() {
  const app2 = express__default();
  app2.use(cors());
  app2.use(express__default.json());
  app2.use(express__default.urlencoded({ extended: true }));
  app2.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });
  app2.get("/api/demo", handleDemo);
  const players = [
    // Seed a couple of demo players so dev UX is better
    {
      nick: "Officer1",
      x: -1e4,
      y: -1e4,
      role: PlayerRole.Officer,
      rank: PlayerRank.PoliceOfficer,
      status: PlayerStatus.OnDutyOutOfUnit,
      lastUpdate: (/* @__PURE__ */ new Date()).toISOString()
    },
    {
      nick: "Supervisor1",
      x: -1e4,
      y: -1e4,
      role: PlayerRole.Supervisor,
      rank: PlayerRank.PoliceSergeant,
      status: PlayerStatus.OnDutyOutOfUnit,
      lastUpdate: (/* @__PURE__ */ new Date()).toISOString()
    }
  ];
  app2.get("/api/coords/all", (_req, res) => {
    res.json(players);
  });
  const units = [];
  app2.get("/api/units", (_req, res) => {
    const safe = units.map((u) => ({
      id: String(u.id),
      marking: String(u.marking ?? ""),
      playerNicks: Array.isArray(u.playerNicks) ? u.playerNicks.map(String) : [],
      playerCount: Number(u.playerNicks?.length ?? 0),
      status: String(u.status ?? ""),
      situationId: u.situationId ?? null,
      isLeadUnit: !!u.isLeadUnit,
      tacticalChannelId: u.tacticalChannelId ?? null,
      createdAt: u.createdAt ?? (/* @__PURE__ */ new Date()).toISOString()
    }));
    res.json(safe);
  });
  app2.post("/api/units", (req, res) => {
    const body = req.body;
    const marking = (body?.Marking ?? body?.marking ?? "").toString();
    const rawPlayerNicks = body?.PlayerNicks ?? body?.playerNicks ?? [];
    const isLead = !!(body?.IsLeadUnit ?? body?.isLeadUnit);
    if (!marking || typeof marking !== "string" || marking.length > 8) {
      return res.status(400).send("Invalid marking: required string up to 8 chars");
    }
    if (!Array.isArray(rawPlayerNicks) || rawPlayerNicks.length === 0) {
      return res.status(400).send("PlayerNicks required and must be an array");
    }
    const playerNicks = rawPlayerNicks.map((p) => String(p)).filter((p) => p.trim().length > 0);
    if (playerNicks.length === 0) return res.status(400).send("PlayerNicks must contain at least one non-empty nick");
    const id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    const unit = {
      id,
      marking,
      playerNicks: playerNicks.slice(),
      playerCount: playerNicks.length,
      status: "",
      situationId: null,
      isLeadUnit: !!isLead,
      tacticalChannelId: null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    units.push(unit);
    for (const nick of playerNicks) {
      const p = players.find((x) => x.nick.toLowerCase() === nick.toLowerCase());
      if (p) {
        p.unitId = unit.id;
        p.status = p.role === PlayerRole.Supervisor || p.role === PlayerRole.SuperSupervisor ? PlayerStatus.OnDutyLeadUnit : PlayerStatus.OnDuty;
        p.lastUpdate = (/* @__PURE__ */ new Date()).toISOString();
      }
    }
    res.status(201).json(unit);
  });
  app2.get("/api/units/:id/players", (req, res) => {
    const id = decodeURIComponent(req.params.id || "");
    const unit = units.find((u) => u.id === id);
    if (!unit) return res.status(404).end();
    const pls = players.filter((p) => unit.playerNicks.find((n) => n.toLowerCase() === p.nick.toLowerCase()));
    res.json(pls);
  });
  app2.delete("/api/units/:id", (req, res) => {
    const id = decodeURIComponent(req.params.id || "");
    const idx = units.findIndex((u) => u.id === id);
    if (idx >= 0) {
      const unit = units[idx];
      for (const nick of unit.playerNicks) {
        const p = players.find((x) => x.nick.toLowerCase() === nick.toLowerCase());
        if (p) {
          p.unitId = null;
          p.status = PlayerStatus.OnDutyOutOfUnit;
          p.lastUpdate = (/* @__PURE__ */ new Date()).toISOString();
        }
      }
      units.splice(idx, 1);
      return res.status(204).end();
    }
    return res.status(404).end();
  });
  app2.post("/api/units/:id/players/add", (req, res) => {
    const id = decodeURIComponent(req.params.id || "");
    const body = req.body;
    if (!body?.playerNick) return res.status(400).end();
    const unit = units.find((u) => u.id === id);
    if (!unit) return res.status(404).end();
    const nick = body.playerNick;
    if (!unit.playerNicks.find((n) => n.toLowerCase() === nick.toLowerCase())) {
      unit.playerNicks.push(nick);
      unit.playerCount = unit.playerNicks.length;
    }
    const p = players.find((x) => x.nick.toLowerCase() === nick.toLowerCase());
    if (p) {
      p.unitId = unit.id;
      p.status = p.role === PlayerRole.Supervisor || p.role === PlayerRole.SuperSupervisor ? PlayerStatus.OnDutyLeadUnit : PlayerStatus.OnDuty;
      p.lastUpdate = (/* @__PURE__ */ new Date()).toISOString();
    }
    return res.status(204).end();
  });
  app2.post("/api/units/:id/players/remove", (req, res) => {
    const id = decodeURIComponent(req.params.id || "");
    const body = req.body;
    if (!body?.playerNick) return res.status(400).end();
    const unit = units.find((u) => u.id === id);
    if (!unit) return res.status(404).end();
    const nick = body.playerNick;
    unit.playerNicks = unit.playerNicks.filter((n) => n.toLowerCase() !== nick.toLowerCase());
    unit.playerCount = unit.playerNicks.length;
    const p = players.find((x) => x.nick.toLowerCase() === nick.toLowerCase());
    if (p) {
      p.unitId = null;
      p.status = PlayerStatus.OnDutyOutOfUnit;
      p.lastUpdate = (/* @__PURE__ */ new Date()).toISOString();
    }
    if (unit.playerNicks.length === 0) {
      const idx = units.findIndex((u) => u.id === id);
      if (idx >= 0) units.splice(idx, 1);
    }
    return res.status(204).end();
  });
  app2.put("/api/units/:id/status", (req, res) => {
    const id = decodeURIComponent(req.params.id || "");
    const body = req.body;
    const unit = units.find((u) => u.id === id);
    if (!unit) return res.status(404).end();
    unit.status = body.status ?? unit.status;
    return res.status(204).end();
  });
  app2.get("/api/units/available", (_req, res) => {
    const avail = units.filter((u) => !u.situationId);
    res.json(avail);
  });
  app2.get("/api/units/by-situation/:id", (req, res) => {
    const id = decodeURIComponent(req.params.id || "");
    const list = units.filter((u) => u.situationId === id);
    res.json(list);
  });
  const situations = [
    {
      id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
      type: "pursuit",
      metadata: { channel: "TAC-1", mode: "active" },
      units: [],
      greenUnitId: null,
      redUnitId: null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      isActive: true
    }
  ];
  const tacticalChannels = [
    { id: "1", name: "TAC-1", isBusy: false, situationId: null, notes: "" },
    { id: "2", name: "TAC-2", isBusy: false, situationId: null, notes: "" },
    { id: "3", name: "TAC-3", isBusy: false, situationId: null, notes: "" }
  ];
  const syncChannelsWithSituations = () => {
    console.log("[SYNC] Starting channel sync...");
    console.log("[SYNC] Active situations:", situations.filter((s) => s.isActive).map((s) => ({ id: s.id, channel: s.metadata?.channel })));
    tacticalChannels.forEach((channel) => {
      channel.isBusy = false;
      channel.situationId = null;
    });
    situations.forEach((situation) => {
      if (situation.isActive) {
        const channelName = situation.metadata?.channel;
        console.log(`[SYNC] Situation ${situation.id.substring(0, 8)}: channel="${channelName}"`);
        if (channelName && channelName !== "none") {
          const channel = tacticalChannels.find((c) => c.name === channelName);
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
    console.log("[SYNC] Channels after sync:", tacticalChannels.map((c) => ({ name: c.name, isBusy: c.isBusy })));
  };
  syncChannelsWithSituations();
  app2.get("/api/channels/all", (_req, res) => {
    syncChannelsWithSituations();
    res.json(tacticalChannels);
  });
  app2.put("/api/channels/:id/notes", (req, res) => {
    const { id } = req.params;
    const { notes } = req.body;
    const channel = tacticalChannels.find((c) => c.id === id);
    if (!channel) {
      return res.status(404).json({ error: "Channel not found" });
    }
    channel.notes = notes || "";
    console.log(`[CHANNEL NOTES] Updated notes for ${channel.name}: "${notes}"`);
    res.json(channel);
  });
  app2.get("/api/situations/all", (_req, res) => {
    syncChannelsWithSituations();
    res.json(situations);
  });
  app2.post("/api/situations/create", (req, res) => {
    const body = req.body;
    if (!body.type) return res.status(400).send("Type is required");
    const id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    const sit = {
      id,
      type: body.type,
      metadata: body.metadata ?? {},
      units: [],
      greenUnitId: null,
      redUnitId: null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      isActive: true
    };
    situations.push(sit);
    const channelName = (body.metadata?.channel ?? "").trim();
    console.log(`[CREATE SITUATION] Channel name from metadata: "${channelName}"`);
    if (channelName && channelName !== "none") {
      const channel = tacticalChannels.find((c) => c.name === channelName);
      console.log(`[CREATE SITUATION] Found channel:`, channel);
      if (channel) {
        channel.isBusy = true;
        channel.situationId = id;
        console.log(`[CREATE SITUATION] Marked channel ${channel.name} as busy for situation ${id}`);
      }
    }
    res.status(201).json(sit);
  });
  app2.post("/api/situations/:id/open", (req, res) => {
    const id = req.params.id;
    const s = situations.find((x) => x.id === id);
    if (!s) return res.status(404).end();
    s.isActive = true;
    const channelName = s.metadata?.channel;
    if (channelName && channelName !== "none") {
      const channel = tacticalChannels.find((c) => c.name === channelName);
      if (channel) {
        channel.isBusy = true;
        channel.situationId = id;
      }
    }
    return res.status(204).end();
  });
  app2.post("/api/situations/:id/close", (req, res) => {
    const id = req.params.id;
    const s = situations.find((x) => x.id === id);
    if (!s) return res.status(404).end();
    s.isActive = false;
    const channelName = s.metadata?.channel;
    if (channelName) {
      const channel = tacticalChannels.find((c) => c.name === channelName);
      if (channel && channel.situationId === id) {
        channel.isBusy = false;
        channel.situationId = null;
      }
    }
    s.units = [];
    s.greenUnitId = null;
    s.redUnitId = null;
    return res.status(204).end();
  });
  app2.put("/api/situations/:id/metadata", (req, res) => {
    const id = req.params.id;
    const body = req.body;
    const s = situations.find((x) => x.id === id);
    if (!s) return res.status(404).end();
    const oldChannelName = s.metadata?.channel;
    if (oldChannelName) {
      const oldChannel = tacticalChannels.find((c) => c.name === oldChannelName);
      if (oldChannel && oldChannel.situationId === id) {
        oldChannel.isBusy = false;
        oldChannel.situationId = null;
      }
    }
    s.metadata = { ...s.metadata, ...body.metadata ?? {} };
    const newChannelName = s.metadata?.channel;
    if (newChannelName && newChannelName !== "none") {
      const newChannel = tacticalChannels.find((c) => c.name === newChannelName);
      if (newChannel) {
        newChannel.isBusy = true;
        newChannel.situationId = id;
      }
    }
    return res.status(200).json(s);
  });
  app2.post("/api/situations/:id/units/add", (req, res) => {
    const id = req.params.id;
    const body = req.body;
    const s = situations.find((x) => x.id === id);
    if (!s) return res.status(404).end();
    if (!body.unitId) return res.status(400).end();
    if (!s.units.includes(body.unitId)) s.units.push(body.unitId);
    if (!s.greenUnitId) {
      s.greenUnitId = body.unitId;
    }
    if (body.asLeadUnit) {
      s.redUnitId = body.unitId;
    }
    const unit = units.find((u) => u.id === body.unitId);
    if (unit) {
      unit.situationId = id;
      unit.isLeadUnit = !!body.asLeadUnit;
    }
    return res.status(204).end();
  });
  app2.post("/api/situations/:id/units/remove", (req, res) => {
    const id = req.params.id;
    const body = req.body;
    const s = situations.find((x) => x.id === id);
    if (!s) return res.status(404).end();
    if (!body.unitId) return res.status(400).end();
    s.units = s.units.filter((u) => u !== body.unitId);
    if (s.greenUnitId === body.unitId) s.greenUnitId = null;
    if (s.redUnitId === body.unitId) s.redUnitId = null;
    const unit = units.find((u) => u.id === body.unitId);
    if (unit) {
      unit.situationId = null;
      unit.isLeadUnit = false;
    }
    return res.status(204).end();
  });
  app2.post("/api/situations/:id/lead-unit", (req, res) => {
    const id = req.params.id;
    const body = req.body;
    const s = situations.find((x) => x.id === id);
    if (!s) return res.status(404).end();
    if (!body.unitId) return res.status(400).end();
    if (!s.units.includes(body.unitId)) s.units.push(body.unitId);
    s.redUnitId = body.unitId;
    units.forEach((u) => {
      if (u.id === body.unitId) {
        u.situationId = id;
        u.isLeadUnit = true;
      } else if (u.situationId === id) {
        u.isLeadUnit = false;
      }
    });
    return res.status(204).end();
  });
  app2.delete("/api/situations/:id", (req, res) => {
    const id = req.params.id;
    const idx = situations.findIndex((x) => x.id === id);
    if (idx >= 0) {
      situations.splice(idx, 1);
      return res.status(204).end();
    }
    return res.status(404).end();
  });
  app2.post("/api/situations/panic", (req, res) => {
    req.body;
    return res.status(200).end();
  });
  app2.post("/api/players", (req, res) => {
    const body = req.body;
    const created = {
      nick: body.nick ?? "",
      x: body.x ?? -1e4,
      y: body.y ?? -1e4,
      role: body.role ?? PlayerRole.Officer,
      rank: body.rank ?? PlayerRank.PoliceOfficer,
      status: body.status ?? PlayerStatus.OnDutyOutOfUnit,
      lastUpdate: (/* @__PURE__ */ new Date()).toISOString()
    };
    const exists = players.find((p) => p.nick.toLowerCase() === created.nick.toLowerCase());
    if (!exists) {
      players.push(created);
    }
    res.status(201).json(created);
  });
  app2.get("/api/players/available-for-unit", (_req, res) => {
    const avail = players.filter((p) => !p.unitId);
    res.json(avail);
  });
  app2.put("/api/players/:nick/role", (req, res) => {
    const nick = decodeURIComponent(req.params.nick || "");
    const body = req.body;
    const p = players.find((pl) => pl.nick.toLowerCase() === nick.toLowerCase());
    if (p && body.role !== void 0) {
      p.role = body.role;
      p.lastUpdate = (/* @__PURE__ */ new Date()).toISOString();
      return res.status(204).end();
    }
    return res.status(404).end();
  });
  app2.put("/api/players/:nick/rank", (req, res) => {
    const nick = decodeURIComponent(req.params.nick || "");
    const body = req.body;
    const p = players.find((pl) => pl.nick.toLowerCase() === nick.toLowerCase());
    if (p && body.rank !== void 0) {
      p.rank = body.rank;
      p.lastUpdate = (/* @__PURE__ */ new Date()).toISOString();
      return res.status(204).end();
    }
    return res.status(404).end();
  });
  app2.put("/api/players/:nick/status", (req, res) => {
    const nick = decodeURIComponent(req.params.nick || "");
    const body = req.body;
    const p = players.find((pl) => pl.nick.toLowerCase() === nick.toLowerCase());
    if (p && body.status !== void 0) {
      p.status = body.status;
      p.lastUpdate = (/* @__PURE__ */ new Date()).toISOString();
      return res.status(204).end();
    }
    return res.status(404).end();
  });
  app2.delete("/api/players/:nick", (req, res) => {
    const nick = decodeURIComponent(req.params.nick || "");
    const idx = players.findIndex((pl) => pl.nick.toLowerCase() === nick.toLowerCase());
    if (idx >= 0) {
      players.splice(idx, 1);
      return res.status(204).end();
    }
    return res.status(404).end();
  });
  return app2;
}
const app = createServer();
const port = process.env.PORT || 3e3;
const __dirname = import.meta.dirname;
const distPath = path.join(__dirname, "../spa");
app.use(express.static(distPath));
app.get(/.*/, (req, res) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/health")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }
  res.sendFile(path.join(distPath, "index.html"));
});
app.listen(port, () => {
  console.log(`🚀 Fusion Starter server running on port ${port}`);
  console.log(`📱 Frontend: http://localhost:${port}`);
  console.log(`🔧 API: http://localhost:${port}/api`);
});
process.on("SIGTERM", () => {
  console.log("🛑 Received SIGTERM, shutting down gracefully");
  process.exit(0);
});
process.on("SIGINT", () => {
  console.log("🛑 Received SIGINT, shutting down gracefully");
  process.exit(0);
});
//# sourceMappingURL=node-build.mjs.map
