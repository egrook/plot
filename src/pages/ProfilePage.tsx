import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { BrandMark } from "@/components/BrandMark";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { UserMenu } from "@/components/UserMenu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { safeAvatarSrc } from "@/lib/images";
import { toast, toastFromError } from "@/lib/toast";
import type { Project } from "@/types";

function formatDate(value: number) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(value);
}

function formatDeletedAgo(value: number) {
  const ms = Date.now() - value;
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.round(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
}

export default function ProfilePage() {
  const { user, logout, setUser } = useAuth();
  const navigate = useNavigate();
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashed, setTrashed] = useState<Project[]>([]);
  const [loadingTrash, setLoadingTrash] = useState(false);
  const [purgeId, setPurgeId] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  const purgeTarget = trashed.find((project) => project.id === purgeId);

  if (!user) return null;

  const avatarSrc = safeAvatarSrc(user.avatarUrl);

  async function openTrash() {
    setTrashOpen(true);
    setLoadingTrash(true);
    try {
      const data = await api.listTrash();
      setTrashed(data.projects);
    } catch (err) {
      toastFromError(err, "Could not load trash.");
    } finally {
      setLoadingTrash(false);
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

      <main className="mx-auto w-full max-w-lg space-y-6 px-6 py-10">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <Avatar className="size-12">
                {avatarSrc ? <AvatarImage src={avatarSrc} alt="" /> : null}
                <AvatarFallback className="bg-primary/15 text-primary text-sm">
                  {user.username.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-2xl">{user.username}</CardTitle>
                <CardDescription>Account</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
              <span className="text-muted-foreground">Username</span>
              <span>{user.username}</span>
              <span className="text-muted-foreground">Created</span>
              <span>{formatDate(user.createdAt)}</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" onClick={() => navigate("/dashboard")}>
                Back to projects
              </Button>
              <Button variant="outline" onClick={() => void openTrash()}>
                <Trash2 />
                Trash
              </Button>
              <Button
                variant="destructive"
                onClick={() => logout().then(() => navigate("/login"))}
              >
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Profile image</CardTitle>
            <CardDescription>
              Upload a PNG, JPEG, GIF, or WebP. Remove it to use your initials.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={avatarBusy}
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/png,image/jpeg,image/gif,image/webp";
                input.onchange = () => {
                  const file = input.files?.[0];
                  if (!file) return;
                  setAvatarBusy(true);
                  void api
                    .uploadImage(file)
                    .then((uploaded) =>
                      api.updateProfile({ avatarUrl: uploaded.url }),
                    )
                    .then((data) => {
                      setUser(data.user);
                      toast.success("Profile image updated.");
                    })
                    .catch((err) => {
                      toastFromError(err, "Could not update the profile image.");
                    })
                    .finally(() => setAvatarBusy(false));
                };
                input.click();
              }}
            >
              {avatarBusy ? "Uploading…" : "Upload image"}
            </Button>
            {user.avatarUrl ? (
              <Button
                type="button"
                variant="outline"
                disabled={avatarBusy}
                onClick={() => {
                  setAvatarBusy(true);
                  void api
                    .updateProfile({ avatarUrl: "" })
                    .then((data) => {
                      setUser(data.user);
                      toast.success("Profile image cleared.");
                    })
                    .catch((err) => {
                      toastFromError(err, "Could not update the profile image.");
                    })
                    .finally(() => setAvatarBusy(false));
                }}
              >
                Remove
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Change the password for this account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                if (newPassword !== confirmPassword) {
                  toast.error("New passwords do not match.");
                  return;
                }
                setPasswordBusy(true);
                void api
                  .updatePassword(currentPassword, newPassword)
                  .then(() => {
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                    toast.success("Password updated.");
                  })
                  .catch((err) => {
                    toastFromError(err, "Could not change the password.");
                  })
                  .finally(() => setPasswordBusy(false));
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" disabled={passwordBusy}>
                {passwordBusy ? "Saving…" : "Change password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>

      <Dialog open={trashOpen} onOpenChange={setTrashOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Trash</DialogTitle>
            <DialogDescription>
              Deleted boards stay here until you restore or remove them forever.
            </DialogDescription>
          </DialogHeader>
          {loadingTrash ? (
            <p className="text-muted-foreground text-sm">Loading trash…</p>
          ) : trashed.length === 0 ? (
            <p className="text-muted-foreground text-sm">Trash is empty.</p>
          ) : (
            <div className="thin-scroll max-h-[min(20rem,calc(100dvh-16rem))] space-y-2 overflow-y-auto pr-1">
              {trashed.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{project.name}</p>
                    <p className="text-muted-foreground text-xs">
                      Deleted {formatDeletedAgo(project.deletedAt ?? 0)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void api
                          .restoreProject(project.id)
                          .then(() => {
                            setTrashed((current) =>
                              current.filter((item) => item.id !== project.id),
                            );
                            toast.success("Board restored.");
                          })
                          .catch((err) => {
                            toastFromError(err, "Could not restore that board.");
                          });
                      }}
                    >
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setPurgeId(project.id)}
                    >
                      Delete forever
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(purgeId)}
        title="Delete forever"
        description={
          purgeTarget
            ? `“${purgeTarget.name}” will be permanently removed. This cannot be undone.`
            : "This board will be permanently removed. This cannot be undone."
        }
        confirmLabel="Delete forever"
        busy={purging}
        onOpenChange={(open) => {
          if (!open && !purging) setPurgeId(null);
        }}
        onConfirm={() => {
          if (!purgeId) return;
          setPurging(true);
          void api
            .purgeProject(purgeId)
            .then(() => {
              setTrashed((current) =>
                current.filter((item) => item.id !== purgeId),
              );
              setPurgeId(null);
              toast.success("Board deleted forever.");
            })
            .catch((err) => {
              toastFromError(err, "Could not delete that board.");
            })
            .finally(() => setPurging(false));
        }}
      />
    </div>
  );
}
