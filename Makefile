# PersonaStorm dev shortcuts
.PHONY: api web test demo seed eval up

api:            ## run FastAPI backend on :8000
	cd apps/api && uvicorn app.main:app --reload --port 8000

web:            ## run Next.js frontend on :3000
	cd apps/web && npm run dev

test:           ## backend test suite
	cd apps/api && python -m pytest tests/ -q

demo:           ## headless end-to-end storm in the terminal
	python scripts/run_local_demo.py

seed:           ## export generated personas for every preset
	python scripts/seed_personas.py

eval:           ## recompute quality metrics for a persisted run
	python scripts/evaluate_outputs.py

up:             ## full stack via docker compose
	docker compose up --build
