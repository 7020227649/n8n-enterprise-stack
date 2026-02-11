# 🚀 n8n Enterprise Control Platform

> Manage your entire n8n automation infrastructure through Telegram — no browser, no SSH needed.

![Node.js](https://img.shields.io/badge/Node.js-20-green)
![Docker](https://img.shields.io/badge/Docker-Compose-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)
![Commands](https://img.shields.io/badge/Commands-27-purple)

---

## ✨ Features

| Category | Commands | Description |
|---|---|---|
| 📋 **Workflow Control** | 6 | List, status, run, enable, disable, delete |
| 💾 **Backup System** | 5 | Full/single backup, daily auto-backup |
| ♻️ **Restore** | 4 | Upload, preview, confirm, restore history |
| 📊 **Analytics** | 5 | Stats, global summary, top workflows, failures |
| 🔔 **Smart Alerts** | 5 | Real-time failure alerts, per-workflow muting |
| 🏥 **Health Monitor** | 1 | Proactive n8n uptime monitoring |
| ⚙️ **System** | 1 | One-command n8n updates |

### Enterprise Features
- **Input Validation** — Never crashes on malformed API data
- **Paginated UI** — Handles 50+ workflows with ◀️ ▶️ navigation
- **Health Monitoring** — Pings n8n every 60s, auto-alerts on downtime
- **Unit Tests** — 46 tests across 5 suites

---

## 🏗️ Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────┐
│  Telegram    │◄───►│  Bot (Node)  │────►│  n8n API │
│  (You)       │     │  Port 3000   │     │  :5678   │
└─────────────┘     └──────┬───────┘     └────┬─────┘
                           │                   │
                      ┌────▼────┐         ┌────▼─────┐
                      │  State  │         │ Postgres │
                      │  (JSON) │         │  + Redis │
                      └─────────┘         └──────────┘
```

---

## 📦 Quick Start (5 minutes)

### Prerequisites
- A **VPS** (Ubuntu/Debian recommended, 1GB+ RAM)
- **Docker** & **Docker Compose** installed
- A **Telegram Bot Token** (from [@BotFather](https://t.me/BotFather))
- Your **Telegram User ID** (from [@userinfobot](https://t.me/userinfobot))

### Step 1: Clone

```bash
git clone https://github.com/YOUR_USERNAME/n8n-enterprise-stack-API.git
cd n8n-enterprise-stack-API
```

### Step 2: Configure

```bash
cp .env.example .env
nano .env
```

Fill in your values:

```env
BOT_TOKEN=123456:ABC-DEF...       # From @BotFather
ADMIN_ID=987654321                 # Your Telegram user ID
N8N_USER=admin                     # n8n login username
N8N_PASS=YourSecurePassword123     # n8n login password
POSTGRES_PASSWORD=AnotherPassword  # Database password
N8N_VERSION=latest                 # Or pin to e.g. 1.30.1
```

### Step 3: Deploy

```bash
docker compose up -d --build
```

### Step 4: Use

Open Telegram → find your bot → send `/start` 🎉

---

## 📱 All Commands

### Workflow Control
| Command | Description |
|---|---|
| `/workflows` | List all workflows with status |
| `/workflow_status` | Detailed status + last execution |
| `/run` | Trigger a workflow manually |
| `/enable` | Activate a workflow |
| `/disable` | Deactivate a workflow |
| `/delete` | Delete with confirmation |

### Backup & Restore
| Command | Description |
|---|---|
| `/backup_all` | Full backup (ZIP, auto-chunked) |
| `/backup_workflow` | Backup single workflow |
| `/daily_backup_on` | Enable daily auto-backup (3 AM) |
| `/daily_backup_off` | Disable daily auto-backup |
| `/daily_backup_status` | Check daily backup status |
| `/restore_workflow` | Upload & restore a backup file |
| `/restore_status` | View restore history |

### Analytics
| Command | Description |
|---|---|
| `/stats` | Single workflow statistics |
| `/stats_all` | Global execution summary |
| `/top` | Top workflows by run count |
| `/failures` | Recent failed executions |
| `/recent` | Last 10 executions |

### Alerts & Monitoring
| Command | Description |
|---|---|
| `/alerts_on` | Enable failure notifications |
| `/alerts_off` | Disable failure notifications |
| `/alerts_status` | Current alert configuration |
| `/mute` | Silence alerts for a workflow |
| `/unmute` | Re-enable alerts for a workflow |
| `/health` | Check n8n uptime & response time |

### System
| Command | Description |
|---|---|
| `/update_n8n` | Pull latest image & restart n8n |

---

## 🧪 Running Tests

```bash
# Inside the container
docker compose exec bot npx jest --verbose

# Or during development
cd bot && npm install && npm test
```

---

## 🔒 Security

- **Admin-only** — Only the `ADMIN_ID` user can interact with the bot
- **Rate-limited** — 30 requests/minute per user
- **Safe restores** — Never overwrites existing workflows
- **Delete confirmation** — Two-step confirmation for destructive actions
- **HTML escaping** — All user-facing output is sanitized

---

## 📁 Project Structure

```
n8n-enterprise-stack-API/
├── docker-compose.yml          # Full stack orchestration
├── .env.example                # Environment template
├── upgrade.sh                  # Manual upgrade script
└── bot/
    ├── Dockerfile              # Bot container (Node 20 + Docker CLI)
    ├── package.json            # Dependencies
    └── src/
        ├── app.js              # Entry point + startup validation
        ├── server.js           # Webhook server
        ├── config/index.js     # Centralized config
        ├── middleware/         # admin.js, rateLimit.js
        ├── commands/           # 7 command modules (27 commands)
        ├── services/           # 6 service modules
        ├── utils/              # format, state, validators, pagination
        └── __tests__/          # 5 test suites (46 tests)
```

---

## 🤝 Contributing

1. Fork this repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "Add feature"`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📄 License

MIT License — feel free to use this in your own projects.

---

## ⭐ Star this repo if it helped you!
