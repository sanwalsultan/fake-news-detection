"""Train a baseline only on genuine, user-downloaded labeled data.

Expected dataset files: data/True.csv and data/Fake.csv (ISOT).
No fabricated news records are bundled or silently substituted.
"""
import json
import re
from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
MODEL_DIR = ROOT / "model"


def normalize(raw: str) -> str:
    raw = str(raw)
    # Remove frequent publisher-specific Reuters datelines to reduce trivial leakage.
    raw = re.sub(r"^[A-Za-z ,./()'-]{1,100}\(Reuters\)\s*-\s*", "", raw, flags=re.I)
    return " ".join(raw.split())


def read_frame(name: str, label: int) -> pd.DataFrame:
    path = DATA / name
    if not path.exists():
        raise FileNotFoundError(
            f"Missing {path}. Download the ISOT dataset and copy True.csv and Fake.csv into backend/data/."
        )
    frame = pd.read_csv(path)
    required = {"title", "text"}
    if not required.issubset(frame.columns):
        raise ValueError(f"{name} must contain columns: {sorted(required)}")
    frame = frame[["title", "text"]].fillna("")
    frame["content"] = (
        frame["title"].astype(str) + ". " + frame["text"].astype(str)
    ).map(normalize)
    frame["label"] = label
    frame = frame[frame["content"].str.len() >= 40]
    return frame[["content", "label"]]


def main():
    real = read_frame("True.csv", 1)
    fake = read_frame("Fake.csv", 0)
    frame = pd.concat([real, fake], ignore_index=True)
    # Exclude exact text duplicates; discard conflicting-label entries entirely.
    conflicting = frame.groupby("content")["label"].nunique()
    conflicting_texts = set(conflicting[conflicting > 1].index)
    frame = frame[~frame["content"].isin(conflicting_texts)]
    frame = frame.drop_duplicates(subset=["content"]).reset_index(drop=True)
    if len(frame) < 20 or frame["label"].nunique() < 2:
        raise ValueError("Too few usable records from both classes for training.")

    X_train, X_test, y_train, y_test = train_test_split(
        frame["content"], frame["label"],
        test_size=0.20, random_state=42, stratify=frame["label"]
    )
    pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), max_features=30000,
                                     min_df=2, max_df=0.95, sublinear_tf=True)),
        ("classifier", LogisticRegression(max_iter=1000, random_state=42))
    ])
    pipeline.fit(X_train, y_train)
    predictions = pipeline.predict(X_test)
    report = classification_report(
        y_test, predictions, labels=[0, 1],
        target_names=["FAKE", "REAL"], output_dict=True, zero_division=0
    )
    metrics = {
        "accuracy": round(float(accuracy_score(y_test, predictions)), 4),
        "test_samples": int(len(X_test)),
        "training_samples": int(len(X_train)),
        "confusion_matrix_rows_actual_fake_real": confusion_matrix(
            y_test, predictions, labels=[0, 1]
        ).tolist(),
        "classification_report": report,
        "caution": "Dataset-split scores do not establish ability to fact-check new events."
    }
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, MODEL_DIR / "fake_news_pipeline.joblib")
    (MODEL_DIR / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps({k: metrics[k] for k in ["accuracy", "training_samples", "test_samples"]}, indent=2))
    print("Saved pipeline + metrics in backend/model/")


if __name__ == "__main__":
    main()
