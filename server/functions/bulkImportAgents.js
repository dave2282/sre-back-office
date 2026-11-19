// Ported from base44/functions/bulkImportAgents/entry.ts

export default async (req, base44) => {
  try {
    const user = await base44.auth.me();

    if (user?.role !== 'admin' && user?.role !== 'staff') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { agents } = await req.json();
    if (!Array.isArray(agents) || !agents.length) {
      return Response.json({ error: 'No agents provided' }, { status: 400 });
    }

    // Get existing agents to check for duplicates
    const existingAgents = await base44.asServiceRole.entities.Agent.list("-created_date", 1000) || [];
    const existingEmails = new Set(existingAgents.map(a => a.user_email?.toLowerCase()).filter(Boolean));

    let success = 0, failed = 0, failedNames = [];

    for (const agent of agents) {
      try {
        const record = {};
        if (agent.full_name) record.full_name = agent.full_name.trim();
        if (agent.user_email) record.user_email = agent.user_email.trim();
        if (agent.phone) record.phone = agent.phone.trim();
        if (agent.license_number) record.license_number = agent.license_number.trim();
        if (agent.agent_split_percentage) record.agent_split_percentage = Number(agent.agent_split_percentage);
        if (agent.company_split_percentage) record.company_split_percentage = Number(agent.company_split_percentage);
        if (agent.annual_cap_amount) record.annual_cap_amount = Number(agent.annual_cap_amount);
        record.status = agent.status?.trim() || "active";

        // Check for duplicate email
        if (record.user_email && existingEmails.has(record.user_email.toLowerCase())) {
          failed++;
          failedNames.push(`${agent.full_name || agent.user_email} (duplicate email)`);
          continue;
        }

        await base44.asServiceRole.entities.Agent.create(record);
        if (record.user_email) existingEmails.add(record.user_email.toLowerCase());

        if (agent.user_email) {
          await base44.users.inviteUser(agent.user_email.trim(), "user").catch(() => {});
        }
        success++;
      } catch (err) {
        failed++;
        failedNames.push(agent.full_name || agent.user_email);
      }
    }

    return Response.json({ success, failed, failedNames });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
};
