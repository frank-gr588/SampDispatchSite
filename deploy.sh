#!/bin/bash

# Полная автоматизация развертывания SampDispatch на Ubuntu
# Использование: sudo bash deploy.sh [domain] [email]

set -e

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Параметры
DOMAIN="${1:-dispatcher-tool.stigri.work}"
EMAIL="${2:-admin@example.com}"

# Функции
print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Проверка прав
if [ "$EUID" -ne 0 ]; then 
    print_error "Этот скрипт требует прав root (sudo)"
    exit 1
fi

# Начало
print_header "Развертывание SampDispatch на Ubuntu"
echo -e "Домен: ${YELLOW}$DOMAIN${NC}"
echo -e "Email: ${YELLOW}$EMAIL${NC}"
echo ""

# Шаг 1: Обновление системы
print_header "Шаг 1: Обновление системы"
apt-get update -qq
apt-get upgrade -y -qq
print_success "Система обновлена"

# Шаг 2: Установка зависимостей
print_header "Шаг 2: Установка зависимостей"
apt-get install -y -qq curl wget git gnupg2 pass lsb-release ubuntu-keyring

# Шаг 3: Установка Docker
print_header "Шаг 3: Установка Docker"
if ! command -v docker &> /dev/null; then
    print_info "Docker не найден, устанавливаю..."
    
    # Добавить GPG ключ Docker
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null
    
    # Добавить репозиторий Docker
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
        $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Установить Docker
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    print_success "Docker установлен"
else
    print_success "Docker уже установлен"
fi

# Шаг 4: Установка Docker Compose
print_header "Шаг 4: Установка Docker Compose"
if ! command -v docker-compose &> /dev/null; then
    print_info "Docker Compose не найден, устанавливаю..."
    
    DOCKER_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep 'tag_name' | cut -d'"' -f4)
    curl -L "https://github.com/docker/compose/releases/download/$DOCKER_COMPOSE_VERSION/docker-compose-$(uname -s)-$(uname -m)" \
        -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    
    print_success "Docker Compose установлен"
else
    print_success "Docker Compose уже установлен"
fi

# Шаг 5: Добавить пользователя в группу docker
print_header "Шаг 5: Настройка Docker для текущего пользователя"
if [ -n "$SUDO_USER" ]; then
    usermod -aG docker "$SUDO_USER"
    print_success "Пользователь $SUDO_USER добавлен в группу docker"
fi

# Шаг 6: Проверка версий
print_header "Шаг 6: Проверка установленных версий"
echo -e "Docker: $(docker --version)"
echo -e "Docker Compose: $(docker-compose --version)"
print_success "Все компоненты установлены"

# Шаг 7: Создание необходимых папок
print_header "Шаг 7: Создание структуры директорий"
mkdir -p letsencrypt
mkdir -p nginx/certbot
mkdir -p data
mkdir -p backups
print_success "Директории созданы"

# Шаг 8: Подготовка окружения
print_header "Шаг 8: Подготовка файла конфигурации"
if [ ! -f .env ]; then
    cp .env.example .env
    sed -i "s/your-email@example.com/$EMAIL/g" .env
    print_success "Файл .env создан и настроен"
else
    print_info "Файл .env уже существует, пропускаю"
fi

# Шаг 9: Запуск Docker
print_header "Шаг 9: Запуск Docker daemon"
systemctl start docker
systemctl enable docker
print_success "Docker запущен и включен в автозагрузку"

# Шаг 10: Запуск Nginx для валидации
print_header "Шаг 10: Запуск Nginx для валидации SSL"
docker-compose up -d nginx
sleep 5
print_success "Nginx запущен"

# Шаг 11: Получение SSL сертификата
print_header "Шаг 11: Получение SSL сертификата от Let's Encrypt"
docker-compose run --rm certbot certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --non-interactive \
    -d "$DOMAIN" 2>&1 | grep -E '(Congratulations|Error|already exists|Invalid|Failed)' || true

# Проверка сертификата
if [ -f "letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    print_success "SSL сертификат успешно получен"
    chmod -R 755 letsencrypt
else
    print_error "Не удалось получить SSL сертификат"
    print_info "Проверьте:"
    print_info "  1. Правильность доменного имени: $DOMAIN"
    print_info "  2. DNS запись указывает на правильный IP"
    print_info "  3. Email адрес корректен: $EMAIL"
    print_info "  4. Открыты порты 80 и 443"
    exit 1
fi

# Шаг 12: Запуск всех сервисов
print_header "Шаг 12: Запуск всех сервисов"
docker-compose down 2>/dev/null || true
docker-compose up -d
sleep 5

# Шаг 13: Проверка статуса
print_header "Шаг 13: Проверка статуса сервисов"
echo ""
docker-compose ps
echo ""

# Проверка здоровья
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/health || echo "000")
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ || echo "000")
NGINX_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/ || echo "000")

echo -e "Backend: $([ "$BACKEND_STATUS" = "200" ] && echo -e "${GREEN}✓ OK ($BACKEND_STATUS)${NC}" || echo -e "${RED}✗ FAILED ($BACKEND_STATUS)${NC}")"
echo -e "Frontend: $([ "$FRONTEND_STATUS" = "200" ] && echo -e "${GREEN}✓ OK ($FRONTEND_STATUS)${NC}" || echo -e "${RED}✗ FAILED ($FRONTEND_STATUS)${NC}")"
echo -e "Nginx: $([ "$NGINX_STATUS" = "301" ] || [ "$NGINX_STATUS" = "200" ] && echo -e "${GREEN}✓ OK ($NGINX_STATUS)${NC}" || echo -e "${RED}✗ FAILED ($NGINX_STATUS)${NC}")"

# Завершение
echo ""
print_header "✓ РАЗВЕРТЫВАНИЕ ЗАВЕРШЕНО"
echo -e "Ваш сайт доступен по адресу: ${GREEN}https://$DOMAIN${NC}"
echo ""
echo "Полезные команды:"
echo "  ./manage-docker.sh status     - Проверить статус сервисов"
echo "  ./manage-docker.sh logs       - Просмотр логов"
echo "  ./manage-docker.sh logs backend - Логи конкретного сервиса"
echo "  ./manage-docker.sh down       - Остановить сервисы"
echo ""
echo -e "Документация: ${YELLOW}QUICKSTART_UBUNTU.md${NC}"
echo ""
