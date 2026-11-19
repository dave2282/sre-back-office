// Not included in the Base44 export (the "CDA Status Change Notification" automation pointed at it).
// Recreated: emails the agent when their CDA is sent back for corrections or marked paid,
// and the office when a draft is submitted or a corrected CDA is resubmitted.
// (Approval emails are sent by sendApprovalEmail, submission emails by onTransactionCreated.)
export default async (req, base44) => {
  try {
    const { data, old_data } = await req.json();
    if (!data?.agent_email || data.status === old_data?.status) return Response.json({ skipped: true });
    if (!['correction_needed', 'paid', 'submitted'].includes(data.status)) return Response.json({ skipped: true });

    const settings = (await base44.asServiceRole.entities.BrokerageSettings.list())?.[0] || {};

    // Draft → submitted, or resubmitted after corrections: tell the office (new CDAs are handled on create).
    if (data.status === 'submitted') {
      const staff = (await base44.asServiceRole.entities.User.list()).filter(u => (u.role === 'admin' || u.role === 'staff') && u.status === 'active');
      const name = settings.brokerage_name || 'Back Office';
      const review = `${(process.env.APP_URL || settings.instance_url || '').replace(/\/$/, '')}/AllTransactions`;
      const resub = old_data?.status === 'correction_needed';
      await Promise.all(staff.map(u => base44.asServiceRole.integrations.Core.SendEmail({
        to: u.email,
        from_name: name,
        subject: `${resub ? 'CDA Resubmitted' : 'New CDA Submitted'} — ${data.property_address || 'Unknown Property'}`,
        body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#1e3a5f">${resub ? 'CDA resubmitted after corrections' : 'New CDA submitted'} — ${name}</h2>
  <div style="background:#f0f7ff;border-left:4px solid #3b82f6;padding:16px;margin:20px 0;border-radius:4px">
    <p style="margin:0 0 6px"><strong>Agent:</strong> ${data.agent_name || data.agent_email || 'Unknown'}</p>
    <p style="margin:0 0 6px"><strong>Property:</strong> ${data.property_address || '—'}</p>
    <p style="margin:0 0 6px"><strong>Sale Price:</strong> $${(data.sale_price || 0).toLocaleString()}</p>
    <p style="margin:0"><strong>Closing Date:</strong> ${data.closing_date || '—'}</p>
  </div>
  <div style="text-align:center;margin:28px 0"><a href="${review}" style="background:#1e3a5f;color:#fff;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold">Review CDA &rarr;</a></div></div>`,
      }).catch(() => {})));
      return Response.json({ success: true, notified: staff.length });
    }
    const brokerageName = settings.brokerage_name || 'Signature Real Estate';
    const color = settings.primary_color || '#1e3a5f';
    const link = `${(process.env.APP_URL || settings.instance_url || '').replace(/\/$/, '')}/MyTransactions?highlight=${data.id}`;
    const address = data.property_address || 'your transaction';
    const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const isCorrection = data.status === 'correction_needed';
    const subject = isCorrection ? `Action needed: CDA corrections — ${address}` : `Commission paid — ${address}`;
    const inner = isCorrection
      ? `<p>Hi ${data.agent_name || 'there'},</p>
         <p>Your CDA for <strong>${address}</strong> was reviewed and needs a few corrections before it can be approved.</p>
         ${data.correction_notes ? `<div style="background:#fff7ed;border-left:4px solid #f97316;padding:14px;margin:18px 0;border-radius:4px;white-space:pre-wrap">${String(data.correction_notes).replace(/</g, '&lt;')}</div>` : ''}
         <p>Please update and resubmit it in the portal.</p>`
      : `<p>Hi ${data.agent_name || 'there'},</p>
         <p>Your commission for <strong>${address}</strong> has been marked as <strong style="color:#16a34a">paid</strong>.</p>
         <p><strong>Net commission:</strong> ${fmt(data.agent_net_commission)}</p>`;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: data.agent_email,
      from_name: brokerageName,
      subject,
      body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">
  <div style="background:${color};padding:20px 28px;border-radius:8px 8px 0 0"><h2 style="color:#fff;margin:0">${brokerageName}</h2></div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px 28px;border-radius:0 0 8px 8px">${inner}
  <p style="text-align:center;margin:26px 0"><a href="${link}" style="background:${color};color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">View transaction</a></p></div></div>`,
    });
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
};
