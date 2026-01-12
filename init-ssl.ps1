# Docker setup для Windows (PowerShell)
# Инициализация SSL сертификата для dispatcher-tool.stigri.work

param(
    [string]$Domain = "dispatcher-tool.stigri.work",
    [string]$Email = "your-email@example.com"
)

# Цвета
$Green = "Green"
$Yellow = "Yellow"
$Red = "Red"

Write-Host "=== Let's Encrypt SSL Certificate Setup ===" -ForegroundColor $Yellow
Write-Host "Domain: $Domain" -ForegroundColor $Yellow
Write-Host "Email: $Email" -ForegroundColor $Yellow
Write-Host ""

# Проверить наличие Docker
try {
    docker --version | Out-Null
} catch {
    Write-Host "❌ Docker не установлен или не в PATH" -ForegroundColor $Red
    exit 1
}

# Проверить наличие Docker Compose
try {
    docker-compose --version | Out-Null
} catch {
    Write-Host "❌ Docker Compose не установлен или не в PATH" -ForegroundColor $Red
    exit 1
}

# Создать необходимые директории
Write-Host "Создание директорий..." -ForegroundColor $Yellow
New-Item -ItemType Directory -Path "letsencrypt" -Force | Out-Null
New-Item -ItemType Directory -Path "nginx/certbot" -Force | Out-Null
New-Item -ItemType Directory -Path "data" -Force | Out-Null

# Запустить Nginx для валидации сертификата
Write-Host "Запуск nginx для валидации сертификата..." -ForegroundColor $Yellow
docker-compose up -d nginx

# Ожидание запуска Nginx
Write-Host "Ожидание запуска nginx..." -ForegroundColor $Yellow
Start-Sleep -Seconds 5

# Получение SSL сертификата
Write-Host "Запрос SSL сертификата от Let's Encrypt..." -ForegroundColor $Yellow
docker-compose run --rm certbot certbot certonly `
    --webroot `
    --webroot-path=/var/www/certbot `
    --email $Email `
    --agree-tos `
    --non-interactive `
    -d $Domain

# Проверка успешного создания сертификата
if (Test-Path "letsencrypt/live/$Domain/fullchain.pem") {
    Write-Host "✓ SSL сертификат успешно создан!" -ForegroundColor $Green
    Write-Host "✓ Местоположение сертификата: letsencrypt/live/$Domain/" -ForegroundColor $Green
    
    # Перезапуск сервисов
    Write-Host "Перезапуск docker-compose сервисов..." -ForegroundColor $Yellow
    docker-compose down
    Start-Sleep -Seconds 2
    docker-compose up -d
    
    Write-Host ""
    Write-Host "✓ Все сервисы успешно запущены!" -ForegroundColor $Green
    Write-Host "✓ Ваш сайт теперь доступен по адресу: https://$Domain" -ForegroundColor $Green
    Write-Host ""
    Write-Host "Проверка статуса сервисов:" -ForegroundColor $Yellow
    docker-compose ps
} else {
    Write-Host "❌ Ошибка при создании SSL сертификата" -ForegroundColor $Red
    Write-Host "Пожалуйста, проверьте:" -ForegroundColor $Red
    Write-Host "  1. DNS запись для $Domain указывает на правильный IP" -ForegroundColor $Red
    Write-Host "  2. Порт 80 открыт и доступен" -ForegroundColor $Red
    Write-Host "  3. Email адрес корректен" -ForegroundColor $Red
    Write-Host ""
    Write-Host "Логи Certbot:" -ForegroundColor $Yellow
    docker-compose logs certbot
    
    docker-compose down
    exit 1
}

Write-Host ""
Write-Host "=== Setup завершен ===" -ForegroundColor $Yellow
