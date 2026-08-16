import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { BrandMark } from "@/components/BrandMark";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { UserMenu } from "@/components/UserMenu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast, toastFromError } from "@/lib/toast";
import type { AdminUser } from "@/types";

function formatDate(value: number) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(value);
}

export default function AdminPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const deleteTarget = users.find((item) => item.id === deleteId);

  useEffect(() => {
    let alive = true;
    api
      .listAdminUsers()
      .then((data) => {
        if (alive) setUsers(data.users);
      })
      .catch((err) => {
        toastFromError(err, "Could not load users.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!user) return null;

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setCreateBusy(true);
    try {
      const data = await api.createAdminUser(username, password);
      setUsers((current) => [...current, data.user]);
      setUsername("");
      setPassword("");
      toast.success("Account created.");
    } catch (err) {
      toastFromError(err, "Could not create that account.");
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <div className="min-h-svh">
      <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <BrandMark />
          <UserMenu
            username={user.username}
            onLogout={() => logout().then(() => navigate("/login"))}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            The first account is the only admin. Create users or reset passwords
            here.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>New user</CardTitle>
            <CardDescription>
              Username and password. Works even when sign-up is off.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onCreate}>
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="admin-username">Username</Label>
                <Input
                  id="admin-username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="off"
                  placeholder="username"
                  required
                />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="admin-password">Password</Label>
                <Input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" disabled={createBusy}>
                {createBusy ? "Creating…" : "Create"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <CardDescription>
              {loading ? "Loading…" : `${users.length} account${users.length === 1 ? "" : "s"}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading users…</p>
            ) : users.length === 0 ? (
              <p className="text-muted-foreground text-sm">No users yet.</p>
            ) : (
              <div className="thin-scroll max-h-[min(28rem,calc(100dvh-20rem))] divide-y overflow-y-auto">
                {users.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{item.username}</p>
                        {item.isAdmin ? <Badge variant="secondary">Admin</Badge> : null}
                      </div>
                      <p className="text-muted-foreground text-xs">
                        Created {formatDate(item.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setResetPassword("");
                          setResetUser(item);
                        }}
                      >
                        Password
                      </Button>
                      {item.isAdmin ? null : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteId(item.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog
        open={Boolean(resetUser)}
        onOpenChange={(open) => {
          if (!open && !resetBusy) setResetUser(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Set password</DialogTitle>
            <DialogDescription>
              {resetUser
                ? `New password for ${resetUser.username}.`
                : "New password for this account."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!resetUser) return;
              setResetBusy(true);
              void api
                .setAdminUserPassword(resetUser.id, resetPassword)
                .then(() => {
                  setResetUser(null);
                  setResetPassword("");
                  toast.success("Password updated.");
                })
                .catch((err) => {
                  toastFromError(err, "Could not change the password.");
                })
                .finally(() => setResetBusy(false));
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="reset-password">New password</Label>
              <Input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                required
                minLength={6}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={resetBusy}
                onClick={() => setResetUser(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={resetBusy}>
                {resetBusy ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete account"
        description={
          deleteTarget
            ? `“${deleteTarget.username}” and their boards will be permanently removed.`
            : "This account and its boards will be permanently removed."
        }
        confirmLabel="Delete account"
        busy={deleting}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteId(null);
        }}
        onConfirm={() => {
          if (!deleteId) return;
          setDeleting(true);
          void api
            .deleteAdminUser(deleteId)
            .then(() => {
              setUsers((current) => current.filter((item) => item.id !== deleteId));
              setDeleteId(null);
              toast.success("Account deleted.");
            })
            .catch((err) => {
              toastFromError(err, "Could not delete that account.");
            })
            .finally(() => setDeleting(false));
        }}
      />
    </div>
  );
}
