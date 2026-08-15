import { useEffect, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { ReactFlowProvider } from "@xyflow/react";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { BrandMark } from "@/components/BrandMark";
import { LoadingScreen } from "@/components/LoadingScreen";
import { ReadOnlyBoard } from "@/components/ReadOnlyBoard";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
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

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    setReady(false);
    api
      .getPublicBoard(slug)
      .then((data) => {
        if (!alive) return;
        setProject(data.project);
        setSpaces(data.nodes);
        setEdges(data.edges);
        setCanEdit(data.canEdit);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Share link not found.");
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  if (loading || !ready) {
    return <LoadingScreen message="Opening shared board…" />;
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
