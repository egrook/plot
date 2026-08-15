import { useEffect, useState } from "react";
import { Check, Copy, Link2, Lock, Plus, Trash2 } from "lucide-react";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast, toastFromError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type {
  AccessPermission,
  ProjectShare,
  PublicAccess,
  PublicLink,
} from "@/types";

type Props = {
  projectId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function publicUrl(slug: string) {
  return `${window.location.origin}/s/${slug}`;
}

export function ShareProjectDialog({ projectId, open, onOpenChange }: Props) {
  const [shares, setShares] = useState<ProjectShare[]>([]);
  const [links, setLinks] = useState<PublicLink[]>([]);
  const [shareName, setShareName] = useState("");
  const [invitePermission, setInvitePermission] =
    useState<AccessPermission>("edit");
  const [shareError, setShareError] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [newLinkAccess, setNewLinkAccess] = useState<PublicAccess>("view");
  const [newLinkPassword, setNewLinkPassword] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [passwordSlug, setPasswordSlug] = useState<string | null>(null);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    if (!open || !projectId) return;
    setShareError("");
    setShareName("");
    setInvitePermission("edit");
    setCopiedSlug(null);
    setNewLinkPassword("");
    setPasswordSlug(null);
    setPasswordDraft("");
    void api
      .listShares(projectId)
      .then((data) => {
        setShares(data.shares);
        setLinks(data.links);
      })
      .catch((err) => {
        toastFromError(err, "Could not load sharing.");
        setShareError(
          err instanceof Error ? err.message : "Could not load sharing.",
        );
      });
  }, [open, projectId]);

  function copyLink(slug: string) {
    void navigator.clipboard
      .writeText(publicUrl(slug))
      .then(() => {
        setCopiedSlug(slug);
        toast.success("Link copied.");
        window.setTimeout(() => {
          setCopiedSlug((current) => (current === slug ? null : current));
        }, 1600);
      })
      .catch(() => {
        toast.error("Could not copy the link.");
      });
  }

  function createLink() {
    if (!projectId || linkBusy) return;
    setLinkBusy(true);
    setShareError("");
    api
      .createPublicLink(projectId, newLinkAccess, newLinkPassword.trim())
      .then((data) => {
        setLinks((current) => [data.link, ...current]);
        setNewLinkPassword("");
        toast.success(
          data.link.hasPassword
            ? "Locked share link created."
            : "Share link created.",
        );
        void navigator.clipboard
          .writeText(publicUrl(data.link.slug))
          .then(() => setCopiedSlug(data.link.slug))
          .catch(() => undefined);
      })
      .catch((err) => {
        toastFromError(err, "Could not create a share link.");
        setShareError(
          err instanceof Error ? err.message : "Could not create a share link.",
        );
      })
      .finally(() => setLinkBusy(false));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share board</DialogTitle>
          <DialogDescription>
            Invite people by username, or create public links. An optional
            password keeps a link safer to send. Deleting a link retires that
            URL for good.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-muted-foreground text-xs font-medium tracking-[0.12em] uppercase">
            Public links
          </p>
          {links.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No public links yet. Anyone with a link can open the board,
              unless you add a password.
            </p>
          ) : (
            <ScrollArea className={cn(links.length > 2 ? "h-64" : "h-auto")}>
              <div className="space-y-2 pr-3">
              {links.map((link) => (
                <div
                  key={link.slug}
                  className="space-y-2 rounded-lg border px-3 py-2"
                >
                  <div className="flex gap-2">
                    <div className="relative min-w-0 flex-1">
                      <Link2 className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                      <Input
                        readOnly
                        value={publicUrl(link.slug)}
                        className="pr-2 pl-8 font-mono text-xs"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copyLink(link.slug)}
                    >
                      {copiedSlug === link.slug ? <Check /> : <Copy />}
                      {copiedSlug === link.slug ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <select
                      value={link.access}
                      className="border-input bg-background h-7 rounded-md border px-1.5 text-xs"
                      onChange={(event) => {
                        if (!projectId) return;
                        const access = event.target.value as PublicAccess;
                        void api
                          .updatePublicLink(projectId, link.slug, { access })
                          .then((data) => {
                            setLinks((current) =>
                              current.map((item) =>
                                item.slug === link.slug ? data.link : item,
                              ),
                            );
                            toast.success(
                              access === "edit"
                                ? "Signed-in visitors can edit from this link."
                                : "This link is view only.",
                            );
                          })
                          .catch((err) => {
                            toastFromError(err, "Could not update that link.");
                          });
                      }}
                    >
                      <option value="view">View</option>
                      <option value="edit">Edit</option>
                    </select>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {link.hasPassword ? (
                        <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                          <Lock className="size-3" />
                          Locked
                        </span>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => {
                          setPasswordSlug(
                            passwordSlug === link.slug ? null : link.slug,
                          );
                          setPasswordDraft("");
                        }}
                      >
                        {link.hasPassword ? "Change password" : "Add password"}
                      </Button>
                      {link.hasPassword ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          disabled={passwordBusy}
                          onClick={() => {
                            if (!projectId) return;
                            setPasswordBusy(true);
                            void api
                              .updatePublicLink(projectId, link.slug, {
                                password: null,
                              })
                              .then((data) => {
                                setLinks((current) =>
                                  current.map((item) =>
                                    item.slug === link.slug ? data.link : item,
                                  ),
                                );
                                setPasswordSlug(null);
                                toast.success("Password removed.");
                              })
                              .catch((err) => {
                                toastFromError(
                                  err,
                                  "Could not update that link.",
                                );
                              })
                              .finally(() => setPasswordBusy(false));
                          }}
                        >
                          Unlock
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (!projectId) return;
                          void api
                            .deletePublicLink(projectId, link.slug)
                            .then(() => {
                              setLinks((current) =>
                                current.filter((item) => item.slug !== link.slug),
                              );
                              toast.success(
                                "Link deleted. That URL will not work again.",
                              );
                            })
                            .catch((err) => {
                              toastFromError(err, "Could not delete that link.");
                            });
                        }}
                      >
                        <Trash2 />
                        Delete
                      </Button>
                    </div>
                  </div>
                  {passwordSlug === link.slug ? (
                    <form
                      className="flex gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!projectId || passwordBusy) return;
                        const password = passwordDraft.trim();
                        if (password.length < 4) {
                          toast.error("Password must be at least 4 characters.");
                          return;
                        }
                        setPasswordBusy(true);
                        void api
                          .updatePublicLink(projectId, link.slug, { password })
                          .then((data) => {
                            setLinks((current) =>
                              current.map((item) =>
                                item.slug === link.slug ? data.link : item,
                              ),
                            );
                            setPasswordSlug(null);
                            setPasswordDraft("");
                            toast.success("Password saved. Send it separately.");
                          })
                          .catch((err) => {
                            toastFromError(err, "Could not update that link.");
                          })
                          .finally(() => setPasswordBusy(false));
                      }}
                    >
                      <Input
                        type="password"
                        value={passwordDraft}
                        onChange={(event) => setPasswordDraft(event.target.value)}
                        placeholder="New password"
                        autoFocus
                        className="h-8"
                      />
                      <Button type="submit" size="sm" disabled={passwordBusy}>
                        Save
                      </Button>
                    </form>
                  ) : null}
                </div>
              ))}
              </div>
            </ScrollArea>
          )}
          <div className="flex flex-wrap gap-2">
            <select
              value={newLinkAccess}
              onChange={(event) =>
                setNewLinkAccess(event.target.value as PublicAccess)
              }
              className="border-input bg-background h-9 rounded-lg border px-2 text-sm"
            >
              <option value="view">View</option>
              <option value="edit">Edit</option>
            </select>
            <Input
              type="password"
              value={newLinkPassword}
              onChange={(event) => setNewLinkPassword(event.target.value)}
              placeholder="Optional password"
              className="h-9 min-w-0 flex-1"
            />
            <Button
              type="button"
              variant="outline"
              disabled={linkBusy}
              onClick={createLink}
            >
              <Plus />
              {linkBusy ? "Creating…" : "New link"}
            </Button>
          </div>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const username = shareName.trim();
            if (!username || !projectId) return;
            setShareBusy(true);
            setShareError("");
            api
              .addShare(projectId, username, invitePermission)
              .then((data) => {
                setShares((current) => [...current, data.share]);
                setShareName("");
              })
              .catch((err) => {
                setShareError(
                  err instanceof Error ? err.message : "Could not share.",
                );
              })
              .finally(() => setShareBusy(false));
          }}
        >
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium tracking-[0.12em] uppercase">
              Invite someone
            </p>
            <div className="flex gap-2">
              <Input
                value={shareName}
                onChange={(event) => setShareName(event.target.value)}
                placeholder="username"
                autoFocus
              />
              <select
                value={invitePermission}
                onChange={(event) =>
                  setInvitePermission(event.target.value as AccessPermission)
                }
                className="border-input bg-background h-9 rounded-lg border px-2 text-sm"
              >
                <option value="view">View</option>
                <option value="edit">Edit</option>
              </select>
              <Button type="submit" disabled={shareBusy || !shareName.trim()}>
                {shareBusy ? "…" : "Share"}
              </Button>
            </div>
          </div>
        </form>
        {shareError ? (
          <p className="text-destructive text-sm">{shareError}</p>
        ) : null}
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-medium tracking-[0.12em] uppercase">
            People with access
          </p>
          {shares.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Only you can see this board
              {links.length === 0 ? "." : ", plus anyone with a public link."}
            </p>
          ) : (
            <div className="space-y-1">
              {shares.map((share) => (
                <div
                  key={share.userId}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm">
                    {share.username}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <select
                      value={share.permission}
                      className={cn(
                        "border-input bg-background h-7 rounded-md border px-1.5 text-xs",
                      )}
                      onChange={(event) => {
                        if (!projectId) return;
                        const permission = event.target
                          .value as AccessPermission;
                        void api
                          .updateShare(projectId, share.userId, permission)
                          .then(() => {
                            setShares((current) =>
                              current.map((item) =>
                                item.userId === share.userId
                                  ? { ...item, permission }
                                  : item,
                              ),
                            );
                          })
                          .catch((err) => {
                            toastFromError(err, "Could not update permission.");
                          });
                      }}
                    >
                      <option value="view">View</option>
                      <option value="edit">Edit</option>
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (!projectId) return;
                        void api
                          .removeShare(projectId, share.userId)
                          .then(() => {
                            setShares((current) =>
                              current.filter(
                                (item) => item.userId !== share.userId,
                              ),
                            );
                          })
                          .catch((err) => {
                            toastFromError(err, "Could not remove that person.");
                          });
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
