import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLaboratorioContext } from "@/contexts/LaboratorioContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireLab?: boolean;
  requireAdmin?: boolean; // Rota requer Administrador
}

export function ProtectedRoute({
  children,
  requireLab = true,
  requireAdmin = false,
}: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const {
    laboratorio,
    loading: labLoading,
    initialized,
    permissions,
    hasAccess,
  } = useLaboratorioContext();
  const location = useLocation();

  const AUTH_HUB_URL = "https://auth.flowodonto.com.br/";

  const Spinner = () => (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );

  function ExternalRedirect({ to }: { to: string }) {
    useEffect(() => {
      window.location.replace(to);
    }, [to]);

    return <Spinner />;
  }

  function WaitForSessionThenRedirect({ to }: { to: string }) {
    useEffect(() => {
      const t = window.setTimeout(() => {
        window.location.replace(to);
      }, 1200); // 1.2s para o app consumir o hash e setar user
      return () => window.clearTimeout(t);
    }, [to]);

    return <Spinner />;
  }

  const hasIncomingTokens = () => {
    const h = (window.location.hash || "").toLowerCase();
    return h.includes("access_token=") || h.includes("refresh_token=") || h.includes("token_type=");
  };

  // Aguarda auth
  if (authLoading) return <Spinner />;

  // Sem usuário -> manda pro Auth Hub (login central) e volta pra URL atual do LAB
  if (!user) {
    const returnTo = `${window.location.origin}${location.pathname}${location.search}${location.hash}`;
    const to = `${AUTH_HUB_URL}?returnTo=${encodeURIComponent(returnTo)}`;

    // Se acabou de voltar do Auth Hub com tokens no hash, espera um pouco antes de redirecionar de novo (evita "piscar")
    if (hasIncomingTokens()) {
      return <WaitForSessionThenRedirect to={to} />;
    }

    return <ExternalRedirect to={to} />;
  }

  // Se NÃO requer lab (ex.: setup), não bloqueia por labLoading
  if (!requireLab) {
    // Se já existe lab e o usuário está no setup, manda para home
    if (initialized && laboratorio && location.pathname === "/laboratorio/setup") {
      return <Navigate to="/" replace />;
    }
    return <>{children}</>;
  }

  // Requer lab: aguarda a primeira checagem (e/ou loading)
  if (!initialized || labLoading) return <Spinner />;

  // Requer lab e não tem -> setup
  if (!laboratorio && location.pathname !== "/laboratorio/setup") {
    return <Navigate to="/laboratorio/setup" replace />;
  }

  // Verifica se tem acesso ao laboratório
  if (!hasAccess) {
    return <Navigate to="/laboratorio/setup" replace />;
  }

  // Se a rota requer admin e o usuário não tem permissão
  if (requireAdmin && !permissions.canManageSettings) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
