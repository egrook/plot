import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { ReactFlowProvider } from "@xyflow/react";
import { ApiError, api } from "@/api";
import { useAuth } from "@/auth";
import { BrandMark } from "@/components/BrandMark";
import { LoadingScreen } from "@/components/LoadingScreen";
import { ReadOnlyBoard } from "@/components/ReadOnlyBoard";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Project, SpaceEdge, SpaceNode } from "@/types";

function PublicBoardInner() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const { user, loading, logout } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [spaces, setSpaces] = useState<SpaceNode[]>([]);
  const [edges, setEdges] = useState<SpaceEdge[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");

  const loadBoard = useCallback(() => {
    if (!slug) return Promise.resolve();
    return api
      .getPublicBoard(slug)
      .then((data) => {
        setProject(data.project);
        setSpaces(data.nodes);
        setEdges(data.edges);
        setCanEdit(data.canEdit);
        setNeedsPassword(false);
        setError("");
      })
      .catch((err) => {
        setProject(null);
        if (err instanceof ApiError && err.passwordRequired) {
          setNeedsPassword(true);
          setError("");
          return;
        }
        setNeedsPassword(false);
        setError(err instanceof Error ? err.message : "Share link not found.");
      });
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    setReady(false);
    setPassword("");
    setUnlockError("");
    loadBoard().finally(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [slug, loadBoard]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (!slug || unlocking) return;
    setUnlocking(true);
    setUnlockError("");
    try {
      await api.unlockPublicBoard(slug, password);
      await loadBoard();
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "Wrong password.");
    } finally {
      setUnlocking(false);
    }
  }

  if (loading || !ready) {
    return <LoadingScreen message="Opening shared board…" />;
  }

  if (needsPassword) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-4">
        <BrandMark />
        <form onSubmit={unlock} className="w-full max-w-sm space-y-4">
          <div className="space-y-1 text-center">
            <h1 className="font-serif text-2xl">This board is locked</h1>
            <p className="text-muted-foreground text-sm">
              Enter the password that came with the link.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="share-password">Password</Label>
            <Input
              id="share-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
              required
            />
          </div>
          {unlockError ? (
            <p className="text-destructive text-sm">{unlockError}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={unlocking || !password}>
            {unlocking ? "Checking…" : "Open board"}
          </Button>
        </form>
        <Button asChild variant="ghost" size="sm">
          <Link to="/">Go to homepage</Link>
        </Button>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
        <BrandMark />
        <p className="text-muted-foreground">
          {error || "This share link is off or does not exist."}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild variant="outline">
            <Link to="/">Go to homepage</Link>
          </Button>
          {user ? null : (
            <Button asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (canEdit) {
    const node = searchParams.get("node");
    const to = node ? `/project/${project.id}?node=${encodeURIComponent(node)}` : `/project/${project.id}`;
    return <Navigate to={to} replace />;
  }

  return (
    <ReadOnlyBoard
      project={project}
      spaces={spaces}
      edges={edges}
      headerLeft={<BrandMark />}
      headerRight={
        user ? (
          <UserMenu username={user.username} onLogout={() => void logout()} />
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link to="/login">Sign in</Link>
          </Button>
        )
      }
    />
  );
}

export default function PublicBoardPage() {
  return (
    <ReactFlowProvider>
      <PublicBoardInner />
    </ReactFlowProvider>
  );
}
