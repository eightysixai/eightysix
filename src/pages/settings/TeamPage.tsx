import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "../../context/AuthContext";
import { useOrganization } from "../../context/OrganizationContext";
import { getPlanLimits } from "../../lib/billing-plans";
import { supabase } from "../../lib/supabase";

const ROLES = ["admin", "manager", "accountant", "staff", "viewer"] as const;

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  role: z.enum(ROLES),
});
type InviteFormValues = z.infer<typeof inviteSchema>;

interface MemberRow {
  organization_id: string;
  user_id: string;
  role: string;
  status: string;
  invited_email: string | null;
  full_name: string | null;
}

export function TeamPage() {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [orgPlan, setOrgPlan] = useState("free");
  const [loading, setLoading] = useState(true);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: "staff" },
  });

  async function loadMembers() {
    if (!organizationId) return;
    setLoading(true);
    const [{ data: memberRows, error }, { data: orgRow }] = await Promise.all([
      supabase
        .from("organization_members")
        .select("organization_id, user_id, role, status, invited_email")
        .eq("organization_id", organizationId),
      supabase
        .from("organizations")
        .select("plan")
        .eq("id", organizationId)
        .single(),
    ]);
    setOrgPlan(orgRow?.plan ?? "free");
    if (error) {
      setBannerError(error.message);
      setLoading(false);
      return;
    }

    const userIds = (memberRows ?? []).map((m) => m.user_id);
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] };
    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

    setMembers(
      (memberRows ?? []).map((m) => ({
        ...m,
        full_name: nameById.get(m.user_id) ?? null,
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial/refetch load of team members, not a derivation of other state
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const limits = getPlanLimits(orgPlan);
  const atMemberLimit = members.length >= limits.maxMembers;

  const onInvite = handleSubmit(async (values) => {
    setBannerError(null);
    setInviteSuccess(null);
    if (atMemberLimit) {
      setBannerError(
        `Your current plan allows up to ${limits.maxMembers} team member(s). Upgrade in Billing to invite more.`,
      );
      return;
    }
    const { data, error } = await supabase.functions.invoke("invite-member", {
      body: { organizationId, email: values.email, role: values.role },
    });
    if (error || data?.error) {
      setBannerError(error?.message ?? data?.error ?? "Failed to send invite");
      return;
    }
    setInviteSuccess(`Invited ${values.email}`);
    reset({ email: "", role: values.role });
    loadMembers();
  });

  async function handleRoleChange(member: MemberRow, role: string) {
    const { error } = await supabase
      .from("organization_members")
      .update({ role })
      .eq("organization_id", member.organization_id)
      .eq("user_id", member.user_id);
    if (error) setBannerError(error.message);
    else loadMembers();
  }

  async function handleRemove(member: MemberRow) {
    const { error } = await supabase
      .from("organization_members")
      .delete()
      .eq("organization_id", member.organization_id)
      .eq("user_id", member.user_id);
    if (error) setBannerError(error.message);
    else loadMembers();
  }

  return (
    <>
      {bannerError && (
        <p className="form-error" onClick={() => setBannerError(null)}>
          {bannerError}
        </p>
      )}

      <section className="panel">
        <div className="panel-header">
          <h2>Invite a Teammate</h2>
        </div>
        {inviteSuccess && (
          <p style={{ color: "var(--under)", fontSize: 13, marginBottom: 12 }}>
            {inviteSuccess}
          </p>
        )}
        <form onSubmit={onInvite} noValidate>
          <div className="form-row">
            <label>
              Email
              <input type="email" {...register("email")} />
              {errors.email && (
                <span className="form-error">{errors.email.message}</span>
              )}
            </label>
            <label>
              Role
              <select {...register("role")}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r[0].toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || atMemberLimit}
          >
            {isSubmitting ? "Sending…" : "Send Invite"}
          </button>
          {atMemberLimit && (
            <p className="panel-caption" style={{ marginTop: 8 }}>
              You've reached your plan's team member limit (
              {limits.maxMembers}). Upgrade in Billing to invite more.
            </p>
          )}
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Team Members</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name / Email</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="empty-state">
                  Loading…
                </td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-state">
                  No team members yet.
                </td>
              </tr>
            ) : (
              members.map((member) => {
                const isSelf = member.user_id === user?.id;
                const isOwnerRow = member.role === "owner";
                return (
                  <tr key={member.user_id}>
                    <td>{member.full_name ?? member.invited_email ?? "—"}</td>
                    <td>
                      {isOwnerRow ? (
                        "Owner"
                      ) : (
                        <select
                          value={member.role}
                          onChange={(e) =>
                            handleRoleChange(member, e.target.value)
                          }
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r[0].toUpperCase() + r.slice(1)}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      <span
                        className={`status-pill ${member.status === "active" ? "under" : "over"}`}
                      >
                        {member.status}
                      </span>
                    </td>
                    <td>
                      {!isOwnerRow && !isSelf && (
                        <button
                          className="icon-btn"
                          title="Remove"
                          onClick={() => handleRemove(member)}
                        >
                          &times;
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
