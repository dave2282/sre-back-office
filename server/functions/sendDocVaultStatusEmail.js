// Ported from base44/functions/sendDocVaultStatusEmail/entry.ts

export default async (req, base44) => {
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { transaction, settings } = await req.json();
  if (!transaction?.agent_email) return Response.json({ error: 'Missing agent email' }, { status: 400 });

  const brokerageName = settings?.brokerage_name || 'Your Brokerage';
  const address = transaction.property_address || 'your transaction';

  await base44.asServiceRole.integrations.Core.SendEmail({
    to: transaction.agent_email,
    from_name: brokerageName,
    subject: `✅ Document File Completed — ${address}`,
    body: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1e3a5f; margin-bottom: 8px;">Document File Marked as Completed</h2>
  <p style="color: #555; font-size: 15px;">Hi ${transaction.agent_name || 'Agent'},</p>
  <p style="color: #555; font-size: 15px;">
    Your document file for the following transaction has been reviewed and marked as <strong style="color: #16a34a;">Completed</strong>:
  </p>
  <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 20px 0;">
    <p style="margin: 0 0 8px 0; font-size: 15px;"><strong>Property:</strong> ${address}</p>
    ${transaction.closing_date ? `<p style="margin: 0 0 8px 0; font-size: 15px;"><strong>Closing Date:</strong> ${transaction.closing_date}</p>` : ''}
    ${transaction.file_type_name ? `<p style="margin: 0; font-size: 15px;"><strong>File Type:</strong> ${transaction.file_type_name}</p>` : ''}
  </div>
  <p style="color: #555; font-size: 14px;">All required documents have been received and approved. No further action is needed on your part.</p>
  <p style="color: #555; font-size: 14px;">If you have any questions, please contact your office.</p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
  <p style="color: #9ca3af; font-size: 12px;">${brokerageName}</p>
</div>
    `.trim(),
  });

  return Response.json({ success: true });
};
