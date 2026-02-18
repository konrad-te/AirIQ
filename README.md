# AirIQ

Project structure:

- `frontend/`: client application (served by Vite)
- `backend/`: Python backend and tests
- `data/`: cached and sample data
- `docs/`: documentation assets

## Frontend

Run from `AirIQ/`:

```bash
npm install
npm run dev
```

Vite is configured with `root: "frontend"` in `vite.config.js`, so the frontend entry file is:

- `frontend/index.html`

## Backend

Run from `AirIQ/backend`:

```bash
pip install -r requirements.txt
python main.py
```
