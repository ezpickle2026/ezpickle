"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/client";
import {
  Badge,
  Button,
  Cell as Td,
  Field,
  Modal,
  PageHeader,
  Row,
  Skeleton,
  Table,
  confirmAction,
  fmtDate,
  inputClass,
  selectClass,
  useMutate,
  useResource,
} from "@/components/admin/ui";

type User = {
  id: string;
  fullName: string;
  email: string;
  mobile: string | null;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
};

const ROLES = ["SUPER_ADMIN", "ADMIN", "STAFF"];

const ROLE_SUMMARY: Record<string, string> = {
  SUPER_ADMIN: "Everything, including staff accounts and business settings.",
  ADMIN: "Day-to-day operations, reports and refunds. No user management.",
  STAFF: "Front desk: bookings, check-in, counter sales, inventory reads.",
};

export default function AdminUsersPage() {
  const { data, loading, reload } = useResource<{ users: User[] }>("/api/admin/users");
  const { run, busy } = useMutate();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    mobile: "",
    role: "STAFF",
    password: "",
    status: "ACTIVE",
  });

  return (
    <div>
      <PageHeader
        title="Users"
        description="Staff accounts and what each role can reach."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} aria-hidden />
            Add user
          </Button>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {ROLES.map((role) => (
          <div key={role} className="rounded-2xl border border-white/10 bg-ink-card/60 p-4">
            <p className="text-sm font-semibold capitalize text-pickle-400">
              {role.replace("_", " ").toLowerCase()}
            </p>
            <p className="mt-1 text-xs text-white/45">{ROLE_SUMMARY[role]}</p>
          </div>
        ))}
      </div>

      {loading && !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Table head={["Name", "Email", "Mobile", "Role", "Last login", "Status", ""]} minWidth={900}>
          {(data?.users ?? []).map((user) => (
            <Row key={user.id}>
              <Td className="font-medium text-white/90">{user.fullName}</Td>
              <Td>{user.email}</Td>
              <Td>{user.mobile ?? "—"}</Td>
              <Td>
                <select
                  className="rounded-lg bg-ink px-2 py-1 text-xs capitalize text-white/80"
                  value={user.role}
                  disabled={busy}
                  onChange={(e) =>
                    run(
                      () =>
                        api(`/api/admin/users/${user.id}`, {
                          method: "PATCH",
                          body: { role: e.target.value },
                        }),
                      { success: "Role updated. Their sessions were revoked.", onDone: reload },
                    )
                  }
                  aria-label={`Role for ${user.fullName}`}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role.replace("_", " ").toLowerCase()}
                    </option>
                  ))}
                </select>
              </Td>
              <Td>{user.lastLoginAt ? fmtDate(user.lastLoginAt) : "Never"}</Td>
              <Td>
                <Badge tone={user.status === "ACTIVE" ? "green" : "neutral"}>
                  {user.status.toLowerCase()}
                </Badge>
              </Td>
              <Td align="right">
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          api(`/api/admin/users/${user.id}`, {
                            method: "PATCH",
                            body: { status: user.status === "ACTIVE" ? "DISABLED" : "ACTIVE" },
                          }),
                        { success: "User updated.", onDone: reload },
                      )
                    }
                  >
                    {user.status === "ACTIVE" ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      if (!confirmAction(`Remove ${user.fullName}? They lose access immediately.`))
                        return;
                      void run(() => api(`/api/admin/users/${user.id}`, { method: "DELETE" }), {
                        success: "User removed.",
                        onDone: reload,
                      });
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </Td>
            </Row>
          ))}
        </Table>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add staff user">
        <div className="space-y-4">
          <Field label="Full name">
            <input
              className={inputClass}
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              className={inputClass}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Mobile">
            <input
              className={inputClass}
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
            />
          </Field>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[13px] font-medium text-white/70">Role</span>
            <select
              className={`${selectClass} w-full`}
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role.replace("_", " ").toLowerCase()}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-white/40">{ROLE_SUMMARY[form.role]}</span>
          </label>
          <Field
            label="Temporary password"
            hint="At least 10 characters. Ask them to change it after their first sign-in."
          >
            <input
              type="text"
              className={inputClass}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <Button
            className="w-full"
            loading={busy}
            disabled={!form.email || !form.fullName || form.password.length < 10}
            onClick={() =>
              run(() => api("/api/admin/users", { body: form }), {
                success: "User created.",
                onDone: async () => {
                  setCreateOpen(false);
                  setForm({ ...form, fullName: "", email: "", mobile: "", password: "" });
                  await reload();
                },
              })
            }
          >
            Create user
          </Button>
        </div>
      </Modal>
    </div>
  );
}
