import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/auth";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Toaster } from "@/components/Toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AdminPage from "@/pages/AdminPage";
import AuthPage from "@/pages/AuthPage";
import DashboardPage from "@/pages/DashboardPage";
import LandingPage from "@/pages/LandingPage";
import ProfilePage from "@/pages/ProfilePage";
import ProjectPage from "@/pages/ProjectPage";
import PublicBoardPage from "@/pages/PublicBoardPage";

function Guard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen message="Opening your desk…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen message="Opening your desk…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <TooltipProvider>
      <div className="h-full">
        <Toaster />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/login"
            element={
              loading ? (
                <LoadingScreen message="Opening your desk…" />
              ) : user ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <AuthPage />
              )
            }
          />
          <Route
            path="/register"
            element={<Navigate to="/login?mode=register" replace />}
          />
          <Route
            path="/dashboard"
            element={
              <Guard>
                <DashboardPage />
              </Guard>
            }
          />
          <Route
            path="/profile"
            element={
              <Guard>
                <ProfilePage />
              </Guard>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminGuard>
                <AdminPage />
              </AdminGuard>
            }
          />
          <Route
            path="/project/:id"
            element={
              <Guard>
                <ProjectPage />
              </Guard>
            }
          />
          <Route path="/s/:slug" element={<PublicBoardPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </TooltipProvider>
  );
}
