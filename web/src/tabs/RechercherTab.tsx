import { useEffect, useRef, useState } from 'react';
import { searchGames, type SearchResult } from '../api';
import { type FollowState } from '../useFollow';
import GameRow from '../components/GameRow';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; results: SearchResult[] };

export default function RechercherTab({
  editable,
  follow,
}: {
  editable: boolean;
  follow: FollowState;
}) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<State>({ status: 'idle' });
  const debounceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const q = query.trim();
    window.clearTimeout(debounceRef.current);

    if (q.length < 2) {
      setState({ status: 'idle' });
      return;
    }

    debounceRef.current = window.setTimeout(() => {
      setState({ status: 'loading' });
      searchGames(q)
        .then((results) => setState({ status: 'ok', results }))
        .catch((err: unknown) =>
          setState({
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          }),
        );
    }, 350);

    return () => window.clearTimeout(debounceRef.current);
  }, [query]);

  return (
    <div>
      {!editable && (
        <div className="hint">
          Connecting your Steam account… (search works, follow needs the session)
        </div>
      )}

      <input
        className="search-input"
        type="text"
        placeholder="Search the Steam store… (min. 2 characters)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      {state.status === 'idle' && (
        <div className="state">Type at least 2 characters to search.</div>
      )}
      {state.status === 'loading' && <div className="state">Searching…</div>}
      {state.status === 'error' && (
        <div className="state error">Search failed — {state.error}</div>
      )}
      {state.status === 'ok' && state.results.length === 0 && (
        <div className="state">No game found.</div>
      )}
      {state.status === 'ok' && state.results.length > 0 && (
        <div className="games-grid">
          {state.results.map((r) => {
            const appId = String(r.appid);
            const image = r.tiny_image || r.header_image;
            return (
              <GameRow
                key={appId}
                appId={appId}
                name={r.name}
                image={image}
                editable={editable}
                following={follow.followed.has(appId)}
                busy={follow.busy.has(appId)}
                onToggle={() => follow.toggle(appId, r.name, image)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
