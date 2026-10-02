# CHIP setup

About 15 minutes. Everything runs locally.

## 1. Ollama and the models

Install Ollama from ollama.com, start it (the app, or `ollama serve`), then:

```sh
ollama pull qwen3:8b
ollama pull nomic-embed-text
```

`qwen3:8b` answers questions (thinking mode off). `nomic-embed-text` turns your docs into vectors for search. On a 32 GB Apple Silicon Mac both stay loaded together comfortably.

## 2. Install CHIP

```sh
cd ~/DEV/chip
npm install
cp server/.env.example server/.env
npm link        # makes `chip` available everywhere; undo with `npm unlink -g chip`
```

## 3. Notion (optional)

1. Go to notion.so/profile/integrations, create an **Internal** integration named `CHIP`, read access only.
2. Copy the secret into `server/.env` as `NOTION_API_TOKEN`.
3. Share pages with it: open a page, **…** → **Connections** → `CHIP`. Sharing a parent page shares its children.

`chip sync` writes each shared page to `data/notion/<slug>.md`. The next sync skips pages that haven't changed. Pages you stop sharing are removed. `data/notion/` and `data/index/` are gitignored; Notion content never gets committed.

## 4. Sync and run

```sh
chip sync     # first Notion pull is slow (minutes for hundreds of pages); later ones take seconds
chip status   # check models, index, last sync
npm start     # http://localhost:3000
```

## Settings (`server/.env`)

| Key | Default | What it does |
|---|---|---|
| `NOTION_API_TOKEN` | none | Notion integration secret |
| `CHIP_MODEL` | `qwen3:8b` | chat model |
| `CHIP_EMBED_MODEL` | `nomic-embed-text` | embedding model (changing it re-embeds everything) |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API |
| `PORT` | `3000` | server port (the only place it is set) |
| `CHIP_KEEP_ALIVE` | `30m` | how long Ollama keeps the model loaded |
| `CHIP_NUM_CTX` | `4096` | context window cap |
| `CHIP_CONTEXT_WORDS` | `450` | words of retrieved sources sent per question |
| `BELLA_DIR` | `~/DEV/bella` | where BELLA lives |

**Speed vs. depth.** The model reads prompts at roughly 200 tokens a second on an M1 Max, so the wait before the first word grows with `CHIP_CONTEXT_WORDS`. 450 keeps it near 3 seconds; raising it gives answers more material to work with and takes longer to start.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Ollama not reachable` | Start Ollama (`ollama serve`) or check `OLLAMA_URL` |
| `model … not found` | `ollama pull` the model named in the error |
| `No index yet` | Run `chip sync` |
| `NOTION_API_TOKEN not set` | Add it to `server/.env`, or ignore: Notion is optional |
| A Notion page is missing | Share it (or a parent) with the `CHIP` integration, then `chip sync` |
| Ask CHIP says the server isn't running | `npm start`, then open http://localhost:3000 (not the HTML file) |
