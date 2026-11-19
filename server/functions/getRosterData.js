// Ported from base44/functions/getRosterData/entry.ts

export default async (req, base44) => {
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'staff') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [agents, settingsList, users] = await Promise.all([
      base44.asServiceRole.entities.Agent.list('-created_date', 500),
      base44.asServiceRole.entities.BrokerageSettings.list(),
      base44.asServiceRole.entities.User.list('-created_date', 500),
    ]);

    return Response.json({
      agents: agents || [],
      settings: settingsList?.[0] || null,
      users: (users || []).filter(u => u.has_password || u.last_login_at),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
};
