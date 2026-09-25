# Unibot Integration — RobotSpace MVP

**Added:** 2026-07-27  
**Status:** Implemented (not in original plan)

## Overview

Unibot.ru (https://unibot.ru) — российский каталог роботов. Данные используются как **вспомогательный источник** (не первичный) для:
- Изображений брендов (логотипы производителей)
- Перекрёстной проверки имён роботов и брендов агентом
- Категорий роботов (рус→англ маппинг: «Роботы-собаки» → Robot Dogs)
- Маппинга стран (рус→ISO: «Китай» → CN, «США» → US)

## Database

### `unibot_import_config`
Настройки синхронизации:
- `feed_url` — эндпоинт JSON-фида (по умолчанию `https://unibot.ru/local/gadgets/maslov/catalog_export/catalog.php`)
- `cron_expression` — периодичность автосинхронизации (по умолчанию каждые 6 часов)
- `is_enabled` — вкл/выкл
- `last_sync_at`, `last_sync_status`, `last_error` — статус последней синхронизации

### `unibot_catalog_cache` (586 записей: 488 роботов + 98 брендов)
Кэш импортированных данных:
- `entity_type` — `robot` или `brand`
- `name` — русское название
- `code` — slug (на латинице)
- `section_name` — категория на русском
- `brand_name` — бренд (для роботов)
- `country_ru` / `country_code` — страна бренда (автомаппинг)
- `picture_url` — URL изображения
- `matched_robot_id` / `matched_company_id` — связь с основными таблицами (для будущего AI-матчинга)

### `company_public_projections.image_url`
Добавлено поле (ALTER TABLE) для хранения URL логотипа бренда.

## Admin UI

**Страница:** `/admin/unibot` (🔗 в sidebar)

- Настройка Feed URL, cron-выражения, enabled/disabled
- Кнопка **Sync Now** — ручной запуск синхронизации каталога
- KPI: Total Cached / Robots / Brands
- Статус последней синхронизации

## API Endpoints

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/api/admin/unibot/config` | Получить конфиг + количество записей |
| `POST` | `/api/admin/unibot/config` | Обновить конфиг |
| `POST` | `/api/admin/unibot/sync` | Запустить синхронизацию каталога (fetch JSON → upsert в cache) |
| `POST` | `/api/admin/unibot/sync-images` | Синхронизация изображений (см. ниже) |

## Image Sync Logic

### Правила
1. **Роботы:** Только ПРЯМОЕ совпадение имени. Изображение бренда НЕ присваивается роботу.
2. **Валидация:** Бренд робота должен совпадать с брендом в Unibot. Если робот KUKA, а Unibot-совпадение «Подводный дрон Geneinno Titan» — пропускается (слово «Titan» совпало, но бренды разные).
3. **Бренды:** Строгий поиск (exact → substring match). URL изображения сохраняется напрямую (без скачивания — hotlink с CDN Unibot).
4. **Fallback при отображении:** Если у робота нет `image_url`, компонент `RobotImage` проверяет `fallbackUrl` (image_url бренда-производителя).

### Country Mapping (рус→ISO)
```
Китай→CN, США→US, Германия→DE, Япония→JP, Корея/KR→KR,
Швейцария→CH, Дания→DK, Франция→FR, Великобритания→GB,
Италия→IT, Швеция→SE, Нидерланды→NL, Канада→CA, ...
```

## AI Agent Prompt Updates

### `ambiguousEntityResolver` (entity_resolution)
Добавлена инструкция:
- Использовать `unibot_catalog_cache` как вспомогательный источник
- Fuzzy matching имён с учётом транслитерации
- Кросс-референс BRAND_NAME ↔ manufacturer
- Маппинг SECTION_NAME → категории
- COUNTRY: рус→ISO конвертация
- **Не использовать Unibot как единственный источник**

### `duplicateResolver` (duplicate_resolution)
Добавлена инструкция:
- Учитывать разную транслитерацию (рус/англ) при сравнении имён
- Матчить по смыслу, а не по точному совпадению строк

## Files Created

| File | Purpose |
|---|---|
| `apps/web/src/app/admin/unibot/page.tsx` | Admin UI |
| `apps/web/src/app/api/admin/unibot/config/route.ts` | Config CRUD |
| `apps/web/src/app/api/admin/unibot/sync/route.ts` | Catalog sync |
| `apps/web/src/app/api/admin/unibot/sync-images/route.ts` | Image sync |
| `apps/web/src/app/integrators/world-map.tsx` | SVG world map (unrelated, but created same session) |
| `apps/web/src/app/integrators/world-map-data.ts` | Map country paths & centroids |
| `packages/db/schema.prisma` | Added `unibot_import_config` + `unibot_catalog_cache` models |

## Known Issues

- Изображения с unibot.ru не грузятся через `<img>` из-за hotlink-защиты. Нужен прокси-эндпоинт для кэширования.
- FANUC и Universal Robots отсутствуют в каталоге Unibot.
- Cron-агент для автосинхронизации не реализован (только ручной запуск).
