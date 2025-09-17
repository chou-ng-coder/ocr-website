from api.main import app
from model import models
from utils import db

if __name__ == "__main__":
    import uvicorn
    print("[INFO] Starting FastAPI app from backend/main.py...")
    print("[INFO] Modules loaded:")
    print(" - api.main (FastAPI app)")
    print(" - model.models (SQLAlchemy models)")
    print(" - utils.db (DB connection/session)")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)