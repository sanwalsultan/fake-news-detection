# NewsLens — Fake News Text Classification System

A **two-day, zero-cost educational MVP** inspired by the supplied Fake News Detection System proposal. It includes a responsive React dashboard, a FastAPI REST API, a scikit-learn TF-IDF + Logistic Regression model, SQLite/PostgreSQL prediction history, evaluation metrics, and an inference explanation based on influential input words.

> **Research caution:** The classifier learns associations in a historical labeled dataset. It does **not** independently verify claims or determine whether a contemporary event actually happened. Scores are estimated *model classification scores*, not validated probabilities of truth.

## Stack — all free/free-tier

- **Frontend:** React + Vite + Tailwind CSS, chart rendered by Recharts
- **Backend:** Python 3.12 + FastAPI; `/docs` provides automatic Swagger testing
- **NLP:** scikit-learn TF-IDF bigrams
- **Classifier:** scikit-learn Logistic Regression; serialized via joblib
- **Database:** SQLite locally; optional Supabase Free PostgreSQL for public persistent predictions
- **Code:** Git + GitHub public/private free repository
- **Hosting:** Vercel Hobby frontend (personal/non-commercial projects), Render Free backend (sleeps when idle)

## Step 1. Get the dataset (required)

Source: https://onlineacademiccommunity.uvic.ca/isot/datasets/

Download **ISOT Fake News Dataset** and extract `True.csv` and `Fake.csv` to `backend/data/`. The model is not pre-trained and fake training examples are **not** bundled.

Caution: ISOT is mainly historical political and world-news articles, with source-label confounding; article model scores should **not** be generalized to arbitrary social-media posts without additional appropriate training/evaluation.

## Step 2. Train the model — Windows PowerShell

Install Python 3.12, Node.js 22 or newer (compatible with Vite), and Git first.

```powershell
cd fake-news-detector-2day\backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python train_model.py
python -m pytest -q
```

Training creates `backend/model/fake_news_pipeline.joblib` and `backend/model/metrics.json`.

If PowerShell blocks activation, open Command Prompt and activate with `.venv\Scripts\activate.bat` instead. Or use the environment interpreter directly.

## Step 3. Start backend

```powershell
# from backend/ with the virtual environment activated
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

- API health: http://127.0.0.1:8000/health
- Interactive API docs: http://127.0.0.1:8000/docs
- Training metrics: http://127.0.0.1:8000/metrics

Prediction request: `POST /predict` with JSON:

```json
{ "text": "A news article or headline long enough for classification." }
```

Response example (illustrative only — **not an actual prediction**):

```json
{
  "label": "FAKE",
  "model_score": 0.79,
  "top_cues": ["example phrase", "other term"],
  "note": "Pattern-based prediction only; not independently verified fact checking."
}
```

Additional routes: `GET /history`, `GET /stats`, `GET /metrics`.

## Step 4. Start frontend — separate PowerShell terminal

```powershell
cd fake-news-detector-2day\frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:5173 . `VITE_API_URL` defaults to `http://127.0.0.1:8000`.

## Step 5. Test the complete workflow

1. Confirm backend says `model_loaded: true` at `/health`.
2. Paste more than 20 characters in React and click **Analyze News**.
3. See label, model score, and influential text features.
4. See the new record and summary chart; refresh the page and confirm SQLite stores the local history.
5. Try blank text, a very long article, unseen sources, and paraphrased examples.
6. Read `metrics.json` and report accuracy, precision, recall, F1, and confusion matrix without claiming they measure truth verification.

## Step 6. Deploy publicly using free tiers

**Backend on Render:** Push the project to GitHub. First ensure your trained `.joblib` and `metrics.json` are committed in `backend/model/` (check the individual file is below GitHub's file limit). On Render create **New > Web Service**, select the repository and the **Free** plan, and configure:

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Language | Python 3 |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Environment variable | `ALLOWED_ORIGINS=https://your-site.vercel.app` |
| Environment variable | `SAVE_PREDICTIONS=false` for a public demonstration without saved article previews |

Render produces a URL like `https://your-backend.onrender.com`. Test `/health` and `/docs`.

**Frontend on Vercel:** Create new Vercel project from the *same* GitHub repository, root directory **frontend**, framework **Vite**, build command `npm run build`, output directory `dist`. Set frontend environment variable `VITE_API_URL=https://your-backend.onrender.com`, deploy. Ensure the final Vercel hostname appears in Render's `ALLOWED_ORIGINS` and redeploy backend after updating. If Vercel gives a new production URL, update the Render CORS setting.

**Important:** Vercel Hobby is for personal/non-commercial projects. Render Free sleeps after 15 minutes idle, making the first request slow. Its filesystem is ephemeral: SQLite changes may be lost whenever the service restarts/spins down. Render Free is not production-grade. The frontend can show live predictions without database storage, but the history dashboard will stay empty when `SAVE_PREDICTIONS=false`.

**Persistent online history (optional):** Create a Supabase Free project and copy the **PostgreSQL session pooler URI** from its dashboard into the Render environment variable `DATABASE_URL`. This starter already supports PostgreSQL through SQLAlchemy and psycopg. Set `SAVE_PREDICTIONS=true` only if storing public-demo inputs is acceptable; do **not** save personal/private articles without a privacy notice and appropriate access control. Supabase Free may pause after low activity. Use its connection string with `sslmode=require` if directed by Supabase. Keep the URL out of your repo and frontend environment variables.

## 2-day completion plan (16 focused hours)

| Slot | What to do | Demonstrable output |
|---|---|---|
| Day 1, 0:00–0:45 | Create repo, Python venv, frontend skeleton | Both development tools run |
| Day 1, 0:45–1:45 | Download, inspect, clean ISOT CSVs | Input labels and sample counts checked |
| Day 1, 1:45–3:45 | Train TF-IDF + Logistic Regression; test split | Saved `.joblib` pipeline |
| Day 1, 3:45–4:30 | Measure accuracy, precision, recall, F1 | `metrics.json` and honest limitations |
| Day 1, 4:30–6:15 | Implement FastAPI `/predict`, `/health` | Swagger API generates classifications |
| Day 1, 6:15–8:00 | SQLite/Postgres abstraction, history, basic tests | `/history`, `/stats` work |
| Day 2, 0:00–2:00 | React input and result layouts, Tailwind | Responsive dashboard |
| Day 2, 2:00–3:15 | Connect React to FastAPI, handle errors | End-to-end prediction works |
| Day 2, 3:15–4:15 | Explanation cues, metrics, Recharts | Model and history visualization |
| Day 2, 4:15–5:15 | Edge tests and security/privacy checks | Repeatable test checklist |
| Day 2, 5:15–7:00 | GitHub, Render API, Vercel frontend | Public live demo URL |
| Day 2, 7:00–8:00 | README, screenshots, short demo video | Finished project submission |

## Practical limitations

- Training-test split can overestimate transfer to unseen articles because article sources, dates, topics, and styles can correlate with labels.
- A trained classifier does not search the web or verify external evidence.
- The current dataset does not validate performance for headlines alone or for tweets/social posts.
- The displayed model score is not guaranteed to be calibrated; do not advertise 93% as 93% probability of truth.
- Keyword contributions explain some model behavior but do not establish factual support or refutation.
- No user authentication: public history is visible to any visitor; turn off shared storage on public deployments.

## Suggested research upgrade after MVP

Evaluate on a second independent dataset, deduplicate near-identical news, use a source- or time-held-out test, compare Logistic Regression with Linear SVM, and only then add a compact transformer (DistilBERT) if it meaningfully improves performance. Verified fact checking would require retrieval of external evidence and separate claim–evidence reasoning.
