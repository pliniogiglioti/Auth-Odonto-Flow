import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import logoLight from "@/assets/logo-light.png";
import { supabase } from "@/supabaseClient";

/** =========================
 * Brand Icons (SVG inline)
 * ========================= */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="#1877F2" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

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

async function resetPasswordCompat(email: string, redirectTo: string) {
  if (typeof auth.resetPasswordForEmail === "function") {
    return await auth.resetPasswordForEmail(email, { redirectTo });
  }
  if (typeof auth.api?.resetPasswordForEmail === "function") {
    return await auth.api.resetPasswordForEmail(email, { redirectTo });
  }
  return { error: { message: "Recuperação de senha não disponível" } };
}

async function updatePasswordCompat(password: string) {
  if (typeof auth.updateUser === "function") {
    return await auth.updateUser({ password });
  }
  if (typeof auth.update === "function") {
    return await auth.update({ password });
  }
  return { error: { message: "Atualização de senha não disponível" } };
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
  const isRecuperarSenhaPage = pathname === "/recuperar-senha";
  const isNovaSenhaPage = pathname === "/nova-senha";

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

  // recuperar-senha
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  // nova-senha
  const [novaSenha, setNovaSenha] = useState("");
  const [novaSenhaConfirm, setNovaSenhaConfirm] = useState("");
  const [novaSenhaShowPass, setNovaSenhaShowPass] = useState(false);
  const [novaSenhaShowConfirm, setNovaSenhaShowConfirm] = useState(false);
  const [novaSenhaLoading, setNovaSenhaLoading] = useState(false);
  const [novaSenhaError, setNovaSenhaError] = useState<string | null>(null);
  const [novaSenhaSuccess, setNovaSenhaSuccess] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);

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
    // Na página de nova-senha não redireciona: o usuário precisa definir a senha
    if (isNovaSenhaPage) return;

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
  }, [returnTo, isLogout, isNovaSenhaPage]);

  /** RECOVERY — escuta evento PASSWORD_RECOVERY na página /nova-senha */
  useEffect(() => {
    if (!isNovaSenhaPage) return;

    const unsub = onAuthStateChangeCompat((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryReady(true);
      }
    });

    return () => unsub();
  }, [isNovaSenhaPage]);

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

  /** Recuperar senha — envia e-mail */
  const handleSubmitRecuperarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);

    if (!resetEmail.includes("@")) {
      setResetError("Informe um e-mail válido");
      return;
    }

    setResetLoading(true);
    const redirectTo = `${window.location.origin}/nova-senha`;
    const { error } = await resetPasswordCompat(resetEmail, redirectTo);
    setResetLoading(false);

    if (error) {
      setResetError(error.message || "Erro ao enviar e-mail de recuperação");
      return;
    }

    setResetSuccess(true);
  };

  /** Nova senha — salva a nova senha após recovery */
  const handleSubmitNovaSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    setNovaSenhaError(null);

    if (novaSenha.length < 6) {
      setNovaSenhaError("Senha deve ter no mínimo 6 caracteres");
      return;
    }
    if (novaSenha !== novaSenhaConfirm) {
      setNovaSenhaError("As senhas não coincidem");
      return;
    }

    setNovaSenhaLoading(true);
    const { error } = await updatePasswordCompat(novaSenha);
    setNovaSenhaLoading(false);

    if (error) {
      setNovaSenhaError(error.message || "Erro ao atualizar a senha");
      return;
    }

    setNovaSenhaSuccess(true);
    setTimeout(() => {
      window.location.href = `/?returnTo=${encodeURIComponent(returnTo)}`;
    }, 2500);
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

  /** ====== RECUPERAR SENHA PAGE ====== */
  if (isRecuperarSenhaPage) {
    const backToLogin = `/?returnTo=${encodeURIComponent(stripTokenHash(returnTo))}`;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img src={logoLight} alt="OdontoFlow Lab System" className="h-14 mx-auto mb-4" />
            <p className="text-muted-foreground">Gestão de Próteses Odontológicas</p>
          </div>

          <Card className="border-0 shadow-xl">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-2xl text-center">Recuperar senha</CardTitle>
              <CardDescription className="text-center">
                {resetSuccess
                  ? "Verifique sua caixa de entrada"
                  : "Digite seu e-mail para receber o link de redefinição"}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {resetSuccess ? (
                <>
                  <div className="rounded-lg bg-primary/10 p-4 text-sm text-center leading-relaxed text-foreground">
                    Enviamos um link para <span className="font-medium">{resetEmail}</span>.
                    <br />
                    Abra o e-mail e clique no link para criar uma nova senha.
                  </div>
                  <Button className="w-full" variant="outline" onClick={() => (window.location.href = backToLogin)}>
                    Voltar para o login
                  </Button>
                </>
              ) : (
                <form onSubmit={handleSubmitRecuperarSenha} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="resetEmail">E-mail</Label>
                    <Input
                      id="resetEmail"
                      type="email"
                      placeholder="seu@email.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      disabled={resetLoading}
                      autoComplete="email"
                      autoFocus
                    />
                  </div>

                  {resetError && <p className="text-sm text-destructive">{resetError}</p>}

                  <Button type="submit" className="w-full" size="lg" disabled={resetLoading}>
                    {resetLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      "Enviar link de redefinição"
                    )}
                  </Button>

                  <div className="text-center text-sm">
                    <a href={backToLogin} className="text-primary hover:underline">
                      Voltar para o login
                    </a>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground mt-6">© 2024 OdontoFlow. Todos os direitos reservados.</p>
        </div>
      </div>
    );
  }

  /** ====== NOVA SENHA PAGE ====== */
  if (isNovaSenhaPage) {
    const backToLogin = `/?returnTo=${encodeURIComponent(stripTokenHash(returnTo))}`;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img src={logoLight} alt="OdontoFlow Lab System" className="h-14 mx-auto mb-4" />
            <p className="text-muted-foreground">Gestão de Próteses Odontológicas</p>
          </div>

          <Card className="border-0 shadow-xl">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-2xl text-center">Nova senha</CardTitle>
              <CardDescription className="text-center">
                {novaSenhaSuccess
                  ? "Senha atualizada com sucesso!"
                  : recoveryReady
                  ? "Escolha uma nova senha para sua conta"
                  : "Aguardando verificação do link…"}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {novaSenhaSuccess ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-primary/10 p-4 text-sm text-center leading-relaxed text-foreground">
                    Sua senha foi atualizada. Você será redirecionado para o login em instantes.
                  </div>
                  <Button className="w-full" variant="outline" onClick={() => (window.location.href = backToLogin)}>
                    Ir para o login agora
                  </Button>
                </div>
              ) : !recoveryReady ? (
                <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground text-sm">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <p>Validando link de recuperação…</p>
                  <a href={backToLogin} className="text-primary hover:underline text-xs">
                    Voltar para o login
                  </a>
                </div>
              ) : (
                <form onSubmit={handleSubmitNovaSenha} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="novaSenha">Nova senha</Label>
                    <div className="relative">
                      <Input
                        id="novaSenha"
                        type={novaSenhaShowPass ? "text" : "password"}
                        placeholder="••••••••"
                        value={novaSenha}
                        onChange={(e) => setNovaSenha(e.target.value)}
                        disabled={novaSenhaLoading}
                        autoComplete="new-password"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setNovaSenhaShowPass((p) => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        disabled={novaSenhaLoading}
                        aria-label={novaSenhaShowPass ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {novaSenhaShowPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="novaSenhaConfirm">Confirmar nova senha</Label>
                    <div className="relative">
                      <Input
                        id="novaSenhaConfirm"
                        type={novaSenhaShowConfirm ? "text" : "password"}
                        placeholder="••••••••"
                        value={novaSenhaConfirm}
                        onChange={(e) => setNovaSenhaConfirm(e.target.value)}
                        disabled={novaSenhaLoading}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setNovaSenhaShowConfirm((p) => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        disabled={novaSenhaLoading}
                        aria-label={novaSenhaShowConfirm ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {novaSenhaShowConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {novaSenhaError && <p className="text-sm text-destructive">{novaSenhaError}</p>}

                  <Button type="submit" className="w-full" size="lg" disabled={novaSenhaLoading}>
                    {novaSenhaLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      "Salvar nova senha"
                    )}
                  </Button>

                  <div className="text-center text-sm">
                    <a href={backToLogin} className="text-primary hover:underline">
                      Voltar para o login
                    </a>
                  </div>
                </form>
              )}
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
                <Button type="button" variant="outline" disabled={isLoading || signupLoading} onClick={() => loginOAuth("google")} className="flex items-center justify-center gap-2">
                  <GoogleIcon />
                  <span>Google</span>
                </Button>
                <Button type="button" variant="outline" disabled={isLoading || signupLoading} onClick={() => loginOAuth("facebook")} className="flex items-center justify-center gap-2">
                  <FacebookIcon />
                  <span>Facebook</span>
                </Button>
                <Button type="button" variant="outline" disabled={isLoading || signupLoading} onClick={() => loginOAuth("apple")} className="flex items-center justify-center gap-2">
                  <AppleIcon />
                  <span>Apple</span>
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
                <a
                  href={`/recuperar-senha?returnTo=${encodeURIComponent(stripTokenHash(returnTo))}`}
                  className="text-sm text-primary hover:underline"
                >
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
              <Button type="button" variant="outline" disabled={isLoading} onClick={() => loginOAuth("google")} className="flex items-center justify-center gap-2">
                <GoogleIcon />
                <span>Google</span>
              </Button>
              <Button type="button" variant="outline" disabled={isLoading} onClick={() => loginOAuth("facebook")} className="flex items-center justify-center gap-2">
                <FacebookIcon />
                <span>Facebook</span>
              </Button>
              <Button type="button" variant="outline" disabled={isLoading} onClick={() => loginOAuth("apple")} className="flex items-center justify-center gap-2">
                <AppleIcon />
                <span>Apple</span>
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
