#!/bin/bash

# ЭТОТ ФАЙЛ: Для копирования на сервер и одноразового запуска
# 
# Использование:
# 1. Скопируйте этот скрипт на сервер
# 2. Запустите: bash one-click-deploy.sh domain email
# 
# Пример:
#   bash one-click-deploy.sh dispatcher-tool.stigri.work admin@example.com

if [ $# -lt 2 ]; then
    echo "Использование: bash $0 <domain> <email>"
    echo ""
    echo "Пример:"
    echo "  bash $0 dispatcher-tool.stigri.work your-email@example.com"
    exit 1
fi

DOMAIN="$1"
EMAIL="$2"
PROJECT_DIR="SampDispatchSite"

echo "============================================"
echo "SampDispatch - One Click Deploy"
echo "============================================"
echo ""
echo "Домен: $DOMAIN"
echo "Email: $EMAIL"
echo "Папка проекта: $PROJECT_DIR"
echo ""

# Проверить наличие папки проекта
if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ Ошибка: папка $PROJECT_DIR не найдена"
    echo "Убедитесь, что вы находитесь в правильной директории"
    exit 1
fi

# Перейти в папку проекта
cd "$PROJECT_DIR" || exit 1

# Проверить наличие deploy.sh
if [ ! -f "deploy.sh" ]; then
    echo "❌ Ошибка: файл deploy.sh не найден в $PROJECT_DIR"
    exit 1
fi

# Запустить deploy.sh
echo "🚀 Запуск развертывания..."
echo ""

sudo bash deploy.sh "$DOMAIN" "$EMAIL"

if [ $? -eq 0 ]; then
    echo ""
    echo "============================================"
    echo "✅ РАЗВЕРТЫВАНИЕ УСПЕШНО!"
    echo "============================================"
    echo ""
    echo "Ваш сайт доступен по адресу:"
    echo "  🌐 https://$DOMAIN"
    echo ""
    echo "Полезные команды:"
    echo "  ./manage-docker.sh status   - Проверить статус"
    echo "  ./manage-docker.sh logs     - Просмотр логов"
    echo "  ./manage-docker.sh down     - Остановить сервисы"
    echo ""
else
    echo ""
    echo "============================================"
    echo "❌ РАЗВЕРТЫВАНИЕ НЕ УДАЛОСЬ"
    echo "============================================"
    echo ""
    echo "Пожалуйста проверьте логи выше для деталей"
    exit 1
fi
