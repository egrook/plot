import { FormEvent, useEffect, useState } from "react";
import { History, Trash2 } from "lucide-react";
import { api } from "@/api";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast, toastFromError } from "@/lib/toast";
import type { ProjectGraph, ProjectSnapshot } from "@/types";

type Props = {
  projectId: string | null;
  open: boolean;
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
  onBeforeMutate?: () => void;
  onRestore: (data: ProjectGraph) => void;
};

function formatWhen(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export function SnapshotDialog({
  projectId,
  open,
  canEdit,
  onOpenChange,
  onBeforeMutate,
  onRestore,
}: Props) {
  const [snapshots, setSnapshots] = useState<ProjectSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !projectId) return;
    setName("");
    setRestoreId(null);
    setDeleteId(null);
    setLoading(true);
    void api
      .listSnapshots(projectId)
      .then((data) => setSnapshots(data.snapshots))
      .catch((err) => {
        toastFromError(err, "Could not load versions.");
      })
      .finally(() => setLoading(false));
  }, [open, projectId]);

  function saveSnapshot(event: FormEvent) {
    event.preventDefault();
    if (!projectId || saving || !canEdit) return;
    onBeforeMutate?.();
    setSaving(true);
    void api
      .createSnapshot(projectId, name.trim())
      .then((data) => {
        setSnapshots((current) => [data.snapshot, ...current]);
        setName("");
        toast.success("Snapshot saved.");
      })
      .catch((err) => {
        toastFromError(err, "Could not save a snapshot.");
      })
      .finally(() => setSaving(false));
  }

  const restoreTarget = snapshots.find((item) => item.id === restoreId);
  const deleteTarget = snapshots.find((item) => item.id === deleteId);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Versions</DialogTitle>
            <DialogDescription>
              Save a snapshot of this board, or restore an earlier one. Restore
              replaces the current board and keeps a backup.
            </DialogDescription>
          </DialogHeader>

          {canEdit ? (
            <form className="flex gap-2" onSubmit={saveSnapshot}>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Optional name"
                maxLength={120}
              />
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save snapshot"}
              </Button>
            </form>
          ) : null}

          {loading ? (
            <p className="text-muted-foreground text-sm">Loading versions…</p>
          ) : snapshots.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No snapshots yet. Save one before a big change.
            </p>
          ) : (
            <div className="thin-scroll max-h-[min(22rem,calc(100dvh-18rem))] space-y-2 overflow-y-auto pr-1">
              {snapshots.map((snapshot) => (
                <div
                  key={snapshot.id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    <History className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {snapshot.name}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {formatWhen(snapshot.createdAt)}
                        {snapshot.createdBy ? ` · ${snapshot.createdBy}` : ""}
                        {" · "}
                        {snapshot.nodeCount}{" "}
                        {snapshot.nodeCount === 1 ? "space" : "spaces"}
                      </p>
                    </div>
                  </div>
                  {canEdit ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRestoreId(snapshot.id)}
                      >
                        Restore
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        title="Delete snapshot"
                        onClick={() => setDeleteId(snapshot.id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(restoreId)}
        title="Restore this version?"
        description={
          restoreTarget
            ? `The current board will be replaced with “${restoreTarget.name}”. A backup snapshot is saved first.`
            : "The current board will be replaced. A backup snapshot is saved first."
        }
        confirmLabel="Restore"
        busyLabel="Restoring…"
        busy={busy}
        onOpenChange={(next) => {
          if (!next && !busy) setRestoreId(null);
        }}
        onConfirm={() => {
          if (!projectId || !restoreId || busy) return;
          onBeforeMutate?.();
          setBusy(true);
          void api
            .restoreSnapshot(projectId, restoreId)
            .then((data) => {
              setSnapshots((current) => [
                data.backup,
                ...current.filter((item) => item.id !== data.backup.id),
              ]);
              onRestore(data);
              setRestoreId(null);
              onOpenChange(false);
              toast.success("Board restored.");
            })
            .catch((err) => {
              toastFromError(err, "Could not restore that version.");
            })
            .finally(() => setBusy(false));
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete snapshot?"
        description={
          deleteTarget
            ? `“${deleteTarget.name}” will be removed. This cannot be undone.`
            : "This snapshot will be removed."
        }
        confirmLabel="Delete"
        busy={busy}
        onOpenChange={(next) => {
          if (!next && !busy) setDeleteId(null);
        }}
        onConfirm={() => {
          if (!projectId || !deleteId || busy) return;
          setBusy(true);
          void api
            .deleteSnapshot(projectId, deleteId)
            .then(() => {
              setSnapshots((current) =>
                current.filter((item) => item.id !== deleteId),
              );
              setDeleteId(null);
              toast.success("Snapshot deleted.");
            })
            .catch((err) => {
              toastFromError(err, "Could not delete that snapshot.");
            })
            .finally(() => setBusy(false));
        }}
      />
    </>
  );
}
