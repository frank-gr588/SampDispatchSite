#!/bin/bash

# Docker Management Script для Ubuntu/Linux
# Использование: ./manage-docker.sh up|down|restart|build|logs|status|clean|backup

set -e

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функции
show_help() {
    echo -e "${YELLOW}Docker Management Script${NC}"
    echo ""
    echo -e "${YELLOW}Доступные команды:${NC}"
    echo -e "${GREEN}  ./manage-docker.sh up${NC}              - Запустить все сервисы"
    echo -e "${GREEN}  ./manage-docker.sh down${NC}            - Остановить все сервисы"
    echo -e "${GREEN}  ./manage-docker.sh restart${NC}         - Перезапустить сервисы"
    echo -e "${GREEN}  ./manage-docker.sh build${NC}           - Пересобрать образы"
    echo -e "${GREEN}  ./manage-docker.sh logs${NC}            - Просмотр логов всех сервисов"
    echo -e "${GREEN}  ./manage-docker.sh logs backend${NC}   - Логи конкретного сервиса"
    echo -e "${GREEN}  ./manage-docker.sh status${NC}          - Статус контейнеров"
    echo -e "${GREEN}  ./manage-docker.sh clean${NC}           - Удалить неиспользуемые образы"
    echo -e "${GREEN}  ./manage-docker.sh backup${NC}          - Создать резервную копию данных"
    echo ""
}

start_services() {
    echo -e "${YELLOW}Запуск сервисов...${NC}"
    docker-compose up -d
    sleep 2
    show_status
}

stop_services() {
    echo -e "${YELLOW}Остановка сервисов...${NC}"
    docker-compose down
    echo -e "${GREEN}✓ Сервисы остановлены${NC}"
}

restart_services() {
    echo -e "${YELLOW}Перезапуск сервисов...${NC}"
    docker-compose restart
    sleep 2
    show_status
}

build_images() {
    echo -e "${YELLOW}Пересборка образов...${NC}"
    docker-compose build --no-cache
    echo -e "${GREEN}✓ Образы пересобраны${NC}"
}

show_logs() {
    if [ -n "$1" ]; then
        echo -e "${YELLOW}Логи сервиса: $1${NC}"
        docker-compose logs -f "$1"
    else
        echo -e "${YELLOW}Логи всех сервисов${NC}"
        docker-compose logs -f
    fi
}

show_status() {
    echo ""
    echo -e "${YELLOW}Статус контейнеров:${NC}"
    echo ""
    docker-compose ps
    
    echo ""
    echo -e "${YELLOW}Проверка здоровья сервисов:${NC}"
    echo ""
    
    # Backend health
    if curl -sf http://localhost:5000/health > /dev/null 2>&1; then
        STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/health)
        echo -e "${GREEN}✓ Backend: здоров (HTTP $STATUS_CODE)${NC}"
    else
        echo -e "${RED}✗ Backend: недоступен${NC}"
    fi
    
    # Frontend health
    if curl -sf http://localhost:3000/ > /dev/null 2>&1; then
        STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/)
        echo -e "${GREEN}✓ Frontend: здоров (HTTP $STATUS_CODE)${NC}"
    else
        echo -e "${RED}✗ Frontend: недоступен${NC}"
    fi
    
    # Nginx health
    if curl -sf http://localhost:80/ > /dev/null 2>&1 || curl -sf http://localhost:443/ > /dev/null 2>&1; then
        STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:80/)
        echo -e "${GREEN}✓ Nginx: здоров (HTTP $STATUS_CODE)${NC}"
    else
        echo -e "${RED}✗ Nginx: недоступен${NC}"
    fi
    
    echo ""
}

cleanup() {
    echo -e "${YELLOW}Очистка неиспользуемых Docker образов и контейнеров...${NC}"
    docker system prune -f
    echo -e "${GREEN}✓ Очистка завершена${NC}"
}

create_backup() {
    BACKUP_DIR="backups"
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    
    mkdir -p "$BACKUP_DIR"
    
    echo -e "${YELLOW}Создание резервной копии...${NC}"
    
    # Backup data
    if [ -d "data" ]; then
        ARCHIVE_PATH="$BACKUP_DIR/data_backup_$TIMESTAMP.tar.gz"
        echo -e "${YELLOW}  - Резервная копия данных: $ARCHIVE_PATH${NC}"
        tar -czf "$ARCHIVE_PATH" data/
    fi
    
    # Backup certificates
    if [ -d "letsencrypt" ]; then
        ARCHIVE_PATH="$BACKUP_DIR/letsencrypt_backup_$TIMESTAMP.tar.gz"
        echo -e "${YELLOW}  - Резервная копия сертификатов: $ARCHIVE_PATH${NC}"
        tar -czf "$ARCHIVE_PATH" letsencrypt/
    fi
    
    echo -e "${GREEN}✓ Резервная копия создана в папке: $BACKUP_DIR${NC}"
}

# Main execution
case "$1" in
    up)
        start_services
        ;;
    down)
        stop_services
        ;;
    restart)
        restart_services
        ;;
    build)
        build_images
        ;;
    logs)
        show_logs "$2"
        ;;
    status)
        show_status
        ;;
    clean)
        cleanup
        ;;
    backup)
        create_backup
        ;;
    *)
        show_help
        ;;
esac
