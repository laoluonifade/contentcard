#!/usr/bin/env bash
# ContentCard — Quick Setup Script
# Run from the project root: bash setup.sh

set -e

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   ContentCard — Setup               ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── Backend ─────────────────────────────────────────────────────
echo "▸ Setting up backend..."
cd backend

if [ ! -d "venv" ]; then
  python3 -m venv venv
  echo "  Created Python virtualenv"
fi

source venv/bin/activate
pip install -r requirements.txt -q
echo "  Installed Python dependencies"

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "  Created backend/.env — please fill in DATABASE_URL and optionally AI keys"
fi

cd ..

# ── Frontend ────────────────────────────────────────────────────
echo ""
echo "▸ Setting up frontend..."
cd frontend
npm install --silent
echo "  Installed Node dependencies"
cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit backend/.env and set your DATABASE_URL"
echo "  2. (Optional) Add ANTHROPIC_API_KEY or OPENAI_API_KEY"
echo "  3. Start the backend:  cd backend && source venv/bin/activate && uvicorn app.main:app --reload"
echo "  4. Start the frontend: cd frontend && npm run dev"
echo ""
echo "Then open: http://localhost:5173"
echo "Demo login: demo@contentcard.io / demo1234"
echo ""
