import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

function safeReturnTo(raw: string | null) {
  const fallback = "https://lab.flowodonto.com.br/";
  if (!raw) return fallback;

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();

    // só permite redirecionar para seus domínios
    const allowed =
      host === "flowodonto.com.br" ||
      host.endsWith(".flowodonto.com.br");

    return allowed ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const returnTo = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return safeReturnTo(params.get("returnTo"));
  }, []);

  // Se já tiver sessão no auth, redireciona já logando o app destino via hash
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (data.session) {
        const s = data.session;
        const hash =
          `#access_token=${encodeURIComponent(s.access_token)}` +
          `&refresh_token=${encodeURIComponent(s.refresh_token ?? "")}` +
          `&token_type=bearer` +
          `&expires_in=${encodeURIComponent(String(s.expires_in ?? 3600))}`;

        window.location.replace(returnTo + hash);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) return;

      const hash =
        `#access_token=${encodeURIComponent(session.access_token)}` +
        `&refresh_token=${encodeURIComponent(session.refresh_token ?? "")}` +
        `&token_type=bearer` +
        `&expires_in=${encodeURIComponent(String(session.expires_in ?? 3600))}`;

      window.location.replace(returnTo + hash);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [returnTo]);

  const loginGoogle = async () => {
    setBusy(true);
    setMsg(null);

    // volta pro próprio auth com o returnTo junto
    const redirectBack = `${window.location.origin}/?returnTo=${encodeURIComponent(returnTo)}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectBack },
    });

    if (error) {
      setMsg(error.message);
      setBusy(false);
    }
  };

  return (
    <div style={{ fontFamily: "Arial, sans-serif", padding: 40 }}>
      <h1 style={{ marginBottom: 8 }}>OdontoFlow Auth</h1>
      <p style={{ marginTop: 0, color: "#666" }}>
        Você vai voltar para: <b>{returnTo}</b>
      </p>

      <button
        onClick={loginGoogle}
        disabled={busy}
        style={{
          padding: "12px 16px",
          borderRadius: 10,
          border: "1px solid #ddd",
          cursor: busy ? "not-allowed" : "pointer",
          fontSize: 16,
        }}
      >
        {busy ? "Abrindo Google..." : "Entrar com Google"}
      </button>

      {msg && (
        <p style={{ color: "crimson", marginTop: 16 }}>
          {msg}
        </p>
      )}
    </div>
  );
}
