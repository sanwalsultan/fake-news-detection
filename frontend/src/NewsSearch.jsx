
import { useState } from "react";

export default function NewsSearch() {
  const [query, setQuery] = useState("");
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function searchNews() {
    if (query.trim().length < 3) return;

    setLoading(true);
    setError("");
    setArticles([]);

    try {
      const url =
        "http://127.0.0.1:8000/search-news?query=" +
        encodeURIComponent(query.trim());

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("News search failed");
      }

      const data = await response.json();
      setArticles(data.articles || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h2>Live News Search</h2>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Enter a news headline or keywords"
      />

      <button onClick={searchNews} disabled={loading}>
        {loading ? "Searching..." : "Search Internet"}
      </button>

      {error && <p>{error}</p>}

      {!loading && articles.length === 0 && !error && (
        <p>No results loaded.</p>
      )}

      {articles.map((article, index) => (
        <div key={article.url || index}>
          <h3>{article.title}</h3>
          <p>Source: {article.source}</p>
          <p>Date: {article.date}</p>

          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Read original article
          </a>
        </div>
      ))}

      <p>
        Related articles are not proof that a claim is true.
      </p>
    </section>
  );
}
