import { useCallback, useEffect, useState } from 'react';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import NewsSearch from './NewsSearch.jsx';

// ============================================================
// 1. API CONFIGURATION
// ============================================================
const API = (
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
).replace(/\/+$/, '');

const MAX_TEXT_LENGTH = 20000;

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, options);
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const reason =
      typeof body.detail === 'string'
        ? body.detail
        : JSON.stringify(body.detail || body);
    throw new Error(reason || `Request failed (${response.status})`);
  }

  return body;
}

function percent(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(100, Math.round(number * 100)))
    : null;
}

function safeHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

// ============================================================
// 2. MAIN APP AND COMPONENT STATE
// ============================================================
export default function App() {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({ total: 0, real: 0, fake: 0 });
  const [metrics, setMetrics] = useState(null);
  const [health, setHealth] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Groq /ai-review results
  const [aiResult, setAiResult] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');

  // GDELT /search-news results
  const [webResults, setWebResults] = useState([]);
  const [webBusy, setWebBusy] = useState(false);
  const [webError, setWebError] = useState('');
  const [webSearched, setWebSearched] = useState(false);
  const [webQuery, setWebQuery] = useState('');

  // ==========================================================
  // 3. LOAD MODEL STATUS, METRICS, HISTORY AND STATS
  // ==========================================================
  const refresh = useCallback(async () => {
    try {
      const [h, s, recent] = await Promise.all([
        request('/health'),
        request('/stats'),
        request('/history?limit=12'),
      ]);

      setHealth(h);
      setStats(s);
      setHistory(Array.isArray(recent) ? recent : []);

      const m = await request('/metrics').catch(() => null);
      setMetrics(m);
      setError('');
    } catch (err) {
      setHealth(null);
      setError(
        `Backend unavailable: ${err.message}. Check that FastAPI is running.`,
      );
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function changeText(value) {
    setText(value);
    // Do not display a previous article's results with newly entered text.
    setResult(null);
    setAiResult(null);
    setWebResults([]);
    setWebSearched(false);
    setWebQuery('');
    setError('');
    setAiError('');
    setWebError('');
  }

  // ==========================================================
  // 4. CLASSIFY ARTICLE WITH YOUR TRAINED ML MODEL
  // ==========================================================
  async function analyze(event) {
    event.preventDefault();
    setError('');
    setResult(null);

    if (text.trim().length < 20) {
      setError('Please enter at least 20 characters of news text.');
      return;
    }

    setBusy(true);
    try {
      const data = await request('/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });

      setResult(data);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // ==========================================================
  // 5. GROQ ANALYSIS: EXTRACT CLAIM, ISSUES AND SEARCH QUERY
  // ==========================================================
  async function runAIReview() {
    if (text.trim().length < 20) {
      setAiError('Enter at least 20 characters of news text.');
      return;
    }

    setAiBusy(true);
    setAiError('');
    setAiResult(null);

    try {
      const data = await request('/ai-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });

      if (!data.analysis) {
        throw new Error('Groq returned no analysis.');
      }
      setAiResult(data.analysis);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiBusy(false);
    }
  }

  // ==========================================================
  // 6. INTERNET SEARCH: MANUAL TO AVOID EXCESS GDELT REQUESTS
  // ==========================================================
  async function searchRelatedNews() {
    // Prefer Groq's keyword query; otherwise use the article opening.
    const query = (
      aiResult?.search_query ||
      text.trim().split(/[\r\n.!?]/)[0].trim()
    ).slice(0, 200);

    if (query.length < 3) {
      setWebError('Enter a news headline, or run Groq review first.');
      return;
    }

    setWebQuery(query);
    setWebBusy(true);
    setWebError('');
    setWebResults([]);
    setWebSearched(false);

    try {
      const data = await request(
        `/search-news?query=${encodeURIComponent(query)}`,
      );
      setWebResults(Array.isArray(data.articles) ? data.articles : []);
      setWebSearched(true);
    } catch (err) {
      setWebError(`Internet search failed: ${err.message}`);
    } finally {
      setWebBusy(false);
    }
  }

  // ==========================================================
  // 7. DATA FOR CLASSIFICATION CHART
  // ==========================================================
  const total = Number(stats?.total) || 0;
  const real = Number(stats?.real) || 0;
  const fake = Number(stats?.fake) || 0;
  const chartData = [
    { name: 'Model: Real', value: real, color: '#34e4a7' },
    { name: 'Model: Fake', value: fake, color: '#ff6f93' },
  ];
  const modelScore = result ? percent(result.model_score) : null;

  // ==========================================================
  // 8. USER INTERFACE
  // ==========================================================
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark">N</div>
        <div className="brand-copy">
          <div className="eyebrow">AI / NLP · Educational Prototype</div>
          <h1>
            News<span>Lens</span> <small>Detection Dashboard</small>
          </h1>
        </div>
        <div className={`server-status ${health?.model_loaded ? 'online' : ''}`}>
          <span className="status-dot" />
          {health?.model_loaded
            ? 'Model ready'
            : health
              ? 'Model not trained'
              : 'API offline'}
        </div>
      </header>

      <main className="dashboard">
        {/* 9. INTRODUCTION */}
        <section className="intro">
          <div>
            <p className="label-accent">FAKE NEWS TEXT CLASSIFICATION</p>
            <h2>
              Analyze the <em>patterns</em> in a news story.
            </h2>
            <p>
              Paste a news article to see how it compares with the examples
              learned by the model. Use Groq and source search as separate
              investigation tools.
            </p>
          </div>
          <div className="intro-side">
            PYTHON <span>·</span> FASTAPI <span>·</span> REACT{' '}
            <span>·</span> NLP
          </div>
        </section>

        {/* 10. NEWS INPUT + ML CLASSIFICATION */}
        <section className="main-grid">
          <article className="panel input-panel">
            <div className="panel-heading">
              <h3>01 / News Input</h3>
              <span>Text Analysis</span>
            </div>
            <form onSubmit={analyze}>
              <label htmlFor="news-input">News article or headline</label>
              <textarea
                id="news-input"
                value={text}
                onChange={(event) => changeText(event.target.value)}
                maxLength={MAX_TEXT_LENGTH}
                rows={10}
                placeholder="Paste a news article here..."
              />
              <div className="form-bottom">
                <span>
                  {text.length.toLocaleString()} /{' '}
                  {MAX_TEXT_LENGTH.toLocaleString()} characters
                </span>
                <span>English-language dataset</span>
              </div>
              <button
                className="analyze-button"
                type="submit"
                disabled={busy || !health?.model_loaded}
              >
                {busy ? 'Analyzing...' : 'Analyze News →'}
              </button>
            </form>
            {error && <div className="error-alert" role="alert">{error}</div>}
            <p className="micro-note">
              ML classification is not verified fact-checking.
              Do not rely on it for high-stakes decisions.
            </p>
          </article>

          <article className="panel result-panel">
            <div className="panel-heading">
              <h3>02 / Prediction</h3>
              <span>Model Output</span>
            </div>
            {result ? (
              <>
                <p className="result-hint">The model predicts this text is closer to:</p>
                <div className={`result-label ${result.label === 'REAL' ? 'real' : 'fake'}`}>
                  {result.label === 'REAL'
                    ? 'LIKELY REAL-LIKE'
                    : 'LIKELY FAKE-LIKE'}
                </div>
                <div className="score-line">
                  <strong>{modelScore === null ? '—' : `${modelScore}%`}</strong>
                  <span>Model classification score — not truth probability</span>
                </div>
                <div className="score-track">
                  <div
                    className="score-fill"
                    style={{ width: `${modelScore ?? 0}%` }}
                  />
                </div>
                <h4>Influential text features</h4>
                {result.top_cues?.length ? (
                  <div className="cue-list">
                    {result.top_cues.map((word, index) => (
                      <span key={`${word}-${index}`}>{word}</span>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No influential vocabulary features available.</p>
                )}
                <p className="micro-note">
                  These features influenced a text classification, not factual verification.
                </p>
              </>
            ) : (
              <div className="empty-result">
                <div className="scanner-icon">◎</div>
                <h4>Awaiting analysis</h4>
                <p>Enter a news story on the left to see its ML classification.</p>
              </div>
            )}
          </article>
        </section>

        {/* 11. GROQ AI CLAIM REVIEW */}
        <section className="news-search-section">
          <article className="panel">
            <div className="panel-heading">
              <h3>03 / Groq AI News Review</h3>
              <span>Claim Analysis</span>
            </div>
            <button
              className="analyze-button"
              type="button"
              onClick={runAIReview}
              disabled={aiBusy || text.trim().length < 20}
            >
              {aiBusy ? 'Reviewing with Groq...' : 'Review with Groq AI'}
            </button>
            {aiError && <div className="error-alert" role="alert">{aiError}</div>}
            {aiResult && (
              <div className="ai-review-results">
                <h4>Main claim</h4>
                <p>{aiResult.main_claim}</p>
                <h4>Suggested web search</h4>
                <p>{aiResult.search_query}</p>
                <h4>Groq explanation</h4>
                <p>{aiResult.explanation}</p>
                <h4>Potential issues to investigate</h4>
                {aiResult.potential_issues?.length ? (
                  <ul>
                    {aiResult.potential_issues.map((issue, index) => (
                      <li key={index}>{issue}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No specific issues listed.</p>
                )}
              </div>
            )}
            <p className="micro-note">
              Groq extracts and discusses claims; it does not search the web
              through this endpoint or independently verify truth.
            </p>
          </article>
        </section>

        {/* 12. RELATED INTERNET EVIDENCE SEARCH */}
        <section className="news-search-section">
          <article className="panel">
            <div className="panel-heading">
              <h3>04 / Online Evidence Search</h3>
              <span>Related News Sources</span>
            </div>
            <button
              className="analyze-button"
              type="button"
              onClick={searchRelatedNews}
              disabled={webBusy || (!text.trim() && !aiResult?.search_query)}
            >
              {webBusy ? 'Searching the internet...' : 'Find Related News Articles'}
            </button>
            {aiResult?.search_query && (
              <p className="micro-note">
                Suggested query from Groq: {aiResult.search_query}
              </p>
            )}
            {webQuery && <p className="muted">Query: {webQuery}</p>}
            {webError && <div className="error-alert" role="alert">{webError}</div>}
            {webSearched && webResults.length === 0 && (
              <p className="muted">No matching articles returned for this search.</p>
            )}
            {webResults.map((article, index) => {
              const url = safeHttpUrl(article.url);
              return (
                <div className="history-item" key={article.url || index}>
                  <div>
                    <h4>{article.title || 'Untitled article'}</h4>
                    <p className="muted">
                      Source: {article.source || 'Unknown'}
                      {article.date ? ` · Date: ${article.date}` : ''}
                    </p>
                    {url && (
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        Read original article
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
            <p className="micro-note">
              Related articles are search matches, not proof that a claim is true.
              GDELT may rate-limit repeated searches.
            </p>
          </article>
        </section>

        {/* 13. EXISTING MANUAL NEWS SEARCH COMPONENT */}
        <section className="news-search-section">
          <article className="panel">
            <div className="panel-heading">
              <h3>05 / Manual Live News Search</h3>
              <span>Search by Keywords</span>
            </div>
            <NewsSearch />
          </article>
        </section>

        {/* 14. SUMMARY METRICS */}
        <section className="metrics-grid">
          <article className="metric">
            <span>Predictions saved</span>
            <strong>{total}</strong>
          </article>
          <article className="metric">
            <span>Real-like predictions</span>
            <strong className="green">{real}</strong>
          </article>
          <article className="metric">
            <span>Fake-like predictions</span>
            <strong className="pink">{fake}</strong>
          </article>
          <article className="metric">
            <span>Held-out dataset accuracy</span>
            <strong>
              {metrics && Number.isFinite(Number(metrics.accuracy))
                ? `${(Number(metrics.accuracy) * 100).toFixed(1)}%`
                : '—'}
            </strong>
            <small>Not a real-world truth rate</small>
          </article>
        </section>

        {/* 15. RECENT HISTORY AND CLASSIFICATION CHART */}
        <section className="bottom-grid">
          <article className="panel history-panel">
            <div className="panel-heading">
              <h3>06 / Recent Predictions</h3>
              <button type="button" className="refresh" onClick={refresh}>
                Refresh ↻
              </button>
            </div>
            {history.length ? (
              <div className="history-list">
                {history.map((item) => (
                  <div className="history-item" key={item.id}>
                    <div className="history-preview">{item.preview}</div>
                    <div className="history-score">
                      <span className={item.label === 'REAL' ? 'green' : 'pink'}>
                        {item.label}
                      </span>
                      <strong>
                        {percent(item.model_score) === null
                          ? '—'
                          : `${percent(item.model_score)}%`}
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No saved predictions yet.</p>
            )}
          </article>

          <article className="panel chart-panel">
            <div className="panel-heading">
              <h3>07 / Classification Summary</h3>
              <span>Dashboard</span>
            </div>
            {real + fake > 0 ? (
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={63}
                    outerRadius={90}
                    stroke="#0d1931"
                    strokeWidth={5}
                  >
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: '#0a1931',
                      borderColor: '#254164',
                      color: '#eff6ff',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-placeholder">Chart appears after saved predictions</div>
            )}
            <div className="chart-legend">
              <span><i className="dot green-bg" />Real-like: {real}</span>
              <span><i className="dot pink-bg" />Fake-like: {fake}</span>
            </div>
          </article>
        </section>

        {/* 16. FOOTER */}
        <footer>
          NewsLens · Free and open-source educational prototype ·
          Text patterns and related news reports do not prove factual accuracy
        </footer>
      </main>
    </div>
  );
}
