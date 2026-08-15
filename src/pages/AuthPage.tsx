import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BrandMark } from "@/components/BrandMark";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/auth";

export default function AuthPage() {
  const { login, register, registrationEnabled } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">(() =>
    registrationEnabled && searchParams.get("mode") === "register"
      ? "register"
      : "login",
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!registrationEnabled) setMode("login");
  }, [registrationEnabled]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (mode === "register" && !registrationEnabled) {
      setError("New accounts are disabled.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") await login(username, password);
      else await register(username, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <section className="relative hidden flex-col gap-16 overflow-hidden border-r p-10 lg:flex">
        <BrandMark />
        <div className="max-w-md space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight">
            Plan projects on a 2D board.
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            Markdown notes, Excalidraw sketches, and links between them. Data
            stays in a local SQLite database.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <BrandMark className="justify-center lg:hidden" />
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl">
                {mode === "login" ? "Welcome back" : "Create account"}
              </CardTitle>
              <CardDescription>
                {mode === "login"
                  ? "Sign in with username"
                  : "Username and password. No email required."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={onSubmit}>
                {error ? (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    placeholder="username"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    placeholder="••••••••"
                    required
                  />
                </div>
                <Button className="w-full" disabled={busy}>
                  {busy
                    ? "Working…"
                    : mode === "login"
                      ? "Sign in"
                      : "Create account"}
                </Button>
              </form>
              {registrationEnabled ? (
                <p className="text-muted-foreground mt-5 text-center text-sm">
                  {mode === "login" ? "Need an account?" : "Already have one?"}{" "}
                  <button
                    type="button"
                    className="text-primary font-medium hover:underline"
                    onClick={() =>
                      setMode(mode === "login" ? "register" : "login")
                    }
                  >
                    {mode === "login" ? "Create an account" : "Sign in"}
                  </button>
                </p>
              ) : (
                <p className="text-muted-foreground mt-5 text-center text-sm">
                  New accounts are disabled.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
