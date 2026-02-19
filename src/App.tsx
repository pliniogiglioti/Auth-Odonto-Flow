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
  const fallback = "https://www.flowodonto.com.br/account";
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

function stripLogoutParam(urlStr: string) {
  try {
    const u = new URL(urlStr);
    u.searchParams.delete("logout");
    return u.toString();
  } catch {
    return urlStr;
  }
}

// Se vier returnTo dentro do returnTo, pega o mais interno
function normalizeReturnTo(rawReturnTo: string | null) {
  const first = safeReturnTo(rawReturnTo);

  try {
    const u = new URL(first);
    const nested = u.searchParams.get("returnTo");
    if (!nested) return first;

    let decoded = nested;
    try {
      decoded = decodeURIComponent(nested);
    } catch {
      // ignore
    }
    return safeReturnTo(decoded);
  } catch {
    return first;
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

function truthyParam(v: string | null) {
  const x = (v ?? "").toLowerCase();
  return x === "1" || x === "true" || x === "yes";
}

function clearSupabaseStorageKeys() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("sb-")) localStorage.removeItem(k);
    }
  } catch {}
  try {
    for (const k of Object.keys(sessionStorage)) {
      if (k.startsWith("sb-")) sessionStorage.removeItem(k);
    }
  } catch {}
}

/** =========================
 * Compat Supabase Auth (v1/v2) sem quebrar TS
 * ========================= */
const auth: any = (supabase as any)?.auth ?? (supabase as any);

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T) {
  let t: any;
  return Promise.race([
    p,
    new Promise<T>((resolve) => {
      t = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => clearTimeout(t));
}

async function getSessionCompat() {
  try {
    if (typeof auth.getSession === "function") {
      const res = await withTimeout(auth.getSession(), 1500, null as any);
      return res?.data?.session ?? null;
    }
    if (typeof auth.session === "function") return auth.session() ?? null;
  } catch {}
  return null;
}

async function validateSessionServerCompat() {
  try {
    if (typeof auth.getUser === "function") {
      const res = await withTimeout(auth.getUser(), 1500, { error: { message: "timeout" } } as any);
      return !res?.error;
    }
  } catch {}
  // Se não dá pra validar aqui, NÃO redireciona (evita loop e evita travar)
  return false;
}

async function signOutCompat() {
  try {
    if (typeof auth.signOut === "function") {
      try {
        await auth.signOut({ scope: "local" });
      } catch {
        await auth.signOut();
      }
    }
  } catch {}
}

async function signInPasswordCompat(email: string, password: string) {
  if (typeof auth.signInWithPassword === "function") return await auth.signInWithPassword({ email, password });
  if (typeof auth.signIn === "function") return await auth.signIn({ email, password });
  return { error: { message: "Método de login não disponível (supabase auth)" } };
}

async function signInOAuthCompat(provider: "google" | "facebook" | "apple", redirectTo: string) {
  if (typeof auth.signInWithOAuth === "function") {
    return await auth.signInWithOAuth({ provider, options: { redirectTo } });
  }
  if (typeof auth.signIn === "function") {
    return await auth.signIn({ provider }, { redirectTo });
  }
  return { error: { message: "OAuth não disponível (supabase auth)" } };
}

async function signUpCompat(
  email: string,
  password: string,
  meta: { nome?: string; telefone?: string },
  emailRedirectTo: string
) {
  // tenta formato v2
  try {
    if (typeof auth.signUp === "function") {
      return await auth.signUp({
        email,
        password,
        options: {
          data: meta,
          emailRedirectTo,
        },
      });
    }
  } catch {
    // cai pro fallback
  }

  // fallback v1 (ou libs antigas)
  try {
    if (typeof auth.signUp === "function") {
      return await auth.signUp(email, password, { data: meta, redirectTo: emailRedirectTo });
    }
  } catch (e: any) {
    return { error: { message: e?.message || "Falha ao cadastrar" } };
  }

  return { error: { message: "Método de cadastro não disponível (supabase auth)" } };
}

function onAuthStateChangeCompat(cb: (event: string, session: any) => void) {
  if (typeof auth.onAuthStateChange !== "function") return () => {};
  const res = auth.onAuthStateChange((event: any, session: any) => cb(event, session));
  const sub = res?.data?.subscription ?? res?.subscription ?? null;
  return () => sub?.unsubscribe?.();
}

/** =========================
 * UI helpers
 * ========================= */
function getQueryParam(name: string) {
  try {
    const p = new URLSearchParams(window.location.search);
    return p.get(name);
  } catch {
    return null;
  }
}

export default function App() {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
  const isCadastroPage = pathname === "/cadastro";
  const isCheckEmailPage = pathname === "/check-email";

  // login
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [formData, setFormData] = useState({ email: "", password: "" });

  // signup
  const [signupShowPassword, setSignupShowPassword] = useState(false);
  const [signupShowConfirm, setSignupShowConfirm] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [signupData, setSignupData] = useState({
    nome: "",
    email: "",
    telefone: "",
    password: "",
    confirmPassword: "",
  });

  // IMPORTANTE: não travar tela por boot
  const [redirecting, setRedirecting] = useState(false);
  const [booting, setBooting] = useState(false);

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const rawReturnTo = useMemo(() => params.get("returnTo"), [params]);
  const returnTo = useMemo(() => normalizeReturnTo(rawReturnTo), [rawReturnTo]);

  const isLogout = useMemo(() => {
    if (truthyParam(params.get("logout"))) return true;
    if (window.location.pathname === "/logout") return true;

    try {
      const u = new URL(safeReturnTo(rawReturnTo));
      if (truthyParam(u.searchParams.get("logout"))) return true;
    } catch {}

    const raw = rawReturnTo ?? "";
    if (raw.includes("logout%3D1") || raw.includes("logout=1")) return true;

    return false;
  }, [params, rawReturnTo]);

  const redirectToAppWithSession = (session: any) => {
    if (!session || redirecting) return;

    const base = stripHash(stripTokenHash(returnTo));
    if (isSamePage(base)) return;

    const hash =
      `#access_token=${encodeURIComponent(session.access_token)}` +
      `&refresh_token=${encodeURIComponent(session.refresh_token ?? "")}` +
      `&token_type=bearer` +
      `&expires_in=${encodeURIComponent(String(session.expires_in ?? 3600))}`;

    setRedirecting(true);
    window.location.replace(base + hash);
  };

  /** LOGOUT */
  useEffect(() => {
    if (!isLogout) return;

    (async () => {
      setRedirecting(true);
      await signOutCompat();
      clearSupabaseStorageKeys();

      const clean = stripHash(stripTokenHash(stripLogoutParam(returnTo)));
      window.location.replace(isSamePage(clean) ? "/" : clean);
    })();
  }, [isLogout, returnTo]);

  /** BOOT (sem travar UI) */
  useEffect(() => {
    if (isLogout) return;

    let mounted = true;
    setBooting(true);

    (async () => {
      try {
        const session = await getSessionCompat();
        if (!mounted) return;

        if (session) {
          const ok = await validateSessionServerCompat();
          if (!mounted) return;

          if (ok) {
            redirectToAppWithSession(session);
            return;
          }

          // sessão do auth tá ruim -> limpa e deixa no login/cadastro
          await signOutCompat();
          clearSupabaseStorageKeys();
        }
      } finally {
        if (mounted) setBooting(false);
      }
    })();

    const unsub = onAuthStateChangeCompat(async (event, session) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        const ok = await validateSessionServerCompat();
        if (ok && session) redirectToAppWithSession(session);
        return;
      }
    });

    return () => {
      mounted = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnTo, isLogout]);

  /** OAuth (serve pra login e cadastro) */
  const loginOAuth = async (provider: "google" | "facebook" | "apple") => {
    setIsLoading(true);
    setErrorMsg(null);
    setSignupError(null);

    const cleanReturnTo = stripTokenHash(returnTo);
    const redirectBack = `${window.location.origin}/?returnTo=${encodeURIComponent(cleanReturnTo)}`;

    const { error } = await signInOAuthCompat(provider, redirectBack);

    if (error) {
      setErrorMsg(error.message);
      setIsLoading(false);
      return;
    }
    // se não tiver erro, o supabase redireciona pro provider
  };

  /** Email + senha (login) */
  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!formData.email || !formData.password) {
      setErrorMsg("Preencha todos os campos");
      return;
    }

    setIsLoading(true);
    const { error } = await signInPasswordCompat(formData.email, formData.password);
    setIsLoading(false);

    if (error) {
      setErrorMsg(error.message === "Invalid login credentials" ? "Email ou senha incorretos" : error.message);
      return;
    }
  };

  /** Cadastro */
  const handleSubmitCadastro = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError(null);

    const nome = (signupData.nome || "").trim();
    const email = (signupData.email || "").trim();
    const telefone = (signupData.telefone || "").trim();
    const password = signupData.password || "";
    const confirm = signupData.confirmPassword || "";

    if (nome.length < 2) return setSignupError("Nome deve ter no mínimo 2 caracteres");
    if (!email.includes("@")) return setSignupError("Email inválido");
    if (password.length < 6) return setSignupError("Senha deve ter no mínimo 6 caracteres");
    if (password !== confirm) return setSignupError("As senhas não coincidem");

    setSignupLoading(true);

    const cleanReturnTo = stripTokenHash(returnTo);
    const emailRedirectTo = `${window.location.origin}/?returnTo=${encodeURIComponent(cleanReturnTo)}`;

    const res: any = await signUpCompat(
      email,
      password,
      { nome, telefone: telefone || undefined },
      emailRedirectTo
    );

    const err = res?.error;
    const session = res?.data?.session ?? res?.session ?? null;

    setSignupLoading(false);

    if (err) {
      setSignupError(err.message || "Erro ao criar conta");
      return;
    }

    // se por algum motivo já vier sessão (quando confirmação está desligada), segue fluxo normal
    if (session) {
      redirectToAppWithSession(session);
      return;
    }

    // confirmação por e-mail -> manda pra tela de check-email
    const to = `/check-email?email=${encodeURIComponent(email)}&returnTo=${encodeURIComponent(cleanReturnTo)}`;
    window.location.assign(to);
  };

  // Se estiver redirecionando, aí sim tela de loader
  if (redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  /** ====== CHECK EMAIL PAGE ====== */
  if (isCheckEmailPage) {
    const email = getQueryParam("email") || "";
    const cleanReturnTo = stripTokenHash(returnTo);
    const backToLogin = `/?returnTo=${encodeURIComponent(cleanReturnTo)}`;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img src={logoLight} alt="OdontoFlow Lab System" className="h-14 mx-auto mb-4" />
            <p className="text-muted-foreground">Gestão de Próteses Odontológicas</p>
          </div>

          <Card className="border-0 shadow-xl">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-2xl text-center">Confirme seu e-mail</CardTitle>
              <CardDescription className="text-center">
                Enviamos um link de confirmação para{" "}
                <span className="font-medium text-foreground">{email || "seu e-mail"}</span>.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground leading-relaxed">
                Abra sua caixa de entrada e clique no link para ativar sua conta.
                <br />
                Depois disso, você será direcionado automaticamente para o sistema.
              </div>

              <Button className="w-full" variant="outline" onClick={() => (window.location.href = backToLogin)}>
                Voltar para o login
              </Button>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground mt-6">© 2024 OdontoFlow. Todos os direitos reservados.</p>
        </div>
      </div>
    );
  }

  /** ====== CADASTRO PAGE ====== */
  if (isCadastroPage) {
    const cleanReturnTo = stripTokenHash(returnTo);
    const backToLogin = `/?returnTo=${encodeURIComponent(cleanReturnTo)}`;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img src={logoLight} alt="OdontoFlow Lab System" className="h-14 mx-auto mb-4" />
            <p className="text-muted-foreground">Gestão de Próteses Odontológicas</p>
            {booting && (
              <div className="mt-2 text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Verificando sessão…
              </div>
            )}
          </div>

          <Card className="border-0 shadow-xl">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-2xl text-center">Criar conta</CardTitle>
              <CardDescription className="text-center">Escolha como deseja se cadastrar</CardDescription>
            </CardHeader>

            <CardContent>
              <div className="grid grid-cols-3 gap-3 mb-6">
                <Button type="button" variant="outline" disabled={isLoading || signupLoading} onClick={() => loginOAuth("google")}>
                  Google
                </Button>
                <Button type="button" variant="outline" disabled={isLoading || signupLoading} onClick={() => loginOAuth("facebook")}>
                  Facebook
                </Button>
                <Button type="button" variant="outline" disabled={isLoading || signupLoading} onClick={() => loginOAuth("apple")}>
                  Apple
                </Button>
              </div>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">ou cadastre com email</span>
                </div>
              </div>

              <form onSubmit={handleSubmitCadastro} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome completo</Label>
                  <Input
                    id="nome"
                    placeholder="Dr. João Silva"
                    value={signupData.nome}
                    onChange={(e) => setSignupData((p) => ({ ...p, nome: e.target.value }))}
                    disabled={signupLoading}
                    autoComplete="name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="emailCadastro">E-mail</Label>
                  <Input
                    id="emailCadastro"
                    type="email"
                    placeholder="seu@email.com"
                    value={signupData.email}
                    onChange={(e) => setSignupData((p) => ({ ...p, email: e.target.value }))}
                    disabled={signupLoading}
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telefone">Telefone (opcional)</Label>
                  <Input
                    id="telefone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="11999999999"
                    value={signupData.telefone}
                    onChange={(e) => setSignupData((p) => ({ ...p, telefone: e.target.value.replace(/\D/g, "") }))}
                    disabled={signupLoading}
                    maxLength={11}
                    autoComplete="tel"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="senhaCadastro">Senha</Label>
                  <div className="relative">
                    <Input
                      id="senhaCadastro"
                      type={signupShowPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={signupData.password}
                      onChange={(e) => setSignupData((p) => ({ ...p, password: e.target.value }))}
                      disabled={signupLoading}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setSignupShowPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      disabled={signupLoading}
                      aria-label={signupShowPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {signupShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmSenha">Confirmar senha</Label>
                  <div className="relative">
                    <Input
                      id="confirmSenha"
                      type={signupShowConfirm ? "text" : "password"}
                      placeholder="••••••••"
                      value={signupData.confirmPassword}
                      onChange={(e) => setSignupData((p) => ({ ...p, confirmPassword: e.target.value }))}
                      disabled={signupLoading}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setSignupShowConfirm((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      disabled={signupLoading}
                      aria-label={signupShowConfirm ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {signupShowConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full" size="lg" disabled={signupLoading}>
                  {signupLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    "Criar conta"
                  )}
                </Button>

                {signupError ? <p className="text-sm text-destructive">{signupError}</p> : null}
              </form>

              <div className="mt-6 text-center text-sm">
                <span className="text-muted-foreground">Já tem conta? </span>
                <a href={backToLogin} className="text-primary hover:underline font-medium">
                  Entrar
                </a>
              </div>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground mt-6">© 2024 OdontoFlow. Todos os direitos reservados.</p>
        </div>
      </div>
    );
  }

  /** ====== LOGIN PAGE (default) ====== */
  const cadastroHref = `/cadastro?returnTo=${encodeURIComponent(stripTokenHash(returnTo))}`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logoLight} alt="OdontoFlow Lab System" className="h-14 mx-auto mb-4" />
          <p className="text-muted-foreground">Gestão de Próteses Odontológicas</p>
          {booting && (
            <div className="mt-2 text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Verificando sessão…
            </div>
          )}
        </div>

        <Card className="border-0 shadow-xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl text-center">Entrar</CardTitle>
            <CardDescription className="text-center">Digite suas credenciais para acessar</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmitLogin} className="space-y-4">
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
                Google
              </Button>
              <Button type="button" variant="outline" disabled={isLoading} onClick={() => loginOAuth("facebook")}>
                Facebook
              </Button>
              <Button type="button" variant="outline" disabled={isLoading} onClick={() => loginOAuth("apple")}>
                Apple
              </Button>
            </div>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Não tem uma conta? </span>
              <a href={cadastroHref} className="text-primary hover:underline font-medium">
                Cadastre-se
              </a>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">© 2024 OdontoFlow. Todos os direitos reservados.</p>
      </div>
    </div>
  );
}
