# 🚀 n8n Enterprise Control Platform

> Manage your entire n8n automation infrastructure through Telegram — no browser, no SSH needed.

![Node.js](https://img.shields.io/badge/Node.js-20-green)
![Docker](https://img.shields.io/badge/Docker-Compose-blue)
![License](https://img.shields.io/badge/License-Proprietary-red)
![Commands](https://img.shields.io/badge/Commands-55-purple)

---

## ✨ Features

| Category | Commands | Description |
|---|---|---|
| 📋 **Workflow Control** | 6 | List, status, run, enable, disable, delete |
| 🔧 **Workflow Tools** | 8 | Search, clone, export, import, nodes, schedule, stop, credentials |
| 🔄 **Operations** | 8 | Active/inactive filter, bulk enable/disable, rename, webhook URLs, retry, execution details |
| 💾 **Backup & Restore** | 9 | Full/single/system backup, daily auto-backup, workflow & system restore |
| 📊 **Analytics & Dashboard** | 8 | Stats, summary, top workflows, failures, recent executions, version |
| 🔔 **Alerts & Monitoring** | 6 | Real-time failure alerts, per-workflow muting, health checks |
| 🔐 **Auth** | 2 | API key management, auth status |
| ⚙️ **System** | 6 | Logs, disk, CPU/RAM, restart, update n8n, help |

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
sudo apt update && sudo apt install -y curl && curl -fsSL https://raw.githubusercontent.com/7020227649/n8n-enterprise-stack/main/install.sh | sudo bash
```

This will:
1. ✅ Install Docker & Git (if not present)
2. ✅ Clone the repository to `/opt/n8n-enterprise-stack`
3. ✅ Ask for your **Bot Token** and **Admin ID**
4. ✅ Auto-generate secure database passwords
5. ✅ Deploy all 5 containers
6. ✅ Auto-create n8n owner account
7. ✅ Show your n8n login credentials

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

### 🔑 API Key Configuration (Terminal)

If you cannot use the Telegram bot to set the API key, you can do it manually via the terminal.

**Method 1: Using the Helper Script**
```bash
cd /opt/n8n-enterprise-stack && ./set-key.sh "YOUR_API_KEY_HERE"
```

**Method 2: Manual .env Edit**
1. Open the `.env` file:
   ```bash
   nano .env
   ```
2. Find or add `N8N_API_KEY`:
   ```bash
   N8N_API_KEY=your_api_key_here
   ```
3. Save and restart:
   ```bash
   docker compose restart bot
   ```

---

### 🔄 Updating the Bot

After pulling new changes or making updates, redeploy the bot:

```bash
cd /opt/n8n-enterprise-stack
git pull origin main
docker compose up -d --build bot
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
   sudo apt update && sudo apt install -y curl && curl -fsSL https://raw.githubusercontent.com/7020227649/n8n-enterprise-stack/main/install.sh | sudo bash
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

## 📱 All Commands (53 Total)

### 🔐 Auth
| Command | Description |
|---|---|
| `/start` | Start the bot and show welcome message |
| `/setkey` | **Set n8n API key** (Encrypted & Secure) |
| `/auth_status` | Check current API key configuration |

> **Note:** You can generate an API Key in n8n under **Settings > Developer**. Send it to the bot using `/setkey <key>` to enable full functionality. The key is encrypted before storage.

### 📋 Workflow Control
| Command | Description |
|---|---|
| `/workflows` | List all workflows with status |
| `/workflow_status` | Detailed status + last execution |
| `/run` | Trigger a workflow manually |
| `/enable` | Activate a workflow |
| `/disable` | Deactivate a workflow |
| `/delete` | Delete with confirmation |

### 🔧 Workflow Tools
| Command | Description |
|---|---|
| `/search <name>` | Search workflows by name |
| `/clone` | Duplicate a workflow |
| `/rename` | Rename a workflow |
| `/export` | Download workflow as JSON |
| `/import` | Upload .json or .zip to import workflows |
| `/nodes` | View workflow node details |
| `/schedule` | Show scheduled/cron workflows |
| `/webhook_url` | Show webhook trigger URLs |
| `/stop` | Stop a running execution |
| `/credentials` | List credential names |

### 🔄 Operations
| Command | Description |
|---|---|
| `/active` | List active workflows only |
| `/inactive` | List inactive workflows only |
| `/enable_all` | Bulk enable all workflows |
| `/disable_all` | Bulk disable all workflows |
| `/retry` | Retry a failed execution |
| `/execution` | View execution details + errors |

### 💾 Backup
| Command | Description |
|---|---|
| `/backup_all` | Full backup of all workflows (ZIP) |
| `/backup_workflow` | Backup a single workflow |
| `/backup_credentials` | **Export all credentials** (Decrypted JSON) |
| `/backup_system` | Full system backup (App + DB + Config) |
| `/daily_backup_on` | Enable daily auto-backup (3 AM) |
| `/daily_backup_off` | Disable daily auto-backup |
| `/daily_backup_status` | Check daily backup status |

### ♻️ Restore
| Command | Description |
|---|---|
| `/restore_workflow` | Upload & restore a workflow backup file |
| `/restore_credentials` | Upload & restore a **credentials** backup file |
| `/restore_system` | Full system restore from backup file(s) |
| `/restore_status` | View restore history |

### 📊 Analytics & Dashboard
| Command | Description |
|---|---|
| `/summary` | Full dashboard overview |
| `/stats` | Single workflow statistics |
| `/stats_all` | Global execution summary |
| `/top` | Top workflows by run count |
| `/failures` | Recent failed executions |
| `/recent` | Last 10 executions |
| `/version` | n8n + bot version info |

### 🔔 Alerts & Monitoring
| Command | Description |
|---|---|
| `/alerts_on` | Enable failure notifications |
| `/alerts_off` | Disable failure notifications |
| `/alerts_status` | View alert configuration |
| `/mute` | Silence alerts for a workflow |
| `/unmute` | Re-enable alerts for a workflow |
| `/health` | n8n health check + uptime + response time |

### ⚙️ System
| Command | Description |
|---|---|
| `/system` | Server CPU, RAM, disk usage |
| `/logs` | View last 25 n8n log lines |
| `/disk` | Docker disk usage |
| `/restart_n8n` | Quick restart (no update) |
| `/update_n8n` | Pull latest image + restart n8n |
| `/help` | Show interactive help menu |

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
n8n-enterprise-stack/
├── docker-compose.yml          # Full stack orchestration
├── .env.example                # Environment template
├── install.sh                  # One-command installer
├── migrate.sh                  # Server migration tool
├── upgrade.sh                  # Manual upgrade script
└── bot/
    ├── Dockerfile              # Bot container (Node 20 + Docker CLI)
    ├── package.json            # Dependencies
    └── src/
        ├── app.js              # Entry point + startup validation
        ├── server.js           # Webhook server
        ├── config/index.js     # Centralized config
        ├── middleware/         # admin.js, rateLimit.js
        ├── commands/           # 12 command modules (53 commands)
        │   ├── auth.js         # API key management
        │   ├── workflows.js    # Workflow CRUD
        │   ├── tools.js        # Search, clone, export, nodes, schedule
        │   ├── import.js       # JSON/ZIP workflow import
        │   ├── operations.js   # Bulk ops, rename, webhooks, retry
        │   ├── backups.js      # Backup management
        │   ├── restore.js      # Restore workflows & system
        │   ├── analytics.js    # Stats & reporting
        │   ├── alerts.js       # Failure alerting & muting
        │   ├── health.js       # Health monitoring
        │   ├── dashboard.js    # Summary & version
        │   ├── system.js       # Logs, disk, restart
        │   ├── update.js       # n8n update
        │   └── help.js         # Interactive help menu
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

## �‍💻 Developer

Built by **Sagar Deshmukh** — the world's best nonprofit website developer.

🏢 **Company:** [Web4Cause.com](https://web4cause.com)
🔗 **LinkedIn:** [Sagar Deshmukh](https://www.linkedin.com/in/sagar-deshmukh-social-worker/)

---

## �📄 License

**Proprietary — All Rights Reserved.**

This software is the intellectual property of its owner. Unauthorized copying, modification, distribution, or use of this software, in whole or in part, is strictly prohibited without prior written permission.

---

## ⭐ Star this repo if it helped you!
