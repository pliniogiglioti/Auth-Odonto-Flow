import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import logoLight from "@/assets/logo-light.png";
import { supabase } from "@/supabaseClient";

/** =========================
 * helpers (returnTo seguro)
 * ========================= */
function stripTokenHash(urlStr: string) {
  try {
    const u = new URL(urlStr);
    const h = (u.hash || "").toLowerCase();
    if (h.includes("access_token=") || h.includes("refresh_token=") || h.includes("token_type=")) {
      u.hash = "";
    }
    return u.toString();
  } catch {
    return urlStr;
  }
}

function stripHash(urlStr: string) {
  try {
    const u = new URL(urlStr);
    u.hash = "";
    return u.toString();
  } catch {
    return urlStr;
  }
}

function safeReturnTo(raw: string | null) {
  const fallback = "https://lab.flowodonto.com.br/login";
  if (!raw) return fallback;

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const allowed = host === "flowodonto.com.br" || host.endsWith(".flowodonto.com.br");
    if (!allowed) return fallback;

    return stripTokenHash(url.toString());
  } catch {
    return fallback;
  }
}

function isSamePage(urlStr: string) {
  try {
    const u = new URL(urlStr);
    return u.origin === window.location.origin && u.pathname === window.location.pathname;
  } catch {
    return false;
  }
}

export default function App() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [booting, setBooting] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [formData, setFormData] = useState({ email: "", password: "" });

  const params = useMemo(() => new URLSearchParams(window.location.search), []);

  // ✅ Agora logout funciona por query (?logout=1) — não depende de rota /logout
  const isLogout = useMemo(() => {
    const q = params.get("logout");
    return q === "1" || q === "true";
  }, [params]);

  const returnTo = useMemo(() => {
    return safeReturnTo(params.get("returnTo"));
  }, [params]);

  const redirectToAppWithSession = (session: any) => {
    if (!session) return;
    if (redirecting) return;

    const base = stripHash(stripTokenHash(returnTo));

    // trava anti-loop
    if (isSamePage(base)) {
      setBooting(false);
      return;
    }

    const hash =
      `#access_token=${encodeURIComponent(session.access_token)}` +
      `&refresh_token=${encodeURIComponent(session.refresh_token ?? "")}` +
      `&token_type=bearer` +
      `&expires_in=${encodeURIComponent(String(session.expires_in ?? 3600))}`;

    setRedirecting(true);
    window.location.replace(base + hash);
  };

  /** =========================
   * LOGOUT (por query ?logout=1)
   * ========================= */
  useEffect(() => {
    if (!isLogout) return;

    (async () => {
      setRedirecting(true);
      try {
        await supabase.auth.signOut({ scope: "global" as any });
      } catch {
        await supabase.auth.signOut();
      }

      // volta “limpo” (sem hash e sem logout=1)
      const clean = stripHash(stripTokenHash(returnTo));
      window.location.replace(clean);
    })();
  }, [isLogout, returnTo]);

  /** =========================
   * Boot: checa sessão antes de renderizar login (tira o pisca)
   * ========================= */
  useEffect(() => {
    if (isLogout) return;

    let mounted = true;
    setBooting(true);

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (data.session) {
        redirectToAppWithSession(data.session);
        return;
      }

      setBooting(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event: any, session) => {
      if (session) {
        redirectToAppWithSession(session);
        return;
      }
      if (event === "INITIAL_SESSION") setBooting(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnTo, isLogout]);

  /** =========================
   * OAuth
   * ========================= */
  const loginOAuth = async (provider: "google" | "facebook" | "apple") => {
    setIsLoading(true);
    setErrorMsg(null);

    const cleanReturnTo = stripTokenHash(returnTo);
    const redirectBack = `${window.location.origin}/?returnTo=${encodeURIComponent(cleanReturnTo)}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectBack },
    });

    if (error) {
      setErrorMsg(error.message);
      setIsLoading(false);
    }
  };

  /** =========================
   * Email + senha
   * ========================= */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!formData.email || !formData.password) {
      setErrorMsg("Preencha todos os campos");
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: formData.email,
      password: formData.password,
    });
    setIsLoading(false);

    if (error) {
      setErrorMsg(error.message === "Invalid login credentials" ? "Email ou senha incorretos" : error.message);
      return;
    }
  };

  /** =========================
   * Loading (boot/redirect/logout)
   * ========================= */
  if (redirecting || booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  /** =========================
   * LOGIN
   * ========================= */
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logoLight} alt="OdontoFlow Lab System" className="h-14 mx-auto mb-4" />
          <p className="text-muted-foreground">Gestão de Próteses Odontológicas</p>
        </div>

        <Card className="border-0 shadow-xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl text-center">Entrar</CardTitle>
            <CardDescription className="text-center">Digite suas credenciais para acessar</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    disabled={isLoading}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <a href="https://flowodonto.com.br/recuperar-senha" className="text-sm text-primary hover:underline">
                  Esqueceu a senha?
                </a>
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>

              {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">ou continue com</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Button type="button" variant="outline" disabled={isLoading} onClick={() => loginOAuth("google")}>
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0  -5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Google
              </Button>

              <Button type="button" variant="outline" disabled={isLoading} onClick={() => loginOAuth("facebook")}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#1877F2">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                Facebook
              </Button>

              <Button type="button" variant="outline" disabled={isLoading} onClick={() => loginOAuth("apple")}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>
                Apple
              </Button>
            </div>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Não tem uma conta? </span>
              <a
                href="https://flowodonto.com.br/cadastro"
                className="text-primary hover:underline font-medium"
                target="_blank"
                rel="noopener noreferrer"
              >
                Cadastre-se
              </a>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © 2024 OdontoFlow. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}
