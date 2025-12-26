# TikTok Comment Scraper

A fast and powerful tool to scrape TikTok video comments with both CLI and modern Web UI interfaces.

## ✨ Features

- 🚀 **Fast scraping** using Playwright browser automation
- 🌐 **Web UI** - Beautiful dark-mode interface built with React & shadcn/ui
- 💻 **CLI** - Simple command-line interface for automation
- 🔍 **Search & Filter** - Find comments by username or text
- 📊 **Sort** - Order by newest, oldest, or most replies
- ✅ **Multi-select** - Select specific comments for export
- 📤 **Export** - Download as JSON or PNG images
- 🔗 **Short URL support** - Works with vt.tiktok.com links

## 📋 Requirements

- **Bun >= 1.3**

## 🚀 Quick Start

```sh
# Clone the repository
git clone https://github.com/omarhosamcodes/tiktok-comment-scrapper
cd tiktok-comment-scrapper

# Install dependencies
bun install
```

### Web UI

```sh
bun web
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

### CLI

```sh
bun start --id=7170139292767882522 --output=data
```

## 📖 CLI Options

| Flag | Description | Example | Default |
|:-----|:------------|:--------|:-------:|
| `--id` | TikTok video ID (required) | `--id=7170139292767882522` | - |
| `--output` | Output directory for JSON | `--output=data` | `data/` |
| `--version` | Show version | `--version` | - |
| `--help` | Show help | `--help` | - |

## 🛠️ Development

```sh
# Run CLI with watch mode
bun run dev -- --id=7170139292767882522 --output=data

# Run Web UI with watch mode
bun web:dev

# Build for production
bun run build

# Type check
bun run typecheck

# Lint & format
bun run check
```

## 📁 Project Structure

```
├── server.ts          # Web server (Bun.serve)
├── public/            # Web UI (React + shadcn/ui)
│   ├── App.tsx
│   ├── components/
│   └── hooks/
└── src/               # CLI & scraper core
    ├── index.ts       # CLI entry point
    ├── scraper/       # TikTok scraper logic
    └── types/         # TypeScript types
```

## 📜 License

[MIT License](LICENSE)
