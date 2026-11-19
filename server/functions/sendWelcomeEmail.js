// Ported from base44/functions/sendWelcomeEmail/entry.ts

export default async (req, base44) => {
    try {
        const user = await base44.auth.me();
        if (!user || (user.role !== 'admin' && user.role !== 'staff')) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { agent, settings } = await req.json();

        if (!agent?.user_email) {
            return Response.json({ error: 'Agent email is required' }, { status: 400 });
        }

        const brokerageName = settings?.brokerage_name || 'Signature Real Estate';
        const primaryColor = settings?.primary_color || '#1e3a5f';
        const brokerageEmail = settings?.email || '';
        const brokeragePhone = settings?.phone || '';
        // Portal link: a one-time "set your password" link if they have never signed in, else the login page.
        const login = base44.users.ensureUser(agent.user_email, agent.role === 'admin' ? 'admin' : 'user');
        const appUrl = login.has_password ? `${process.env.APP_URL}/login` : base44.users.setupLink(login);

        const subject = `Welcome to ${brokerageName} – Your Agent Portal Access`;

        const body = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 620px; margin: 0 auto;">

  <div style="background-color: ${primaryColor}; padding: 24px 32px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 22px;">${brokerageName}</h1>
    <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 13px;">Agent Portal</p>
  </div>

  <div style="background: #fff; padding: 28px 32px; border: 1px solid #e5e7eb; border-top: none;">
    <p>Hi ${agent.full_name || 'there'},</p>

    <p>Welcome to <strong>${brokerageName}</strong>! Your agent account has been set up and you now have access to the agent portal.</p>

    <p>You can use the portal to:</p>
    <ul style="font-size: 14px; line-height: 1.8; color: #4b5563;">
      <li>Submit Commission Disbursement Authorizations (CDAs)</li>
      <li>Track your transaction status and commissions</li>
      <li>Access your document vault</li>
      <li>View brokerage resources</li>
    </ul>

    <div style="text-align: center; margin: 28px 0;">
      <a href="${appUrl}" style="display: inline-block; background-color: ${primaryColor}; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">
        ${login.has_password ? 'Access Your Portal' : 'Set Up My Login'}
      </a>
    </div>

    <p style="font-size: 13px; color: #6b7280;">${login.has_password ? 'Sign in' : 'Click the button to create your password, then sign in'} using your email address: <strong>${agent.user_email}</strong></p>

    <p>If you have any questions or need help getting started, don't hesitate to reach out${brokerageEmail ? ` at <a href="mailto:${brokerageEmail}">${brokerageEmail}</a>` : ''}${brokeragePhone ? ` or call ${brokeragePhone}` : ''}.</p>

    <p>We're excited to have you on the team!<br><strong>${brokerageName}</strong></p>
  </div>

  <div style="background: #f3f4f6; padding: 12px 32px; border-radius: 0 0 8px 8px; text-align: center;">
    <p style="font-size: 11px; color: #9ca3af; margin: 0;">This invitation was sent by ${brokerageName}.</p>
  </div>

</body>
</html>`;

        await base44.asServiceRole.integrations.Core.SendEmail({
            to: agent.user_email,
            from_name: brokerageName,
            subject,
            body,
        });

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
};
