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

## 📦 Quick Start — One Command Install

### Prerequisites
- A **VPS** (Ubuntu/Debian, 1GB+ RAM)
- A **Telegram Bot Token** (from [@BotFather](https://t.me/BotFather))
- Your **Telegram User ID** (from [@userinfobot](https://t.me/userinfobot))

### Install (1 command!)

```bash
curl -fsSL https://raw.githubusercontent.com/7020227649/n8n-enterprise-stack/main/install.sh | sudo bash
```

This will:
1. ✅ Install Docker & Git (if not present)
2. ✅ Clone the repository to `/opt/n8n-enterprise-stack`
3. ✅ Ask for your **Bot Token** and **Admin ID**
4. ✅ Auto-generate secure database passwords
5. ✅ Deploy all 5 containers
6. ✅ Show your n8n login credentials

After install: **Open Telegram → send `/start` to your bot** 🎉

---

### Manual Install (Alternative)

```bash
git clone https://github.com/7020227649/n8n-enterprise-stack.git /opt/n8n-enterprise-stack
cd /opt/n8n-enterprise-stack
cp .env.example .env
nano .env                  # Fill in your values
docker compose up -d --build
```


---

## 🚚 Server Migration

Move your entire n8n stack (workflows, history, database) to a new server in minutes.

### 1. Export Data (Old Server)
```bash
cd /opt/n8n-enterprise-stack
sudo ./migrate.sh export
# Creates: n8n-migration-<date>.tar.gz
```

### 2. Import Data (New Server)
1. **Prepare the new server** (installs Docker, etc.):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/7020227649/n8n-enterprise-stack/main/install.sh | sudo bash
   ```
   *(You can skip the setup wizard if you plan to overwrite everything)*

2. **Transfer & Restore**:
   ```bash
   # Copy the migration file to the new server
   scp n8n-migration-Obs.tar.gz root@new-ip:/root/

   # Run import
   cd /opt/n8n-enterprise-stack
   sudo ./migrate.sh import /root/n8n-migration-Obs.tar.gz
   ```

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
| `/backup_all` | Full workflow-only backup (ZIP) |
| `/backup_workflow` | Backup single workflow |
| `/backup_system` | **Full System Backup** (App + DB + Config) |
| `/restore_workflow` | Restore workflows from backup file |
| `/restore_system` | **Full System Restore** from backup file(s) |
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
