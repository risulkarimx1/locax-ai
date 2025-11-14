# Locax - Game Translation Management

A professional localization dashboard for game developers. Manage translations, screenshots, and AI-powered context generation.

## Features

- **Local-first**: Works directly with your project folder and CSV files using the File System Access API
- **Spreadsheet support**: Import CSV or Excel source files and keep the structure in sync
- **Git Integration**: Automatically detects and displays the current Git branch
- **Category Tree**: Organize localization keys by category with an intuitive folder structure
- **Multi-language Support**: Add, remove, and manage multiple language columns
- **Screenshot Context**: Attach screenshots to keys and link multiple keys to the same screenshot
- **AI Assistance**: Generate context descriptions and translations (supports OpenAI, Gemini, OpenRouter, and local Ollama models)
- **Auto-save**: Changes are automatically saved back to your CSV file
- **Beautiful UI**: Professional design inspired by modern developer tools

## Getting Started

### Try Sample Project
Click "Try Sample Project" on the welcome screen to explore Locax with demo data.

### Open Your Project
1. Click "Open Project Folder" on the welcome screen
2. Select your game/app project folder
3. Locax will automatically find CSV files in the folder
4. Start editing your localizations!

### CSV/Excel Format
Your CSV or Excel file should have the following structure:
```csv
key,context,en,es,ja
ui:start_button,Main menu start button,Start Game,Empezar Juego,ゲームを開始
dialog:greeting,NPC initial greeting,Hello traveler!,¡Hola viajero!,こんにちは、旅人！
```

## Usage

### Managing Keys
- Click on categories in the left tree to filter keys
- Click the **+** button next to a category to add a new key
- Single-click a row to expand and see full text
- Double-click any cell to edit

### Adding Languages
1. Click the "Languages" dropdown in the header
2. Click "Add Language"
3. Enter the language name and code (e.g., Spanish, es)

### Using AI Features
1. Click "Connect AI" in the header
2. Choose OpenAI, Gemini, OpenRouter, or Ollama (local).  
   - OpenAI/Gemini: paste the respective API key.  
   - OpenRouter: enter your OpenRouter key + a hosted model ID (e.g., `google/gemini-flash-1.5`).  
   - Ollama: ensure `ollama serve` is running locally, pick one of the detected models (e.g., `codellama:34b`), and specify a custom endpoint if needed (defaults to `http://127.0.0.1:11434`).
3. Select a key and upload a screenshot
4. Click "Generate Context" to auto-generate context descriptions
5. Click "Translate" to generate translations for all languages

### Supported AI Providers
- **OpenAI**: Uses the `gpt-4o-mini` chat completions API for high-quality responses.
- **Google Gemini**: Uses the `gemini-1.5-flash-latest` model via the Generative Language API.
- **OpenRouter**: Uses the OpenAI-compatible chat completions endpoint. Pick any hosted model ID (e.g., `google/gemini-flash-1.5`) from [openrouter.ai/models](https://openrouter.ai/models) and provide your OpenRouter API key.
- **Ollama (Local)**: Connects to a running `ollama serve` instance (default `http://127.0.0.1:11434`). Locax lists locally downloaded models so you can select and use them without any API keys.

Locax stores API keys, model choices, and endpoints locally per provider, so you can switch between OpenAI, Gemini, OpenRouter, and Ollama without re-entering settings. Pick the provider that matches your budget/latency needs and ensure translations comply with each platform's usage policies.

### Git Branch
If your project is in a Git repository, Locax will automatically detect and display the current branch in the header.

## Browser Support

Locax requires the File System Access API, which is supported in:
- Chrome 86+
- Edge 86+
- Opera 72+

For unsupported browsers, use the "Try Sample Project" option to explore features.

## Development

This project is built with:
- React + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui components

## Project Links

**URL**: https://lovable.dev/projects/5d5fadcd-3d16-4817-bc0d-db770a2b82d9

For more information on editing and deploying, see the [Lovable documentation](https://docs.lovable.dev/).
