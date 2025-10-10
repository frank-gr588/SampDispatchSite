import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useState } from "react";

export function AuthPrototype() {
  const [username, setUsername] = useState("");
  const [accessCode, setAccessCode] = useState("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert("Авторизация будет добавлена позже. Этот экран — прототип.\n\nВведено:\nИмя пользователя: " + username + "\nКод доступа: " + (accessCode ? "••••" : "(пусто)"));
  };

  return (
    <Card className="overflow-hidden border border-border/40 bg-card/80 shadow-panel backdrop-blur">
      <CardHeader>
        <CardTitle>Авторизация</CardTitle>
        <CardDescription>Войдите в систему диспетчерской для управления операциями</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-5 max-w-md">
          <div className="grid gap-2">
            <Label htmlFor="username">Имя пользователя</Label>
            <Input id="username" placeholder="Введите имя" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="code">Код доступа</Label>
            <Input id="code" type="password" placeholder="Введите код" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit">Войти</Button>
            <span className="text-xs text-muted-foreground">Пока что демонстрационный экран</span>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
