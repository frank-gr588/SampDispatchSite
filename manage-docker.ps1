# Пример использования
# .\manage-docker.ps1 -Action up
# .\manage-docker.ps1 -Action logs -Service backend
# .\manage-docker.ps1 -Action status

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("up", "down", "restart", "build", "logs", "status", "clean", "backup")]
    [string]$Action,
    
    [string]$Service,
    [switch]$Detached = $true
)

$Green = "Green"
$Yellow = "Yellow"
$Red = "Red"

function Show-Help {
    Write-Host "Docker Management Script" -ForegroundColor $Yellow
    Write-Host ""
    Write-Host "Доступные команды:" -ForegroundColor $Yellow
    Write-Host "  .\manage-docker.ps1 -Action up              - Запустить все сервисы" -ForegroundColor $Green
    Write-Host "  .\manage-docker.ps1 -Action down            - Остановить все сервисы" -ForegroundColor $Green
    Write-Host "  .\manage-docker.ps1 -Action restart         - Перезапустить сервисы" -ForegroundColor $Green
    Write-Host "  .\manage-docker.ps1 -Action build           - Пересобрать образы" -ForegroundColor $Green
    Write-Host "  .\manage-docker.ps1 -Action logs            - Просмотр логов всех сервисов" -ForegroundColor $Green
    Write-Host "  .\manage-docker.ps1 -Action logs -Service backend - Логи конкретного сервиса" -ForegroundColor $Green
    Write-Host "  .\manage-docker.ps1 -Action status          - Статус контейнеров" -ForegroundColor $Green
    Write-Host "  .\manage-docker.ps1 -Action clean           - Удалить неиспользуемые образы" -ForegroundColor $Green
    Write-Host "  .\manage-docker.ps1 -Action backup          - Создать резервную копию данных" -ForegroundColor $Green
    Write-Host ""
}

function Start-Services {
    Write-Host "Запуск сервисов..." -ForegroundColor $Yellow
    if ($Detached) {
        docker-compose up -d
    } else {
        docker-compose up
    }
    Start-Sleep -Seconds 2
    Show-Status
}

function Stop-Services {
    Write-Host "Остановка сервисов..." -ForegroundColor $Yellow
    docker-compose down
    Write-Host "✓ Сервисы остановлены" -ForegroundColor $Green
}

function Restart-Services {
    Write-Host "Перезапуск сервисов..." -ForegroundColor $Yellow
    docker-compose restart
    Start-Sleep -Seconds 2
    Show-Status
}

function Build-Images {
    Write-Host "Пересборка образов..." -ForegroundColor $Yellow
    docker-compose build --no-cache
    Write-Host "✓ Образы пересобраны" -ForegroundColor $Green
}

function Show-Logs {
    if ($Service) {
        Write-Host "Логи сервиса: $Service" -ForegroundColor $Yellow
        docker-compose logs -f $Service
    } else {
        Write-Host "Логи всех сервисов" -ForegroundColor $Yellow
        docker-compose logs -f
    }
}

function Show-Status {
    Write-Host ""
    Write-Host "Статус контейнеров:" -ForegroundColor $Yellow
    Write-Host ""
    docker-compose ps
    
    Write-Host ""
    Write-Host "Проверка здоровья сервисов:" -ForegroundColor $Yellow
    
    # Backend health
    try {
        $backend = curl.exe -s http://localhost:5000/health -o /dev/null -w "%{http_code}"
        if ($backend -eq "200") {
            Write-Host "✓ Backend: здоров (HTTP $backend)" -ForegroundColor $Green
        } else {
            Write-Host "⚠ Backend: ошибка (HTTP $backend)" -ForegroundColor $Red
        }
    } catch {
        Write-Host "✗ Backend: недоступен" -ForegroundColor $Red
    }
    
    # Frontend health
    try {
        $frontend = curl.exe -s http://localhost:3000/ -o /dev/null -w "%{http_code}"
        if ($frontend -eq "200") {
            Write-Host "✓ Frontend: здоров (HTTP $frontend)" -ForegroundColor $Green
        } else {
            Write-Host "⚠ Frontend: ошибка (HTTP $frontend)" -ForegroundColor $Red
        }
    } catch {
        Write-Host "✗ Frontend: недоступен" -ForegroundColor $Red
    }
    
    # Nginx health
    try {
        $nginx = curl.exe -s http://localhost:80/ -o /dev/null -w "%{http_code}"
        if (($nginx -eq "301") -or ($nginx -eq "200")) {
            Write-Host "✓ Nginx: здоров (HTTP $nginx)" -ForegroundColor $Green
        } else {
            Write-Host "⚠ Nginx: ошибка (HTTP $nginx)" -ForegroundColor $Red
        }
    } catch {
        Write-Host "✗ Nginx: недоступен" -ForegroundColor $Red
    }
    
    Write-Host ""
}

function Cleanup {
    Write-Host "Очистка неиспользуемых Docker образов и контейнеров..." -ForegroundColor $Yellow
    docker system prune -f
    Write-Host "✓ Очистка завершена" -ForegroundColor $Green
}

function Create-Backup {
    $BackupDir = "backups"
    $Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    
    Write-Host "Создание резервной копии..." -ForegroundColor $Yellow
    
    # Backup data
    if (Test-Path "data") {
        $ArchivePath = "$BackupDir/data_backup_$Timestamp.zip"
        Write-Host "  - Резервная копия данных: $ArchivePath" -ForegroundColor $Yellow
        Compress-Archive -Path "data/*" -DestinationPath $ArchivePath -Force
    }
    
    # Backup certificates
    if (Test-Path "letsencrypt") {
        $ArchivePath = "$BackupDir/letsencrypt_backup_$Timestamp.zip"
        Write-Host "  - Резервная копия сертификатов: $ArchivePath" -ForegroundColor $Yellow
        Compress-Archive -Path "letsencrypt/*" -DestinationPath $ArchivePath -Force
    }
    
    Write-Host "✓ Резервная копия создана в папке: $BackupDir" -ForegroundColor $Green
}

# Main execution
switch ($Action) {
    "up" { Start-Services }
    "down" { Stop-Services }
    "restart" { Restart-Services }
    "build" { Build-Images }
    "logs" { Show-Logs }
    "status" { Show-Status }
    "clean" { Cleanup }
    "backup" { Create-Backup }
    default { Show-Help }
}
