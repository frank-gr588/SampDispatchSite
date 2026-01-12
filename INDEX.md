# 📋 Полный индекс Docker документации для SampDispatch

## 🚀 БЫСТРЫЙ СТАРТ (Выберите ваш вариант)

### Вариант 1: Полная автоматизация (РЕКОМЕНДУЕТСЯ)
**Для нетерпеливых** - Все устанавливается одной командой:
```bash
sudo bash deploy.sh dispatcher-tool.stigri.work your-email@example.com
```
Время: **5-10 минут**
Файл: [deploy.sh](deploy.sh)

### Вариант 2: С проверкой сервера
**Для осторожных** - Сначала проверяем готовность:
```bash
bash check-server.sh  # Проверка сервера
sudo bash deploy.sh dispatcher-tool.stigri.work your-email@example.com
```
Файл: [check-server.sh](check-server.sh)

### Вариант 3: Пошаговое развертывание
**Для контролирующих** - Развертывание по шагам:
```bash
# 1. Читаем инструкцию
cat DEPLOYMENT.md

# 2. Готовим окружение
cp .env.example .env
nano .env

# 3. Запускаем SSL инициализацию
chmod +x init-ssl.sh
./init-ssl.sh dispatcher-tool.stigri.work your-email@example.com
```
Файл: [DEPLOYMENT.md](DEPLOYMENT.md)

---

## 📚 ПОЛНАЯ ДОКУМЕНТАЦИЯ

### 📖 Основные файлы

| Файл | Для кого | Уровень | Описание |
|------|----------|---------|---------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Всем | Начинающий | **НАЧНИТЕ ОТСЮДА!** Полная инструкция развертывания на Ubuntu |
| [QUICKSTART_UBUNTU.md](QUICKSTART_UBUNTU.md) | Ubuntu пользователей | Начинающий | Быстрый старт и справочник по командам |
| [DOCKER_SETUP.md](DOCKER_SETUP.md) | Опытные пользователи | Продвинутый | Детальная техническая документация Docker |
| [README_DOCKER.md](README_DOCKER.md) | Быстрое чтение | Краткое | Краткий обзор и ссылки |
| [DOCKER_INSTALL.md](DOCKER_INSTALL.md) | Для понимания структуры | Справочное | Описание всех файлов и компонентов |

### 🛠️ Скрипты

| Скрипт | ОС | Назначение | Статус |
|--------|----|-----------|----|
| [deploy.sh](deploy.sh) | Linux/Ubuntu | 🌟 Главный скрипт развертывания | Основной |
| [check-server.sh](check-server.sh) | Linux/Ubuntu | Проверка готовности сервера | Вспомогательный |
| [init-ssl.sh](init-ssl.sh) | Linux/Ubuntu | Инициализация SSL сертификата | Вспомогательный |
| [manage-docker.sh](manage-docker.sh) | Linux/Ubuntu | Управление сервисами | Ежедневный |
| [init-ssl.ps1](init-ssl.ps1) | Windows | Инициализация SSL на Windows | Вспомогательный |
| [manage-docker.ps1](manage-docker.ps1) | Windows | Управление Docker на Windows | Windows версия |
| [one-click-deploy.sh](one-click-deploy.sh) | Linux/Ubuntu | Упрощенное развертывание | Вспомогательный |

### 🏗️ Docker конфигурация

| Файл | Тип | Описание |
|------|-----|---------|
| [Dockerfile.backend](Dockerfile.backend) | Docker Image | Образ для ASP.NET Core backend (.NET 9.0) |
| [Dockerfile.frontend](Dockerfile.frontend) | Docker Image | Образ для React frontend (Node.js 20) |
| [docker-compose.yml](docker-compose.yml) | Composition | Основная конфигурация всех сервисов |
| [docker-compose.prod.yml](docker-compose.prod.yml) | Production | Production оптимизация (логирование, перезапуск) |
| [.env.example](.env.example) | Configuration | Пример переменных окружения |

### 🌐 Nginx конфигурация

| Файл | Назначение |
|------|-----------|
| [nginx/nginx.conf](nginx/nginx.conf) | Основная конфигурация Nginx, гzip, rate limiting |
| [nginx/conf.d/dispatcher.conf](nginx/conf.d/dispatcher.conf) | Конфиг для домена dispatcher-tool.stigri.work |

---

## 🎯 ЧТО ВЫБРАТЬ НОВИЧКУ?

### Вы на Ubuntu сервере и хотите быстро запустить?
👉 **Запустите это:**
```bash
sudo bash deploy.sh dispatcher-tool.stigri.work your-email@example.com
```

### Вы хотите понять, что происходит?
👉 **Прочитайте:**
1. [DEPLOYMENT.md](DEPLOYMENT.md) - полная инструкция
2. [QUICKSTART_UBUNTU.md](QUICKSTART_UBUNTU.md) - команды и примеры

### Вы опытный пользователь Docker?
👉 **Изучите:**
1. [docker-compose.yml](docker-compose.yml) - конфигурация сервисов
2. [DOCKER_SETUP.md](DOCKER_SETUP.md) - детальная документация
3. [nginx/conf.d/dispatcher.conf](nginx/conf.d/dispatcher.conf) - настройка reverse proxy

### Вы на Windows?
👉 **Используйте:**
1. [init-ssl.ps1](init-ssl.ps1) - для SSL инициализации
2. [manage-docker.ps1](manage-docker.ps1) - для управления сервисами

---

## 📊 АРХИТЕКТУРА СИСТЕМЫ

```
┌────────────────────────────────────────────┐
│  Internet - HTTPS                          │
│  dispatcher-tool.stigri.work:443           │
└────────────┬─────────────────────────────┘
             │
    ┌────────▼───────────┐
    │  Nginx Container   │
    │  + Let's Encrypt   │
    │  + SSL Cert        │
    └────────┬───────────┘
             │
    ┌────────┴──────────┐
    │                   │
┌───▼──────────┐   ┌────▼────────────┐
│  Frontend    │   │     Backend     │
│  React       │   │   .NET 9.0      │
│  Port 3000   │   │   Port 5000     │
├──────────────┤   ├─────────────────┤
│ Components   │   │ Controllers     │
│ Pages        │   │ Services        │
│ Hooks        │   │ SignalR Hub     │
└──────────────┘   └──────┬──────────┘
                          │
                   ┌──────▼──────┐
                   │  Services   │
                   │ - Players   │
                   │ - Units     │
                   │ - Situations│
                   │ - Channels  │
                   └─────────────┘
```

---

## 🔧 ОСНОВНЫЕ КОМАНДЫ

### После развертывания

```bash
# Проверить статус всех сервисов
./manage-docker.sh status

# Просмотр логов
./manage-docker.sh logs
./manage-docker.sh logs backend
./manage-docker.sh logs frontend
./manage-docker.sh logs nginx

# Перезапустить сервисы
./manage-docker.sh restart

# Остановить сервисы
./manage-docker.sh down

# Создать резервную копию
./manage-docker.sh backup

# Очистить неиспользуемые образы
./manage-docker.sh clean
```

---

## 💾 ФАЙЛЫ В СИСТЕМЕ

После развертывания будут созданы папки:

```
SampDispatchSite/
├── data/                    # Данные приложения (ВАЖНО: резервная копия!)
├── letsencrypt/             # SSL сертификаты (КРИТИЧЕСКИ ВАЖНО!)
│   └── live/
│       └── dispatcher-tool.stigri.work/
│           ├── fullchain.pem
│           └── privkey.pem
├── backups/                 # Резервные копии (автоматические)
└── nginx/certbot/           # Временные файлы для валидации
```

---

## 🔐 БЕЗОПАСНОСТЬ

✅ Все включено по умолчанию:
- HTTPS with Let's Encrypt
- Автоматическое продление сертификатов каждые 90 дней
- Rate limiting на nginx
- CORS настройки
- Security headers
- Gzip compression

---

## 📞 РЕШЕНИЕ ПРОБЛЕМ

### Где найти помощь?

| Проблема | Смотреть в |
|----------|-----------|
| SSL сертификат | [DEPLOYMENT.md](DEPLOYMENT.md#ssl-сертификат-не-получается) |
| Сервисы не стартуют | [QUICKSTART_UBUNTU.md](QUICKSTART_UBUNTU.md#frontend-не-подключается-к-backend) |
| Логи и мониторинг | [DOCKER_SETUP.md](DOCKER_SETUP.md#мониторинг) |
| WebSocket ошибки | [QUICKSTART_UBUNTU.md](QUICKSTART_UBUNTU.md#websocket-ошибки) |
| Обновление кода | [DEPLOYMENT.md](DEPLOYMENT.md#обновление-приложения) |
| Резервные копии | [DOCKER_SETUP.md](DOCKER_SETUP.md#резервная-копия) |

---

## 📋 ЧЕКЛИСТ РАЗВЕРТЫВАНИЯ

- [ ] Выбрал вариант развертывания (автоматизация/пошаговое)
- [ ] Прочитал [DEPLOYMENT.md](DEPLOYMENT.md) (если пошаговое)
- [ ] Подготовил Ubuntu сервер (или запустил check-server.sh)
- [ ] Настроил DNS запись для домена
- [ ] Дождался распространения DNS (1-30 минут)
- [ ] Запустил deploy.sh или init-ssl.sh
- [ ] Проверил статус: ./manage-docker.sh status
- [ ] Открыл сайт в браузере: https://dispatcher-tool.stigri.work
- [ ] Создал резервную копию: ./manage-docker.sh backup
- [ ] Добавил в расписание резервные копии (cron)

---

## 📚 ДОПОЛНИТЕЛЬНЫЕ РЕСУРСЫ

### Официальная документация

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Let's Encrypt](https://letsencrypt.org/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [ASP.NET Core Documentation](https://learn.microsoft.com/en-us/aspnet/core/)

### Полезные команды Linux

```bash
# Проверка портов
sudo netstat -tulpn | grep -E ':(80|443)'

# Проверка DNS
nslookup dispatcher-tool.stigri.work
dig dispatcher-tool.stigri.work

# Проверка системных ресурсов
free -h               # Память
df -h                 # Диск
top                   # Процессы
docker stats          # Docker контейнеры

# Просмотр логов
journalctl -n 50 -f   # Системные логи
tail -f /var/log/syslog
```

---

## 📝 ИНФОРМАЦИЯ О ПРОЕКТЕ

- **Название**: SampDispatch Site
- **Платформы**: 
  - Backend: ASP.NET Core 9.0
  - Frontend: React (TypeScript)
  - Сервер: Ubuntu/Linux с Docker
- **License**: CC-BY-NC-4.0
- **Автор**: Stephan Grigorchuk

---

## 🎓 РЕКОМЕНДУЕМЫЙ ПОРЯДОК ЧТЕНИЯ

### Для новичков:
1. 📖 [DEPLOYMENT.md](DEPLOYMENT.md) - полная инструкция
2. 🚀 [QUICKSTART_UBUNTU.md](QUICKSTART_UBUNTU.md) - команды
3. 🔧 [manage-docker.sh](manage-docker.sh) - практика

### Для опытных:
1. 🏗️ [docker-compose.yml](docker-compose.yml) - архитектура
2. 🌐 [nginx/conf.d/dispatcher.conf](nginx/conf.d/dispatcher.conf) - routing
3. 📊 [DOCKER_SETUP.md](DOCKER_SETUP.md) - детали

### Для администраторов:
1. 📋 [check-server.sh](check-server.sh) - подготовка сервера
2. 🔐 [DOCKER_SETUP.md](DOCKER_SETUP.md#безопасность) - безопасность
3. 💾 [DOCKER_SETUP.md](DOCKER_SETUP.md#управление-данными) - резервные копии

---

## ✨ КЛЮЧЕВЫЕ МОМЕНТЫ

1. **Главный скрипт**: [deploy.sh](deploy.sh) - используйте его!
2. **Проверка сервера**: [check-server.sh](check-server.sh) - перед развертыванием
3. **Управление**: [manage-docker.sh](manage-docker.sh) - ежедневное использование
4. **Логи**: `./manage-docker.sh logs` - для решения проблем

---

**🚀 Готовы начать? Выберите ваш вариант выше и начните!**
