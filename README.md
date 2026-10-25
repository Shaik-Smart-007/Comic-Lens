# ComicLens 📖

> **A human-reviewed accessibility workbench for comic pages.**  
> *Core Principle: Gemma drafts. Python validates. Humans review. ComicLens exports.*

---

## 1. Project Overview

Comic pages communicate through an intricate combination of visual art, spatial layout, speech bubbles, captions, and reading sequences. For people who rely on screen readers or audio descriptions, this visual narrative is often completely inaccessible or presented out of order.

**ComicLens** solves this by providing an assistive authoring workbench:
1. **Upload**: The user uploads a comic page they own or are licensed to transcribe.
2. **Draft (Gemma 4)**: Multimodal Gemma 4 (`gemma-4-26b-a4b-it` or `gemma-4-31b-it`) analyzes the comic page, inferring reading order, visible characters, actions, and speech bubbles.
3. **Validate (Python)**: Strict Python validation ensures the output is valid JSON, checks data types, sanitizes content, and catches parsing errors without using dangerous `eval()`.
4. **Review (Human)**: Every draft is presented in an interactive card. The human reviewer edits text, corrects reading orders, and verifies each panel. No AI draft is auto-approved.
5. **Export (Markdown)**: Generates a clean, accessible Markdown document labeled `Human-reviewed` (if all panels are checked) or `Review incomplete`.

> **Note**: ComicLens is an assistive authoring prototype, not an autonomous accessibility certification system.

---

## 2. Architecture & Data Flow

```text
[Comic Page Image]
       │
       ▼
 [Step A: Upload & Pillow Validation] (Format, dimensions, size <= 15MB)
       │
       ▼
 [Step B: Gemma 4 via Google Gen AI SDK] (Structured JSON prompt)
       │
       ▼
 [Python Response Validator] (Strict JSON parsing, schema enforcement)
       │
       ▼
 [Step C: Streamlit Review Interface] (Card-by-card human editing & checkbox)
       │
       ▼
 [Step D: Accessible Markdown Export] (Downloadable .md for screen readers)
```

- **Frontend & App Shell**: Streamlit (fast, responsive, low memory footprint).
- **Multimodal AI**: Google Gen AI SDK (`google-genai`) querying Gemma 4.
- **Image Processing**: Pillow (safe verification, dimensions check, zero local GPU/RAM model load).
- **Configuration**: `python-dotenv` for secure environment variable isolation.

---

## 3. Prerequisites

- **Operating System**: Windows 10/11, macOS, or Linux.
- **Memory**: Runs comfortably on laptops with **4 GB RAM** (no local model weights loaded).
- **Python**: Python 3.11 or 3.12.
- **Gemini API Key**: Free tier or paid key from [Google AI Studio](https://aistudio.google.com/app/apikey).

---

## 4. Windows PowerShell Setup & Run Instructions

Open **Windows PowerShell** in your project folder and run the following commands:

### Step 1: Clone or navigate to the folder
```powershell
cd ComicLens
```

### Step 2: Create and activate a Python virtual environment
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```
*(If PowerShell shows an execution policy error, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned` and activate again).*

### Step 3: Install required dependencies
```powershell
pip install --upgrade pip
pip install -r requirements.txt
```

### Step 4: Configure environment variables
```powershell
Copy-Item .env.example .env
notepad .env
```
Inside Notepad, replace `your_gemini_api_key_here` with your actual Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey):
```ini
GEMINI_API_KEY=AIzaSy...
GEMMA_MODEL=gemma-4-26b-a4b-it
```
Save and close Notepad.

### Step 5: Run ComicLens
```powershell
streamlit run app.py
```
Your default browser will automatically open to `http://localhost:8501`.

---

## 5. Running the Unit Tests

ComicLens includes automated tests for JSON sanitization, schema validation, and Markdown export formatting:

```powershell
python -m unittest test_comiclens.py
```

All tests run locally in milliseconds with zero external API calls.

---

## 6. Manual Testing Checklist

Before demonstrating or deploying, verify these edge cases:

- [ ] **No image uploaded**: Verify upload prompt and clean empty state.
- [ ] **Invalid / Non-image file**: Upload a `.txt` or corrupted image renamed to `.png`; verify graceful error message.
- [ ] **Image replacement**: Upload Image A, generate descriptions, then upload Image B; verify stale descriptions are wiped completely.
- [ ] **API Authentication Failure**: Test with an invalid key; verify the UI displays a helpful error without crashing or printing the key.
- [ ] **Partial Review**: Mark only 1 of 3 panels as "Reviewed by human"; verify the export displays `Review incomplete (1/3 panels verified)`.
- [ ] **Complete Review**: Mark all panels as reviewed; verify export status updates to `Human-reviewed`.
- [ ] **User Edits**: Edit a drafted description; verify your revised wording is retained after Streamlit reruns and appears in the exported file.
- [ ] **Export Before Generation**: Verify no invalid download button is exposed prior to generating descriptions.

---


## 8. Privacy, Security & Responsible AI

- **Data Flow**: Uploaded images are transmitted directly to the configured Google Gen AI API endpoint for analysis. They are not stored permanently by ComicLens.
- **Copyright & Attribution**: When testing or demonstrating, use an openly licensed comic (e.g., Creative Commons, public domain, or creator-authorized page). Always credit the creator and include license details in your project notes.
- **Accessibility Disclaimer**: ComicLens is an authoring tool designed to assist human writers. Output descriptions do not guarantee formal compliance with statutory standards unless thoroughly verified by qualified accessibility reviewers.

---

## 9. License

MIT License. (See `LICENSE` file before public distribution).
