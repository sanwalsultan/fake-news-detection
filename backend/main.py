"""FastAPI inference service for a coursework demonstration, not fact checking."""
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
import joblib
from groq_review import router as groq_router
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session
from news_search import router as news_router
from database import Prediction, SessionLocal, initialize_database
from fastapi import FastAPI
from news_search import router as news_router
from groq_review import router as groq_router

# Keep your existing CORS middleware and other endpoints.

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "model" / "fake_news_pipeline.joblib"
METRICS_PATH = ROOT / "model" / "metrics.json"
MODEL = None


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global MODEL
    initialize_database()
    if MODEL_PATH.exists():
        # Load only your own trusted model file, never a user-submitted .joblib file.
        MODEL = joblib.load(MODEL_PATH)
    yield


app = FastAPI(
    title="Fake News Detection API",
    version="0.1.0",
    lifespan=lifespan
)

app.include_router(news_router)
app.include_router(groq_router)

allowed_origins = [item.strip() for item in os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",") if item.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class PredictRequest(BaseModel):
    text: str = Field(min_length=20, max_length=20000)


class PredictResponse(BaseModel):
    label: str
    model_score: float
    top_cues: list[str]
    note: str


def explain_words(text: str, pipeline, label_num: int, max_words: int = 5) -> list[str]:
    """Rank input TF-IDF terms by their signed contributions, NOT factual evidence."""
    vectorizer = pipeline.named_steps["tfidf"]
    classifier = pipeline.named_steps["classifier"]
    vector = vectorizer.transform([text]).tocsr()
    if vector.nnz == 0:
        return []
    weights = classifier.coef_[0]
    sign = 1.0 if label_num == 1 else -1.0
    names = vectorizer.get_feature_names_out()
    scores = [(float(tfidf * weights[idx] * sign), names[idx])
              for idx, tfidf in zip(vector.indices, vector.data)]
    ranked = sorted((p for p in scores if p[0] > 0), reverse=True)
    return [term for _, term in ranked[:max_words]]


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": MODEL is not None}


@app.post("/predict", response_model=PredictResponse)
def predict(payload: PredictRequest, db: Session = Depends(get_db)):
    if MODEL is None:
        raise HTTPException(503, "Model missing. Run python train_model.py first, then restart API.")
    text = " ".join(payload.text.split())
    if len(text) < 20:
        raise HTTPException(422, "Enter at least 20 non-whitespace characters.")
    label_num = int(MODEL.predict([text])[0])
    probability_by_class = dict(zip(MODEL.classes_, MODEL.predict_proba([text])[0]))
    score = float(probability_by_class[label_num])
    label = "REAL" if label_num == 1 else "FAKE"
    cues = explain_words(text, MODEL, label_num)

    # Saving previews is useful locally; disable it in a public demo via SAVE_PREDICTIONS=false.
    if os.getenv("SAVE_PREDICTIONS", "true").lower() == "true":
        record = Prediction(preview=text[:200], label=label, score=score)
        db.add(record)
        db.commit()
    return PredictResponse(
        label=label, model_score=round(score, 4), top_cues=cues,
        note="Pattern-based prediction only; not independently verified fact checking."
    )


@app.get("/history")
def history(limit: int = Query(default=20, ge=1, le=100), db: Session = Depends(get_db)):
    records = db.scalars(select(Prediction).order_by(Prediction.id.desc()).limit(limit)).all()
    return [{"id": row.id, "preview": row.preview, "label": row.label,
             "model_score": round(row.score, 4),
             "created_at": row.created_at.isoformat() if row.created_at else None}
            for row in records]


@app.get("/stats")
def stats(db: Session = Depends(get_db)):
    total, real, fake = db.execute(select(
        func.count(Prediction.id),
        func.sum(case((Prediction.label == "REAL", 1), else_=0)),
        func.sum(case((Prediction.label == "FAKE", 1), else_=0))
    )).one()
    return {"total": int(total or 0), "real": int(real or 0), "fake": int(fake or 0)}


@app.get("/metrics")
def metrics():
    if not METRICS_PATH.exists():
        raise HTTPException(404, "Train the model to generate evaluation metrics.")
    return json.loads(METRICS_PATH.read_text(encoding="utf-8"))
