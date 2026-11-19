import { base44 } from "@/api/base44Client";
import { generateCDAPdfClient } from "@/utils/generateCDAClient";

const fmt = (n) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Resolve the app URL for deep links
async function getAppUrl() {
  try {
    const settings = await base44.entities.BrokerageSettings.list();
    if (settings?.[0]?.instance_url) return settings[0].instance_url.replace(/\/$/, "");
  } catch {}
  try {
    const customers = await base44.entities.SaasCustomer.list();
    if (customers?.[0]?.instance_url) return customers[0].instance_url.replace(/\/$/, "");
  } catch {}
  return window.location.origin;
}

// Send admin notification email when a CDA is submitted
export async function sendCDASubmittedEmail(transaction) {
  // The server now emails the office automatically when a CDA is submitted
  // (server/functions/onTransactionCreated.js + sendTransactionStatusEmail.js), so nothing to do here.
  if (transaction) return;
  try {
    const [allUsers, settingsList] = await Promise.all([
      base44.entities.User.list(),
      base44.entities.BrokerageSettings.list(),
    ]);
    const admins = (allUsers || []).filter(u => u.role === "admin" || u.role === "staff");
    if (admins.length === 0) return;

    const settings = settingsList?.[0] || {};
    const brokerageName = settings.brokerage_name || "Back Office";
    const appUrl = await getAppUrl();
    const reviewLink = `${appUrl}/AllTransactions`;
    const customTpl = settings.email_templates?.cda_submitted;

    const replaceVars = (str) => (str || "")
      .replace(/\{\{agent_name\}\}/g, transaction.agent_name || transaction.agent_email || "Unknown")
      .replace(/\{\{property_address\}\}/g, transaction.property_address || "—")
      .replace(/\{\{sale_price\}\}/g, `$${(transaction.sale_price || 0).toLocaleString()}`)
      .replace(/\{\{agent_commission\}\}/g, `$${(transaction.agent_gross_commission || 0).toLocaleString()}`)
      .replace(/\{\{closing_date\}\}/g, transaction.closing_date || "—");

    let emailSubject, emailBody;
    if (customTpl) {
      emailSubject = replaceVars(customTpl.subject);
      emailBody = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; white-space: pre-wrap;">${replaceVars(customTpl.body)}<div style="text-align:center;margin:24px 0;"><a href="${reviewLink}" style="background:#1e3a5f;color:white;padding:12px 28px;text-decoration:none;border-radius:8px;font-weight:bold;">Review CDA &rarr;</a></div></div>`;
    } else {
      emailSubject = `New CDA Submitted — ${transaction.property_address || "Unknown Property"}`;
      emailBody = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1e3a5f;">New CDA Submitted — ${brokerageName}</h2>
  <p style="color: #444;">A new Commission Disbursement Authorization has been submitted and requires your review.</p>
  <div style="background: #f0f7ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 4px;">
    <p style="margin: 0 0 6px;"><strong>Agent:</strong> ${transaction.agent_name || transaction.agent_email || "Unknown"}</p>
    <p style="margin: 0 0 6px;"><strong>Property:</strong> ${transaction.property_address || "—"}</p>
    <p style="margin: 0 0 6px;"><strong>Sale Price:</strong> $${(transaction.sale_price || 0).toLocaleString()}</p>
    <p style="margin: 0 0 6px;"><strong>Agent Commission:</strong> $${(transaction.agent_gross_commission || 0).toLocaleString()}</p>
    <p style="margin: 0;"><strong>Closing Date:</strong> ${transaction.closing_date || "—"}</p>
  </div>
  <div style="text-align: center; margin: 28px 0;"><a href="${reviewLink}" style="background: #1e3a5f; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold;">Review CDA &rarr;</a></div>
</div>`;
    }

    await Promise.all(admins.map(admin =>
      base44.integrations.Core.SendEmail({ to: admin.email, subject: emailSubject, body: emailBody }).catch(() => {})
    ));
  } catch (e) {
    console.error("[CDA submitted email]", e);
  }
}

// Send approval notification email to agent, admins, title company, and referrals
export async function sendCDAApprovedEmail(transaction, settings, approverName, agentProfile) {
  try {
    const brokerageName = settings?.brokerage_name || "Signature Real Estate";
    const brokerageEmail = settings?.email || "";
    const brokeragePhone = settings?.phone || "";
    const brokerageAddress = settings?.address || "";
    const customApprovalTpl = settings?.email_templates?.cda_approved;
    const primaryColor = settings?.primary_color || "#1e3a5f";

    const resolvedAgentEmail = agentProfile?.user_email || transaction.agent_email;
    const appUrl = await getAppUrl();

    // Generate PDF client-side and upload for the email link
    let pdfUrl = null;
    try {
      const enrichedTxn = { ...transaction, approved_by_name: approverName };
      const { blob, filename } = await generateCDAPdfClient(enrichedTxn, settings, agentProfile);
      const file = new File([blob], filename, { type: "application/pdf" });
      const uploaded = await base44.integrations.Core.UploadFile({ file });
      pdfUrl = uploaded?.file_url || null;
      if (pdfUrl) {
        await base44.entities.Transaction.update(transaction.id, { latest_cda_pdf_url: pdfUrl }).catch(() => {});
      }
    } catch (e) {
      console.error("[CDA PDF for approval email]", e);
    }

    const transactionDeepLink = `${appUrl}/MyTransactions?highlight=${transaction.id}`;
    const cdaLinkHtml = `<div style="text-align:center;margin:20px 0;"><a href="${transactionDeepLink}" style="background:${primaryColor};color:white;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">View &amp; Download Signed CDA</a></div>`;

    const approvalReplaceVars = (str) => (str || "")
      .replace(/\{\{agent_name\}\}/g, transaction.agent_name || agentProfile?.full_name || "Agent")
      .replace(/\{\{title_company_name\}\}/g, transaction.title_company_name || "Title Company")
      .replace(/\{\{property_address\}\}/g, transaction.property_address || "—")
      .replace(/\{\{closing_date\}\}/g, transaction.closing_date || "—")
      .replace(/\{\{sale_price\}\}/g, fmt(transaction.sale_price))
      .replace(/\{\{total_commission\}\}/g, fmt(transaction.total_commission_amount))
      .replace(/\{\{agent_net_commission\}\}/g, fmt(transaction.agent_net_commission))
      .replace(/\{\{office_commission\}\}/g, fmt(transaction.company_gross_commission))
      .replace(/\{\{brokerage_email\}\}/g, brokerageEmail || "our office")
      .replace(/\{\{brokerage_name\}\}/g, brokerageName)
      .replace(/\{\{cda_link\}\}/g, cdaLinkHtml);

    const approvalSubject = customApprovalTpl
      ? approvalReplaceVars(customApprovalTpl.subject)
      : `Your CDA has been approved – ${transaction.property_address}`;

    const body = customApprovalTpl
      ? `<div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;padding:24px;white-space:pre-wrap;">${approvalReplaceVars(customApprovalTpl.body)}</div>`
      : `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family: Arial, sans-serif; color: #333; max-width: 650px; margin: 0 auto;">
  <div style="background-color: ${primaryColor}; padding: 24px 32px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 22px;">${brokerageName}</h1>
    <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 13px;">Commission Disbursement Authorization</p>
  </div>
  <div style="background: #fff; padding: 28px 32px; border: 1px solid #e5e7eb; border-top: none;">
    <p>Dear ${transaction.title_company_name || "Title Company"},</p>
    <p>Please find the Commission Disbursement Authorization for the following transaction. Kindly disburse commissions at closing as outlined below.</p>
    <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
      <h3 style="margin: 0 0 16px; color: ${primaryColor}; font-size: 15px;">TRANSACTION DETAILS</h3>
      <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
        <tr><td style="padding: 5px 0; color: #6b7280; width: 50%;">Property Address</td><td style="font-weight: 600;">${transaction.property_address}</td></tr>
        <tr><td style="padding: 5px 0; color: #6b7280;">Closing Date</td><td style="font-weight: 600;">${transaction.closing_date || "—"}</td></tr>
        <tr><td style="padding: 5px 0; color: #6b7280;">Sale Price</td><td style="font-weight: 600;">${fmt(transaction.sale_price)}</td></tr>
        ${transaction.buyer_name ? `<tr><td style="padding: 5px 0; color: #6b7280;">Buyer(s)</td><td style="font-weight: 600;">${transaction.buyer_name}</td></tr>` : ""}
        ${transaction.seller_name ? `<tr><td style="padding: 5px 0; color: #6b7280;">Seller(s)</td><td style="font-weight: 600;">${transaction.seller_name}</td></tr>` : ""}
        ${transaction.title_company_name ? `<tr><td style="padding: 5px 0; color: #6b7280;">Title Representative</td><td style="font-weight: 600;">${transaction.title_company_name}</td></tr>` : ""}
        ${transaction.title_company_email ? `<tr><td style="padding: 5px 0; color: #6b7280;">Title Rep Email</td><td style="font-weight: 600;">${transaction.title_company_email}</td></tr>` : ""}
        ${transaction.title_company_phone ? `<tr><td style="padding: 5px 0; color: #6b7280;">Title Rep Phone</td><td style="font-weight: 600;">${transaction.title_company_phone}</td></tr>` : ""}
      </table>
    </div>
    <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
      <h3 style="margin: 0 0 16px; color: ${primaryColor}; font-size: 15px;">COMMISSION DISBURSEMENT</h3>
      <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
        <tr><td style="padding: 5px 0; color: #6b7280; width: 50%;">Total Commission</td><td style="font-weight: 600;">${transaction.commission_percentage ? `${transaction.commission_percentage}%` : ""} = ${fmt(transaction.total_commission_amount)}</td></tr>
        <tr style="background: #dbeafe;"><td style="padding: 8px; color: #333; font-weight: 700;">Pay to Agent: ${transaction.commission_check_payable_to || transaction.agent_name || transaction.agent_email}</td><td style="padding: 8px; font-weight: 700; font-size: 15px;">${fmt(transaction.agent_net_commission)}</td></tr>
        <tr style="background: ${primaryColor}20;"><td style="padding: 8px; color: #333; font-weight: 700;">Pay to ${brokerageName}</td><td style="padding: 8px; font-weight: 700; font-size: 15px;">${fmt(transaction.company_gross_commission)}</td></tr>
        ${[
          { name: transaction.referral_1_name, amount: transaction.referral_1_amount, address: transaction.referral_1_mailing_address },
          { name: transaction.referral_2_name, amount: transaction.referral_2_amount, address: transaction.referral_2_mailing_address },
          { name: transaction.referral_3_name, amount: transaction.referral_3_amount, address: transaction.referral_3_mailing_address },
          { name: transaction.referral_4_name, amount: transaction.referral_4_amount, address: transaction.referral_4_mailing_address },
        ].filter(r => r.name && r.amount > 0).map(r => `<tr style="background: #fef9c3;"><td style="padding: 8px; color: #333; font-weight: 700;">Pay Referral: ${r.name}${r.address ? `<br><span style="font-weight:400; font-size:11px; color:#6b7280;">Mail to: ${r.address}</span>` : ""}</td><td style="padding: 8px; font-weight: 700; font-size: 15px;">${fmt(r.amount)}</td></tr>`).join("")}
      </table>
    </div>
    <div style="margin: 24px 0; padding: 16px; background: #f0f7ff; border: 1px solid #bfdbfe; border-radius: 8px; text-align: center;">
      <p style="margin: 0 0 12px; font-size: 13px; color: #1e3a5f; font-weight: 600;">Signed CDA Document Ready</p>
      <a href="${transactionDeepLink}" style="display: inline-block; background: ${primaryColor}; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 13px;">View &amp; Download Signed CDA</a>
    </div>
    <p>If you have any questions, please contact us at ${brokerageEmail || "our office"}${brokeragePhone ? ` or call ${brokeragePhone}` : ""}.</p>
    <p>Thank you,<br><strong>${brokerageName}</strong>${brokerageAddress ? `<br><span style="color: #6b7280; font-size: 12px;">${brokerageAddress}</span>` : ""}</p>
  </div>
  <div style="background: #f3f4f6; padding: 12px 32px; border-radius: 0 0 8px 8px; text-align: center;">
    <p style="font-size: 11px; color: #9ca3af; margin: 0;">Approved by ${approverName || "Broker"} on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.</p>
  </div>
</body></html>`;

    // Send to agent
    if (resolvedAgentEmail) {
      await base44.integrations.Core.SendEmail({ to: resolvedAgentEmail, subject: approvalSubject, body }).catch(() => {});
    }

    // Send to admins (cc)
    const allUsers = await base44.entities.User.list();
    const adminEmails = (allUsers || []).filter(u => (u.role === "admin" || u.role === "staff") && u.email !== resolvedAgentEmail).map(u => u.email);
    for (const adminEmail of adminEmails) {
      await base44.integrations.Core.SendEmail({ to: adminEmail, subject: approvalSubject, body }).catch(() => {});
    }

    // Send to referral agents
    try {
      const allAgents = await base44.entities.Agent.list("-created_date", 500);
      const referrals = [
        { name: transaction.referral_1_name, amount: transaction.referral_1_amount },
        { name: transaction.referral_2_name, amount: transaction.referral_2_amount },
        { name: transaction.referral_3_name, amount: transaction.referral_3_amount },
        { name: transaction.referral_4_name, amount: transaction.referral_4_amount },
      ].filter(r => r.name && (r.amount || 0) > 0);
      for (const ref of referrals) {
        const nameLower = ref.name.trim().toLowerCase();
        const refAgent = allAgents.find(a =>
          a.full_name?.toLowerCase() === nameLower ||
          a.company?.toLowerCase() === nameLower ||
          (a.companies || []).some(c => c?.toLowerCase() === nameLower)
        );
        if (refAgent?.user_email && refAgent.user_email !== resolvedAgentEmail) {
          await base44.integrations.Core.SendEmail({ to: refAgent.user_email, subject: approvalSubject, body }).catch(() => {});
        }
      }
    } catch {}

    // Send to title company
    if (transaction.title_company_email) {
      await base44.integrations.Core.SendEmail({ to: transaction.title_company_email, subject: approvalSubject, body }).catch(() => {});
    }
  } catch (e) {
    console.error("[CDA approved email]", e);
  }
}