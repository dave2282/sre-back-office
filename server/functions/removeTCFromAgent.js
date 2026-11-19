// Ported from base44/functions/removeTCFromAgent/entry.ts

export default async (req, base44) => {
  const user = await base44.auth.me();
  
  if (!user || (user.role !== 'admin' && user.role !== 'staff')) {
    return Response.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { property_address, tc_email } = await req.json();
  
  if (!property_address || !tc_email) {
    return Response.json({ error: 'property_address and tc_email required' }, { status: 400 });
  }

  // Find the transaction by property address
  const transactions = await base44.asServiceRole.entities.Transaction.filter(
    { property_address },
    "-created_date",
    1
  );
  
  if (!transactions || transactions.length === 0) {
    return Response.json({ error: 'Transaction not found' }, { status: 404 });
  }

  const transaction = transactions[0];
  const agent_email = transaction.agent_email;

  // Find the agent record
  const agents = await base44.asServiceRole.entities.Agent.filter(
    { user_email: agent_email },
    "-created_date",
    1
  );
  
  if (!agents || agents.length === 0) {
    return Response.json({ error: 'Agent not found' }, { status: 404 });
  }

  const agent = agents[0];
  const current_tcs = agent.transaction_coordinators || [];
  const updated_tcs = current_tcs.filter(email => email !== tc_email);

  // Update the agent
  await base44.asServiceRole.entities.Agent.update(agent.id, {
    transaction_coordinators: updated_tcs
  });

  return Response.json({ 
    success: true, 
    message: `Removed ${tc_email} as TC from ${agent.full_name}`,
    agent_id: agent.id,
    removed_email: tc_email
  });
};
