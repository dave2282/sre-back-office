import { base44 } from "@/api/base44Client";

/**
 * Resolves a full name for an approver email.
 * Agent roster is readable by every signed-in user, so it is checked first;
 * the users list only works for admins/staff.
 */
export async function resolveApproverName(email) {
  if (!email) return "";

  try {
    const agents = await base44.entities.Agent.filter({ user_email: email });
    const name = agents?.[0]?.full_name;
    if (name) return name;
  } catch {
    /* fall through */
  }

  try {
    const users = await base44.entities.User.list();
    const name = (users || []).find((u) => u.email === email)?.full_name;
    if (name) return name;
  } catch {
    /* fall through */
  }

  return email;
}