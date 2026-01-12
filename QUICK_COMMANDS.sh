#!/bin/bash
# Быстрая инструкция для копирования на сервер и развертывания

# ============================================
# КОПИРОВАНИЕ НА СЕРВЕР
# ============================================
# На вашем локальном компьютере выполните:

# 1. Если проекта еще нет на сервере:
rsync -avz -e ssh /path/to/SampDispatchSite user@your-server-ip:/home/user/

# 2. Или если уже есть, обновить:
rsync -avz -e ssh --exclude=.git --exclude=data --exclude=letsencrypt /path/to/SampDispatchSite user@your-server-ip:/home/user/

# ============================================
# НА СЕРВЕРЕ - КОМАНДЫ ДЛЯ ЗАПУСКА
# ============================================
# Подключитесь по SSH:
# ssh user@your-server-ip

# Перейти в папку проекта
cd ~/SampDispatchSite

# ============================================
# ВАРИАНТ 1: Полная автоматизация (РЕКОМЕНДУЕТСЯ)
# ============================================
# Просто запустите один скрипт:
sudo bash deploy.sh dispatcher-tool.stigri.work your-email@example.com

# Скрипт автоматически:
# - Обновит систему
# - Установит Docker и Docker Compose
# - Создаст необходимые папки
# - Получит SSL сертификат
# - Запустит все сервисы
# - Проверит здоровье

# Дождитесь завершения (5-10 минут)

# ============================================
# ВАРИАНТ 2: Пошаговое развертывание
# ============================================

# Шаг 1: Подготовка окружения
cp .env.example .env
nano .env  # Отредактировать email и другие параметры

# Шаг 2: Подготовка DNS
# В панели управления хостингом добавьте A запись:
# dispatcher-tool.stigri.work  A  YOUR_SERVER_IP
# и дождитесь распространения (1-30 минут)

# Шаг 3: Инициализация SSL и запуск
chmod +x init-ssl.sh manage-docker.sh
./init-ssl.sh dispatcher-tool.stigri.work your-email@example.com

# ============================================
# ПОСЛЕ РАЗВЕРТЫВАНИЯ
# ============================================

# Проверить статус:
./manage-docker.sh status

# Просмотр логов:
./manage-docker.sh logs

# Остановить сервисы:
./manage-docker.sh down

# Запустить снова:
./manage-docker.sh up

# Перезапустить:
./manage-docker.sh restart

# Резервная копия:
./manage-docker.sh backup

# ============================================
# ПОЛЕЗНЫЕ КОМАНДЫ
# ============================================

# Просмотр логов конкретного сервиса
./manage-docker.sh logs backend
./manage-docker.sh logs frontend
./manage-docker.sh logs nginx
./manage-docker.sh logs certbot

# Выполнить команду в контейнере
docker-compose exec backend bash
docker-compose exec frontend sh

# Просмотр дискового использования
du -sh *

# Проверить сертификат
openssl x509 -in letsencrypt/live/dispatcher-tool.stigri.work/fullchain.pem -noout -dates

# ============================================
# ДЛЯ ОБНОВЛЕНИЯ КОДА
# ============================================

# Получить обновления из репозитория
git pull

# Пересобрать образы
./manage-docker.sh build

# Перезапустить сервисы с новыми образами
./manage-docker.sh down
./manage-docker.sh up

# ============================================
# РЕШЕНИЕ ПРОБЛЕМ
# ============================================

# Если SSL не получается:
# 1. Проверить DNS:
nslookup dispatcher-tool.stigri.work

# 2. Проверить логи:
./manage-docker.sh logs certbot
./manage-docker.sh logs nginx

# 3. Проверить открытые порты:
sudo netstat -tulpn | grep -E ':(80|443)'

# 4. Включить firewall доступ:
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Если сервисы не стартуют:
# 1. Посмотреть логи:
./manage-docker.sh logs

# 2. Пересобрать образы:
./manage-docker.sh build

# 3. Перезапустить Docker:
sudo systemctl restart docker
./manage-docker.sh down
./manage-docker.sh up

# ============================================
# МОНИТОРИНГ И ТЕХНИЧЕСКОЕ ОБСЛУЖИВАНИЕ
# ============================================

# Просмотр использования ресурсов
docker stats

# Очистить неиспользуемые образы
./manage-docker.sh clean

# Просмотр всех контейнеров
docker ps -a

# Просмотр всех образов
docker images

# Информация об одном контейнере
docker inspect sampdispatch-backend

# ============================================
# РЕЗЕРВНЫЕ КОПИИ И ВОССТАНОВЛЕНИЕ
# ============================================

# Создать резервную копию
./manage-docker.sh backup

# Список резервных копий
ls -lah backups/

# Восстановить из резервной копии
./manage-docker.sh down
tar -xzf backups/data_backup_*.tar.gz
tar -xzf backups/letsencrypt_backup_*.tar.gz
./manage-docker.sh up

# Загрузить резервную копию на локальный компьютер
# На локальном компьютере:
scp -r user@your-server-ip:~/SampDispatchSite/backups /path/to/local/backup

# ============================================
# ПРИМЕЧАНИЯ
# ============================================

# 1. Сайт доступен по адресу: https://dispatcher-tool.stigri.work
# 2. API: https://dispatcher-tool.stigri.work/api/
# 3. WebSocket: wss://dispatcher-tool.stigri.work/coordshub
# 
# 4. Логи сохраняются в JSON формате в каждом контейнере
# 5. Данные сохраняются в папке /data (создайте резервную копию!)
# 6. SSL сертификаты в /letsencrypt (ВАЖНО: не потеряйте!)
# 
# 7. Для восстановления после перезагрузки нужно:
#    ./manage-docker.sh up
# 
# 8. Сертификаты автоматически продлеваются за 30 дней до истечения
# 9. Проверить срок действия: ./manage-docker.sh status
# 10. Все конфигурации в .env файле

# ============================================
# КОНТАКТЫ
# ============================================
# При проблемах смотрите:
# - DEPLOYMENT.md - полная инструкция
# - QUICKSTART_UBUNTU.md - быстрый старт
# - DOCKER_SETUP.md - детальная документация
# - DOCKER_INSTALL.md - описание файлов
