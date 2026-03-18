# AirIQ

Project structure:

- `frontend/`: client application (served by Vite)
- `backend/`: Python backend and tests
- `data/`: cached and sample data
- `docs/`: documentation assets

## Frontend

Run from `AirIQ/frontend`:

```bash
cd frontend
npm install
npm run dev
```

Frontend entry file:

- `index.html`

## Backend

Run from `AirIQ/` (the project root, one level above `backend/`):

```bash
pip install -r backend/requirements.txt
uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
```
