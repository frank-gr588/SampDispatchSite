import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlayerRank } from "@shared/api";

interface MarkingSelectorProps {
  value: string;
  onChange: (value: string) => void;
  playerRank?: PlayerRank;
  existingMarkings?: string[];
}

const BUREAUS = [
  { value: "1", label: "1 - Кадровое" },
  { value: "2", label: "2 - Административное" },
  { value: "3", label: "3 - Патруль (полевые операции)" },
  { value: "4", label: "4 - Спецоперации (K9, SWAT, Tactical)" },
  { value: "5", label: "5 - Следственное" },
  { value: "6", label: "6 - Аэропортовое" },
  { value: "7", label: "7 - Транспортное" },
];

const STATIONS = [
  { value: "A", label: "A - Central" },
  { value: "B", label: "B - Garver" },
  { value: "C", label: "C - Calton Heights" },
  { value: "D", label: "D - Garcia" },
  { value: "E", label: "E - Gant" },
  { value: "F", label: "F - Department of Traffic" },
];

const UNIT_TYPES = [
  { value: "single", label: "0-9: Одиночный патруль", range: [0, 9] },
  { value: "paired", label: "10-19: Парный патруль", range: [10, 19] },
  { value: "captain", label: "20-29: Капитанский экипаж", range: [20, 29] },
  { value: "wagon", label: "30-32: Транспортный (Wagon)", range: [30, 32] },
  { value: "undercover", label: "35-39: Undercover/Plainclothes", range: [35, 39] },
  { value: "foot", label: "40-59: Пеший/велопатруль", range: [40, 59] },
  { value: "traffic", label: "60-65: Дорожный патруль", range: [60, 65] },
  { value: "park", label: "66-68: Парковый", range: [66, 68] },
  { value: "housing", label: "70-75: Housing/Homeless", range: [70, 75] },
  { value: "special", label: "80-89: Специальный (K9, конный, мото)", range: [80, 89] },
  { value: "tactical", label: "90-99: Спецразвёртывание (SWAT, Tactical)", range: [90, 99] },
];

const SHIFTS = [
  { value: "", label: "Без смены (спецподразделения)" },
  { value: "A", label: "A - Дневная смена" },
  { value: "B", label: "B - Смешанная смена" },
  { value: "C", label: "C - Вечерняя смена" },
  { value: "F", label: "F - FRANK (временно без напарника)" },
  { value: "S", label: "S - SAM (отделился от напарника)" },
];

const RANK_PREFIXES: Record<PlayerRank, string> = {
  [PlayerRank.PoliceOfficer]: "", // 0-99
  [PlayerRank.PoliceInspector]: "", // 0-99
  [PlayerRank.PoliceSergeant]: "1", // 1XX
  [PlayerRank.PoliceLieutenant]: "2", // 2XX
  [PlayerRank.PoliceCaptain]: "3", // 3XX
  [PlayerRank.PoliceCommander]: "4", // 4XX
  [PlayerRank.AssistantChiefOfPolice]: "5", // 5XX
  [PlayerRank.DeputyChiefOfPolice]: "6", // 6XX
  [PlayerRank.ChiefOfPolice]: "7", // 7XX
};

export function MarkingSelector({ value, onChange, playerRank, existingMarkings = [] }: MarkingSelectorProps) {
  const [useWizard, setUseWizard] = useState(false); // Изменено на false по умолчанию для упрощения
  const [bureau, setBureau] = useState("3");
  const [station, setStation] = useState("A");
  const [unitType, setUnitType] = useState("paired");
  const [unitNumber, setUnitNumber] = useState("10");
  const [shift, setShift] = useState("A");
  const [manualValue, setManualValue] = useState(value);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Генерация маркировки из компонентов
  useEffect(() => {
    if (!useWizard) return;

    let number = unitNumber;
    
    // Добавляем префикс ранга если нужно
    if (playerRank !== undefined && playerRank !== PlayerRank.PoliceOfficer && playerRank !== PlayerRank.PoliceInspector) {
      const prefix = RANK_PREFIXES[playerRank];
      if (prefix && !number.startsWith(prefix)) {
        number = prefix + number.padStart(2, "0");
      }
    }

    const marking = `${bureau}${station} ${number}${shift}`.trim();
    onChange(marking);
    validateMarking(marking);
  }, [bureau, station, unitNumber, shift, playerRank, useWizard]);

  useEffect(() => {
    if (useWizard) {
      setManualValue(value);
    }
  }, [value, useWizard]);

  const validateMarking = (marking: string) => {
    const warnings: string[] = [];

    // Проверка длины
    if (marking.length > 8) {
      warnings.push("⚠️ Маркировка длиннее 8 символов");
    }

    // Проверка дубликатов
    if (existingMarkings.includes(marking)) {
      warnings.push("⚠️ Эта маркировка уже используется!");
    }

    // Проверка соответствия ранга и номера
    if (playerRank !== undefined) {
      const numberPart = marking.match(/\d+/)?.[0] || "";
      const rankPrefix = RANK_PREFIXES[playerRank];
      
      if (rankPrefix && !numberPart.startsWith(rankPrefix)) {
        warnings.push(`⚠️ Ранг ${getRankName(playerRank)} должен использовать номера ${rankPrefix}XX`);
      }

      // Высокие ранги не должны использовать диапазон 0-99
      if (playerRank >= PlayerRank.PoliceSergeant) {
        const num = parseInt(numberPart);
        if (num < 100) {
          warnings.push(`⚠️ ${getRankName(playerRank)} не должен использовать диапазон 0-99`);
        }
      }

      // Мэр/Chief не может быть патрульным
      if (playerRank === PlayerRank.ChiefOfPolice && bureau === "3") {
        warnings.push("⚠️ Chief of Police не должен быть в патрульном бюро");
      }
    }

    setWarnings(warnings);
  };

  const getRankName = (rank: PlayerRank): string => {
    const names: Record<PlayerRank, string> = {
      [PlayerRank.ChiefOfPolice]: "Chief",
      [PlayerRank.DeputyChiefOfPolice]: "Deputy Chief",
      [PlayerRank.AssistantChiefOfPolice]: "Assistant Chief",
      [PlayerRank.PoliceCommander]: "Commander",
      [PlayerRank.PoliceCaptain]: "Captain",
      [PlayerRank.PoliceLieutenant]: "Lieutenant",
      [PlayerRank.PoliceSergeant]: "Sergeant",
      [PlayerRank.PoliceInspector]: "Inspector",
      [PlayerRank.PoliceOfficer]: "Officer",
    };
    return names[rank] || "Unknown";
  };

  const handleManualChange = (newValue: string) => {
    setManualValue(newValue);
    onChange(newValue);
    validateMarking(newValue);
  };

  const getUnitTypeRange = () => {
    const type = UNIT_TYPES.find(t => t.value === unitType);
    return type?.range || [0, 99];
  };

  const generateNumberOptions = () => {
    const [min, max] = getUnitTypeRange();
    const options: JSX.Element[] = [];
    
    // Ограничиваем количество опций для производительности
    const limit = Math.min(max - min + 1, 100);
    
    for (let i = min; i < min + limit && i <= max; i++) {
      options.push(
        <SelectItem key={i} value={i.toString()}>
          {i}
        </SelectItem>
      );
    }
    
    return options;
  };

  return (
    <div className="space-y-4">
      {/* Переключатель режима */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={useWizard ? "default" : "outline"}
          size="sm"
          onClick={() => setUseWizard(true)}
        >
          Визард
        </Button>
        <Button
          type="button"
          variant={!useWizard ? "default" : "outline"}
          size="sm"
          onClick={() => setUseWizard(false)}
        >
          Ручной ввод
        </Button>
      </div>

      {useWizard ? (
        <>
          {/* Визард выбора */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Бюро</Label>
              <Select value={bureau} onValueChange={setBureau}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUREAUS.map(b => (
                    <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Станция</Label>
              <Select value={station} onValueChange={setStation}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATIONS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <Label>Тип экипажа</Label>
              <Select value={unitType} onValueChange={(v) => {
                setUnitType(v);
                const type = UNIT_TYPES.find(t => t.value === v);
                if (type) setUnitNumber(type.range[0].toString());
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Номер</Label>
              <Input
                type="number"
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                min={getUnitTypeRange()[0]}
                max={getUnitTypeRange()[1]}
                placeholder={`${getUnitTypeRange()[0]}-${getUnitTypeRange()[1]}`}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Диапазон: {getUnitTypeRange()[0]}-{getUnitTypeRange()[1]}
              </p>
            </div>

            <div>
              <Label>Смена</Label>
              <Select value={shift} onValueChange={setShift}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHIFTS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Превью */}
          <div className="p-3 bg-muted rounded-md">
            <Label className="text-xs text-muted-foreground">Результат:</Label>
            <div className="text-2xl font-mono font-bold mt-1">{value || "—"}</div>
          </div>
        </>
      ) : (
        <>
          {/* Ручной ввод */}
          <div>
            <Label>Маркировка (макс. 8 символов)</Label>
            <Input
              value={manualValue}
              onChange={(e) => handleManualChange(e.target.value)}
              placeholder="Например: 3B 101A"
              maxLength={8}
              className="font-mono text-lg"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Формат: &lt;БЮРО&gt;&lt;СТАНЦИЯ&gt; &lt;НОМЕР&gt;&lt;СМЕНА&gt;
            </p>
          </div>
        </>
      )}

      {/* Предупреждения */}
      {warnings.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <ul className="space-y-1">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {warnings.length === 0 && value && (
        <Alert className="border-green-500/50 bg-green-500/10">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <AlertDescription className="text-green-700 dark:text-green-300">
            ✓ Маркировка корректна
          </AlertDescription>
        </Alert>
      )}

      {/* Информация о системе - компактно */}
      {useWizard && (
        <div className="text-xs text-muted-foreground border-l-2 border-muted pl-2">
          <strong>Подсказка:</strong> Ранги Sergeant+ используют диапазон 1XX-7XX. Парные патрули: 10-19. Спецподразделения: 80-99.
        </div>
      )}
    </div>
  );
}
