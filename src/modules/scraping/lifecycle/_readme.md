# Scraping Lifecycle

## Flow

```
External caller (Telegram bot, API, etc.)
  └─> RequestScraperStartUseCase   – validates current status, writes requestedStatus=RUNNING to DB
  └─> RequestScraperStopUseCase    – validates current status, writes requestedStatus=STOPPED to DB

DB trigger fires NOTIFY on requestedStatus change
  └─> ScraperCommandListener       – LISTENs on postgres channel, reacts to new requestedStatus
        ├─> StartScraperUseCase    – loads enabled scrapers from config, starts orchestrator, updates actualStatus=RUNNING
        └─> StopScraperUseCase     – requests orchestrator graceful stop (waits for it to finish)

ScraperOrchestrator (internal loop)
  └─> HandleScraperStopUseCase     – called when loop ends for any reason, updates actualStatus:
        ├─> GRACEFUL        → STOPPED
        ├─> QUEUE_EXHAUSTED → STOPPED
        └─> ERROR           → ERROR

ScraperHeartbeat                   – writes lastHeartbeatAt to DB every 10s while process is alive
                                     getStatus() returns PROCESS_DOWN if heartbeat is stale (>30s)
```

## Key distinction

- `RequestScraper*` — external-facing, only touches `requestedStatus`
- `Start/StopScraper*` — internal, driven by the listener, manage actual execution and `actualStatus`
