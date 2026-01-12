#!/bin/bash

# Проверка готовности сервера к развертыванию
# Использование: bash check-server.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_ok() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warn() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

ERRORS=0
WARNINGS=0

# Проверка OS
print_header "1. Проверка операционной системы"
if grep -q "Ubuntu\|Debian" /etc/os-release; then
    OS=$(grep "^NAME=" /etc/os-release | cut -d'"' -f2)
    print_ok "ОС: $OS"
else
    print_warn "Не обнаружена Ubuntu/Debian. Скрипт протестирован на Ubuntu"
fi

# Проверка прав
print_header "2. Проверка прав администратора"
if [ "$EUID" -eq 0 ]; then
    print_ok "Запущено с правами root"
else
    print_warn "Не запущено с правами root. Потребуется sudo при развертывании"
fi

# Проверка CPU
print_header "3. Проверка CPU"
CPU_CORES=$(nproc)
print_ok "Ядер CPU: $CPU_CORES"
if [ "$CPU_CORES" -lt 2 ]; then
    print_warn "Рекомендуется минимум 2 ядра"
    WARNINGS=$((WARNINGS + 1))
fi

# Проверка памяти
print_header "4. Проверка памяти"
MEMORY_GB=$(($(grep MemTotal /proc/meminfo | awk '{print $2}') / 1024 / 1024))
print_ok "Памяти: ${MEMORY_GB} GB"
if [ "$MEMORY_GB" -lt 2 ]; then
    print_warn "Рекомендуется минимум 2 GB памяти"
    WARNINGS=$((WARNINGS + 1))
fi

# Проверка свободного места на диске
print_header "5. Проверка свободного места на диске"
FREE_SPACE=$(($(df / | awk 'NR==2 {print $4}') / 1024 / 1024))
print_ok "Свободно: ${FREE_SPACE} GB"
if [ "$FREE_SPACE" -lt 5 ]; then
    print_error "Не хватает свободного места! Требуется минимум 5 GB"
    ERRORS=$((ERRORS + 1))
fi

# Проверка Docker
print_header "6. Проверка Docker"
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    print_ok "Docker установлен: $DOCKER_VERSION"
else
    print_error "Docker не установлен"
    ERRORS=$((ERRORS + 1))
fi

# Проверка Docker Compose
print_header "7. Проверка Docker Compose"
if command -v docker-compose &> /dev/null; then
    COMPOSE_VERSION=$(docker-compose --version)
    print_ok "Docker Compose установлен: $COMPOSE_VERSION"
else
    print_error "Docker Compose не установлен"
    ERRORS=$((ERRORS + 1))
fi

# Проверка портов
print_header "8. Проверка открытых портов"

# Проверка порта 80
if netstat -tulpn 2>/dev/null | grep -q ":80 "; then
    print_warn "Порт 80 уже занят"
    WARNINGS=$((WARNINGS + 1))
else
    print_ok "Порт 80 свободен"
fi

# Проверка порта 443
if netstat -tulpn 2>/dev/null | grep -q ":443 "; then
    print_warn "Порт 443 уже занят"
    WARNINGS=$((WARNINGS + 1))
else
    print_ok "Порт 443 свободен"
fi

# Проверка firewall
print_header "9. Проверка firewall"
if command -v ufw &> /dev/null; then
    if ufw status | grep -q "active"; then
        print_warn "UFW firewall активен. Убедитесь что порты 80 и 443 открыты:"
        echo "  sudo ufw allow 80/tcp"
        echo "  sudo ufw allow 443/tcp"
        WARNINGS=$((WARNINGS + 1))
    else
        print_ok "UFW firewall неактивен"
    fi
else
    print_ok "UFW не установлен"
fi

# Проверка интернета
print_header "10. Проверка интернет соединения"
if ping -c 1 8.8.8.8 &> /dev/null; then
    print_ok "Интернет соединение: OK"
else
    print_error "Нет интернет соединения"
    ERRORS=$((ERRORS + 1))
fi

# Проверка DNS
print_header "11. Проверка DNS"
if command -v nslookup &> /dev/null; then
    if nslookup google.com &> /dev/null; then
        print_ok "DNS: OK"
    else
        print_error "DNS не работает"
        ERRORS=$((ERRORS + 1))
    fi
else
    print_warn "nslookup не установлен. Установите: apt-get install dnsutils"
    WARNINGS=$((WARNINGS + 1))
fi

# Проверка Git (опционально)
print_header "12. Проверка Git"
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version)
    print_ok "Git установлен: $GIT_VERSION"
else
    print_warn "Git не установлен (опционально)"
fi

# Проверка curl
print_header "13. Проверка curl"
if command -v curl &> /dev/null; then
    print_ok "curl установлен"
else
    print_error "curl не установлен"
    ERRORS=$((ERRORS + 1))
fi

# Проверка wget
print_header "14. Проверка wget"
if command -v wget &> /dev/null; then
    print_ok "wget установлен"
else
    print_warn "wget не установлен (опционально)"
fi

# Итоги
print_header "ИТОГИ"
echo ""
if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
    print_ok "Сервер полностью готов к развертыванию!"
    echo ""
    echo "Команда для развертывания:"
    echo "  sudo bash deploy.sh dispatcher-tool.stigri.work your-email@example.com"
    exit 0
elif [ "$ERRORS" -eq 0 ]; then
    print_warn "Сервер готов, но есть несколько рекомендаций"
    echo ""
    echo "Ошибок: $ERRORS"
    echo "Предупреждений: $WARNINGS"
    echo ""
    echo "Вы можете продолжить развертывание, но рекомендуется исправить предупреждения"
    echo ""
    echo "Команда для развертывания:"
    echo "  sudo bash deploy.sh dispatcher-tool.stigri.work your-email@example.com"
    exit 0
else
    print_error "Сервер не готов к развертыванию!"
    echo ""
    echo "Ошибок: $ERRORS"
    echo "Предупреждений: $WARNINGS"
    echo ""
    echo "Пожалуйста, исправьте ошибки выше перед развертыванием"
    exit 1
fi
