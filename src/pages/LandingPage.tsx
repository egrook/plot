import { Link } from "react-router-dom";
import { useAuth } from "@/auth";
import { LoadingScreen } from "@/components/LoadingScreen";
import type { User } from "@/types";
import "./landing.css";

function AuthButtons({
  user,
  registrationEnabled,
  size = "default",
  signInClass,
  registerClass,
}: {
  user: User | null;
  registrationEnabled: boolean;
  size?: "default" | "lg";
  signInClass: string;
  registerClass: string;
}) {
  const lg = size === "lg" ? " btn-lg" : "";
  if (user) {
    return (
      <Link className={`${registerClass}${lg}`} to="/dashboard">
        Dashboard
      </Link>
    );
  }
  return (
    <>
      <Link className={`${signInClass}${lg}`} to="/login">
        Sign in
      </Link>
      {registrationEnabled ? (
        <Link className={`${registerClass}${lg}`} to="/login?mode=register">
          Create account
        </Link>
      ) : null}
    </>
  );
}

function startPath(user: User | null, registrationEnabled: boolean) {
  if (user) return "/dashboard";
  return registrationEnabled ? "/login?mode=register" : "/login";
}

export default function LandingPage() {
  const { user, loading, registrationEnabled } = useAuth();

  if (loading) return <LoadingScreen message="Opening Plot…" />;

  return (
    <div className="landing-page">
      <header className="nav">
        <div className="wrap nav-inner">
          <Link
            className="brand"
            to={user ? "/dashboard" : "/"}
            aria-label={user ? "Go to dashboard" : "Plot"}
            onClick={(event) => {
              if (user) return;
              event.preventDefault();
              event.currentTarget
                .closest(".landing-page")
                ?.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <img
              className="brand-mark"
              src="/favicon.svg"
              alt=""
              width={32}
              height={32}
            />
            <span className="brand-name">Plot</span>
          </Link>
          <nav className="nav-links" aria-label="Page">
            <a href="#product">Product</a>
            <a href="#spaces">Spaces</a>
            <a href="#how">How it works</a>
          </nav>
          <div className="nav-actions">
            <AuthButtons
              user={user}
              registrationEnabled={registrationEnabled}
              signInClass="btn btn-ghost"
              registerClass="btn btn-primary"
            />
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="wrap">
            <p className="eyebrow">
              <span className="eyebrow-dot" />
              A personal project planner
            </p>
            <h1>Plan projects on a 2D board.</h1>
            <p className="hero-lead">
              Markdown notes, Excalidraw sketches, and the links between them.
              Each project is a desk you can pan, zoom, and grow.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary btn-lg" to={startPath(user, registrationEnabled)}>
                {user ? "Open your boards" : "Start a board"}
              </Link>
              <a className="btn btn-outline btn-lg" href="#product">
                See the desk
              </a>
            </div>
            <div className="hero-meta">
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M7 4h10v16H7z" />
                  <path d="M10 8h4M10 12h4M10 16h2" />
                </svg>
                Notes, drawings, and images
              </span>
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="8" cy="12" r="3" />
                  <circle cx="16" cy="8" r="3" />
                  <path d="M10.6 10.4 13.4 8.8" />
                </svg>
                Link anything on the board
              </span>
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="18" cy="8" r="3" />
                  <circle cx="8" cy="16" r="3" />
                  <path d="M15.2 9.8 10.8 14.2" />
                </svg>
                Share a board when you want to
              </span>
            </div>
          </div>
        </section>

        <section className="stage" id="product">
          <div className="wrap">
            <div className="board-shell" aria-hidden="true">
              <div className="board-header">
                <div className="board-header-left">
                  <span className="chip">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M15 18 9 12l6-6" />
                    </svg>
                    Projects
                  </span>
                  <span className="sep" />
                  <span className="board-title">
                    <i /> Kitchen renovation
                  </span>
                </div>
                <div className="board-header-right">
                  <span className="ghost-btn">Share</span>
                  <span className="ghost-btn keep">{user?.username ?? "you"}</span>
                </div>
              </div>
              <div className="board-body">
                <aside className="sidebar">
                  <p className="sidebar-label">Spaces</p>
                  <div className="search-fake">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="11" cy="11" r="6.5" />
                      <path d="m16 16 4 4" />
                    </svg>
                    Search the board
                    <kbd>⌘K</kbd>
                  </div>
                  <div className="space-list">
                    <div className="space-row active">
                      <span className="space-swatch" style={{ background: "#60a5fa" }} />
                      <div>
                        <strong>Mood</strong>
                        <small>Note</small>
                      </div>
                    </div>
                    <div className="space-row">
                      <span className="space-swatch" style={{ background: "#fbbf24" }} />
                      <div>
                        <strong>Layout</strong>
                        <small>Drawing</small>
                      </div>
                    </div>
                    <div className="space-row">
                      <span className="space-swatch" style={{ background: "#34d399" }} />
                      <div>
                        <strong>Reference</strong>
                        <small>Image</small>
                      </div>
                    </div>
                  </div>
                </aside>
                <div className="canvas">
                  <svg className="links" viewBox="0 0 760 520" preserveAspectRatio="none">
                    <path d="M278 160 C 360 160, 400 140, 470 140" />
                    <path d="M153 284 C 153 340, 200 380, 268 380" />
                    <text x="360" y="148">spec</text>
                    <text x="188" y="348">mood</text>
                  </svg>
                  <article className="node node-note selected">
                    <header className="node-head">
                      <div>
                        <span className="badge">Note</span>
                        <h3>Mood</h3>
                      </div>
                      <span className="icon-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M9 4H5v4M15 4h4v4M5 15v4h4M19 15v4h-4" />
                        </svg>
                      </span>
                    </header>
                    <div className="node-body">
                      <h4>Direction</h4>
                      <ul>
                        <li>Warm oak + unlacquered brass</li>
                        <li>Zellige, not subway</li>
                        <li>Keep the window wall empty</li>
                      </ul>
                    </div>
                    <span className="handle handle-r" />
                    <span className="handle handle-b" />
                  </article>
                  <article className="node node-draw">
                    <header className="node-head">
                      <div>
                        <span className="badge">Drawing</span>
                        <h3>Layout</h3>
                      </div>
                      <span className="icon-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M9 4H5v4M15 4h4v4M5 15v4h4M19 15v4h-4" />
                        </svg>
                      </span>
                    </header>
                    <div className="draw-canvas">
                      <svg viewBox="0 0 240 150" width="100%" height="100%" fill="none">
                        <rect x="18" y="18" width="204" height="114" stroke="#a1a1aa" strokeWidth="1.4" />
                        <rect x="18" y="18" width="54" height="42" stroke="#c6a15b" strokeWidth="1.4" />
                        <rect x="168" y="78" width="54" height="54" stroke="#6a8f9a" strokeWidth="1.4" />
                        <path d="M72 90h70" stroke="#e4e4e7" strokeWidth="1.4" strokeLinecap="round" />
                        <circle cx="107" cy="90" r="10" stroke="#c4746e" strokeWidth="1.4" />
                        <path d="M30 128h40M186 30v30" stroke="#71717a" strokeWidth="1.2" />
                      </svg>
                    </div>
                    <span className="handle handle-l" />
                  </article>
                  <article className="node node-image">
                    <header className="node-head">
                      <div>
                        <span className="badge">Image</span>
                        <h3>Reference</h3>
                      </div>
                    </header>
                    <div className="image-canvas">
                      <svg viewBox="0 0 230 120" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
                        <rect width="230" height="120" fill="#1c1917" />
                        <rect x="0" y="70" width="230" height="50" fill="#292524" />
                        <rect x="24" y="38" width="70" height="52" fill="#44403c" />
                        <rect x="102" y="28" width="52" height="62" fill="#3f3f46" />
                        <rect x="162" y="46" width="44" height="44" fill="#57534e" />
                        <rect x="0" y="70" width="230" height="4" fill="#c6a15b" opacity="0.55" />
                      </svg>
                    </div>
                    <span className="handle handle-t" />
                  </article>
                  <div className="toolbar">
                    <span className="btn btn-outline">+ Note</span>
                    <span className="btn btn-outline">+ Drawing</span>
                    <span className="toolbar-hint">N · D · paste an image</span>
                  </div>
                  <div className="minimap">
                    <svg viewBox="0 0 112 76">
                      <rect width="112" height="76" fill="#1a1a1a" />
                      <rect x="10" y="12" width="30" height="26" fill="#3f3f46" />
                      <rect x="62" y="16" width="34" height="24" fill="#3f3f46" />
                      <rect x="36" y="46" width="28" height="18" fill="#3f3f46" />
                      <rect
                        x="28"
                        y="10"
                        width="56"
                        height="42"
                        fill="oklch(0.205 0 0 / 55%)"
                        stroke="oklch(1 0 0 / 20%)"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="features" id="spaces">
          <div className="wrap">
            <p className="section-kicker">Spaces</p>
            <h2 className="section-title">A desk, not a document.</h2>
            <p className="section-copy">
              Notes, drawings, and images sit next to each other. Drag a handle
              when two things belong together. Double-click a card to open it.
            </p>
            <div className="feature-grid">
              <article className="feature">
                <div className="feature-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M7 4h10v16H7z" />
                    <path d="M10 8h4M10 12h4M10 16h2" />
                  </svg>
                </div>
                <div>
                  <h3>Notes</h3>
                  <p>
                    Markdown playgrounds with a live preview. Write the brief next
                    to the sketch it belongs to.
                  </p>
                </div>
              </article>
              <article className="feature">
                <div className="feature-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 16 14 6l4 4-10 10H4v-4z" />
                  </svg>
                </div>
                <div>
                  <h3>Drawings</h3>
                  <p>
                    Full Excalidraw on the card. Floor plans, flows, and the messy
                    thinking that never fits a list.
                  </p>
                </div>
              </article>
              <article className="feature">
                <div className="feature-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="4" y="6" width="16" height="12" rx="2" />
                    <circle cx="9" cy="11" r="1.5" />
                    <path d="m8 16 3-3 2 2 3-4 4 5" />
                  </svg>
                </div>
                <div>
                  <h3>Images</h3>
                  <p>
                    Paste a screenshot or drop a URL. References live on the same
                    board as the work.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="how" id="how">
          <div className="wrap">
            <p className="section-kicker">On the board</p>
            <h2 className="section-title">Grow it in 2D.</h2>
            <p className="section-copy">
              The same shortcuts the app already has. Positions, sizes, writing,
              drawings, and the camera autosave as you go.
            </p>
            <div className="steps">
              <article className="step">
                <span className="kbd">N</span>
                <h3>Drop a note</h3>
                <p>Or press + Note. Double-click the card to write.</p>
              </article>
              <article className="step">
                <span className="kbd">D</span>
                <h3>Sketch it</h3>
                <p>Open Excalidraw in place. The preview stays on the desk.</p>
              </article>
              <article className="step">
                <span className="kbd">drag</span>
                <h3>Draw a link</h3>
                <p>Pull a handle between two spaces. Double-click the line to label it.</p>
              </article>
              <article className="step">
                <span className="kbd">⌘K</span>
                <h3>Find anything</h3>
                <p>Search projects, notes, and drawings from the dashboard or the board.</p>
              </article>
            </div>
          </div>
        </section>

        <section>
          <div className="wrap">
            <p className="section-kicker">Dashboard</p>
            <h2 className="section-title">Open a board. Or start one.</h2>
            <p className="section-copy" style={{ marginBottom: "2rem" }}>
              Projects are color-coded cards. Shared boards sit next to yours.
            </p>
            <div className="desk-grid">
              <Link className="proj-new" to={startPath(user, registrationEnabled)}>
                <span className="plus">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
                <div>
                  <h3 style={{ fontSize: "1.25rem", fontWeight: 500, letterSpacing: "-0.02em" }}>
                    Start a board
                  </h3>
                  <p style={{ marginTop: "0.35rem", color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
                    A fresh 2D space for notes, drawings, and the links between them.
                  </p>
                </div>
              </Link>
              <article className="proj">
                <div className="proj-bar" style={{ background: "var(--color-clay)" }} />
                <div className="proj-body">
                  <h3>Kitchen renovation</h3>
                  <p>Layout, mood, and the contractor brief in one desk.</p>
                  <div className="proj-meta">
                    <span className="badge">3 spaces</span>
                    <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
                      Updated Aug 12
                    </span>
                  </div>
                </div>
              </article>
              <article className="proj">
                <div className="proj-bar" style={{ background: "var(--color-slate)" }} />
                <div className="proj-body">
                  <h3>Summer trip</h3>
                  <p>Itinerary notes next to a hand-drawn route.</p>
                  <div className="proj-meta">
                    <span className="badge">5 spaces</span>
                    <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
                      Updated Aug 4
                    </span>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="close" id="signin">
          <div className="wrap">
            <p className="section-kicker">{user ? "Your desk" : "Get a desk"}</p>
            <h2>Map your work. Write it down. Draw it out.</h2>
            <p>
              {user
                ? "Your boards are waiting on the dashboard."
                : registrationEnabled
                  ? "Create an account. A starter board is waiting."
                  : "Sign in to open your boards."}
            </p>
            <div className="hero-actions">
              <AuthButtons
                user={user}
                registrationEnabled={registrationEnabled}
                size="lg"
                signInClass="btn btn-outline"
                registerClass="btn btn-primary"
              />
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap foot">
          <div className="brand">
            <img className="brand-mark" src="/favicon.svg" alt="" width={32} height={32} />
            <span>Plot · A personal project planner</span>
          </div>
          <span>Notes · drawings · the links between them</span>
        </div>
      </footer>
    </div>
  );
}
