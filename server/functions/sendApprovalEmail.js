// Ported from base44/functions/sendApprovalEmail/entry.ts
import { jsPDF } from 'jspdf';

export default async (req, base44) => {
    try {
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { transaction, settings } = await req.json();

        const brokerageName = settings?.brokerage_name || 'Signature Real Estate';
        const brokerageEmail = settings?.email || '';
        const brokeragePhone = settings?.phone || '';
        const brokerageAddress = settings?.address || '';
        const customApprovalTpl = settings?.email_templates?.cda_approved;

        const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // Resolve approver name
        let approvedByName = transaction.approved_by_name || '';
        if (!approvedByName && transaction.approved_by) {
            try {
                const allUsers = await base44.asServiceRole.entities.User.list();
                const approver = (allUsers || []).find(u => u.email === transaction.approved_by);
                approvedByName = approver?.full_name || transaction.approved_by || '';
            } catch {}
        }

        // Fetch agent profile
        let agentProfile = null;
        try {
            const allAgents = await base44.asServiceRole.entities.Agent.list();
            const nameLower = transaction.agent_name?.toLowerCase();
            const payableTo = transaction.commission_check_payable_to?.toLowerCase();
            agentProfile =
                (transaction.agent_email ? allAgents.find(a => a.user_email?.toLowerCase() === transaction.agent_email?.toLowerCase()) : null) ||
                (nameLower ? allAgents.find(a => a.full_name?.toLowerCase() === nameLower) : null) ||
                (payableTo ? allAgents.find(a => a.company?.toLowerCase() === payableTo || (a.companies || []).some(c => c?.toLowerCase() === payableTo)) : null);
        } catch {}

        const resolvedAgentEmail = agentProfile?.user_email || transaction.agent_email;

        // ---- Generate PDF inline ----
        let pdfDownloadUrl = null;
        try {
            const enrichedTxn = { ...transaction, approved_by_name: approvedByName };
            const doc = new jsPDF({ unit: 'mm', format: 'letter' });
            const PW = 215.9, PH = 279.4;
            const ML = 10, MR = 10, contentW = PW - ML - MR;

            const hexToRgb = (hex) => {
                const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
                return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : { r: 30, g: 58, b: 95 };
            };
            const pc = hexToRgb(settings?.primary_color || '#1e3a5f');
            const sc = hexToRgb(settings?.secondary_color || '#c9a84c');

            // Header
            doc.setFillColor(pc.r, pc.g, pc.b);
            doc.rect(0, 0, PW, 30, 'F');

            if (settings?.logo_url) {
                try {
                    const res = await fetch(settings.logo_url);
                    const ab = await res.arrayBuffer();
                    const u8 = new Uint8Array(ab);
                    let bin = ''; for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
                    const b64 = btoa(bin);
                    const ext = settings.logo_url.toLowerCase().includes('.png') ? 'PNG' : 'JPEG';
                    const dataUrl = `data:image/${ext.toLowerCase()};base64,${b64}`;
                    const ip = doc.getImageProperties(dataUrl);
                    const maxH = 22, maxW = 38;
                    const ratio = Math.min(maxW / ip.width, maxH / ip.height);
                    doc.addImage(dataUrl, ext, PW - MR - ip.width * ratio, 4 + (maxH - ip.height * ratio) / 2, ip.width * ratio, ip.height * ratio);
                } catch {}
            }

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(14); doc.setFont(undefined, 'bold');
            doc.text(brokerageName, ML, 12);
            doc.setFontSize(7.5); doc.setFont(undefined, 'normal');
            doc.text('COMMISSION DISBURSEMENT AUTHORIZATION (CDA)', ML, 20);
            if (settings?.address || settings?.phone) {
                const info = [settings?.address, settings?.phone].filter(Boolean).join('  |  ');
                doc.setFontSize(6.5);
                doc.text(info, ML, 26);
            }

            doc.setFillColor(sc.r, sc.g, sc.b);
            doc.rect(0, 30, PW, 2.5, 'F');
            doc.setTextColor(30, 30, 30);
            let y = 38;

            const secHeader = (title) => {
                doc.setFillColor(235, 238, 243);
                doc.rect(ML, y - 3.5, contentW, 6, 'F');
                doc.setFontSize(6.5); doc.setFont(undefined, 'bold');
                doc.setTextColor(pc.r, pc.g, pc.b);
                doc.text(title, ML + 2, y);
                doc.setTextColor(30, 30, 30); doc.setFont(undefined, 'normal');
                y += 5;
            };

            const row = (l1, v1, l2, v2) => {
                doc.setFontSize(6.8);
                doc.setFont(undefined, 'bold'); doc.text(`${l1}:`, ML + 1, y);
                doc.setFont(undefined, 'normal'); doc.text(String(v1 ?? '—'), ML + 48, y);
                if (l2) {
                    doc.setFont(undefined, 'bold'); doc.text(`${l2}:`, ML + 105, y);
                    doc.setFont(undefined, 'normal'); doc.text(String(v2 ?? '—'), ML + 153, y);
                }
                y += 5;
            };

            secHeader('PROPERTY INFORMATION');
            row('Property Address', enrichedTxn.property_address);
            row('Transaction Type', enrichedTxn.working_with || '—', 'Closing Date', enrichedTxn.closing_date || '—');
            row('Sale Price', fmt(enrichedTxn.sale_price), 'Buyer(s)', enrichedTxn.buyer_name || '—');
            row('Seller(s)', enrichedTxn.seller_name || '—', 'Co-Op Agent', enrichedTxn.coop_agent || '—');
            y += 1;

            secHeader('COMMISSION BREAKDOWN');
            row('Agent Gross Comm.', fmt(enrichedTxn.agent_gross_commission), 'Office Gross Comm.', fmt(enrichedTxn.company_gross_commission));
            row('Commission %', enrichedTxn.commission_percentage ? `${enrichedTxn.commission_percentage}%` : '—', 'Total Commission', fmt(enrichedTxn.total_commission_amount));
            if (enrichedTxn.office_split_percentage || enrichedTxn.office_split_flat) {
                row('Office Split %', enrichedTxn.office_split_percentage ? `${enrichedTxn.office_split_percentage}%` : '—', 'Office Split $ (Flat)', fmt(enrichedTxn.office_split_flat));
            }
            if (enrichedTxn.total_referral_amount > 0) row('Total Referral Fees', fmt(enrichedTxn.total_referral_amount));
            if (enrichedTxn.admin_fee_amount > 0) row('Admin Fee $', fmt(enrichedTxn.admin_fee_amount), 'Admin Fee Payable To', enrichedTxn.admin_fee_payable_to || '—');
            if (enrichedTxn.client_concession > 0) row('Client Concession $', fmt(enrichedTxn.client_concession));

            y += 1;
            doc.setFillColor(pc.r, pc.g, pc.b);
            doc.rect(ML, y - 2, contentW, 8, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(7.5); doc.setFont(undefined, 'bold');
            doc.text('AGENT NET COMMISSION:', ML + 2, y + 3.5);
            doc.setFontSize(9);
            doc.text(fmt(enrichedTxn.agent_net_commission), ML + 148, y + 3.8);
            doc.setTextColor(30, 30, 30); doc.setFont(undefined, 'normal');
            y += 10;

            secHeader('CHECK DISBURSEMENT INSTRUCTIONS');
            const agentMailingAddress = enrichedTxn.agent_mailing_address || agentProfile?.mailing_address || '(No address on file)';
            const officeAddress = settings?.address || '(See brokerage settings)';
            const allChecks = [
                { label: 'Agent Commission', payable: enrichedTxn.commission_check_payable_to || enrichedTxn.agent_name || '', address: agentMailingAddress, amount: enrichedTxn.agent_net_commission || 0, color: [220, 233, 255] },
                { label: 'Office / Brokerage', payable: brokerageName, address: officeAddress, amount: enrichedTxn.company_gross_commission || 0, color: [218, 245, 228] },
                ...[
                    { name: enrichedTxn.referral_1_name, amount: enrichedTxn.referral_1_amount, address: enrichedTxn.referral_1_mailing_address },
                    { name: enrichedTxn.referral_2_name, amount: enrichedTxn.referral_2_amount, address: enrichedTxn.referral_2_mailing_address },
                    { name: enrichedTxn.referral_3_name, amount: enrichedTxn.referral_3_amount, address: enrichedTxn.referral_3_mailing_address },
                    { name: enrichedTxn.referral_4_name, amount: enrichedTxn.referral_4_amount, address: enrichedTxn.referral_4_mailing_address },
                ].filter(r => r.name).map(r => ({ label: 'Referral / Split', payable: r.name, address: r.address || '(No address)', amount: r.amount || 0, color: [255, 248, 220] }))
            ];

            doc.setFillColor(pc.r, pc.g, pc.b);
            doc.rect(ML, y - 1, contentW, 5.5, 'F');
            doc.setFontSize(5.8); doc.setFont(undefined, 'bold'); doc.setTextColor(255, 255, 255);
            doc.text('CHECK TYPE', ML + 1, y + 3);
            doc.text('PAYABLE TO', ML + 40, y + 3);
            doc.text('MAIL TO', ML + 98, y + 3);
            doc.text('AMOUNT', ML + 166, y + 3);
            y += 6;

            const lineH = 6.5 * (25.4 / 72) * 1.1;
            for (const chk of allChecks) {
                doc.setFontSize(6.2); doc.setFont(undefined, 'normal');
                const addrLines = doc.splitTextToSize(String(chk.address || ''), 62);
                const payLines = doc.splitTextToSize(String(chk.payable || ''), 52);
                const rowH = Math.max(7, Math.max(addrLines.length, payLines.length) * lineH + 4);
                doc.setFillColor(chk.color[0], chk.color[1], chk.color[2]);
                doc.rect(ML, y - 1, contentW, rowH, 'F');
                doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.15);
                doc.rect(ML, y - 1, contentW, rowH);
                const ty = y + 3;
                doc.setFont(undefined, 'bold'); doc.setTextColor(30, 30, 30);
                doc.text(chk.label, ML + 1, ty);
                doc.setFont(undefined, 'normal');
                payLines.forEach((l, i) => doc.text(l, ML + 40, ty + i * lineH));
                addrLines.forEach((l, i) => doc.text(l, ML + 98, ty + i * lineH));
                doc.setFont(undefined, 'bold');
                doc.text(fmt(chk.amount), ML + 166, ty);
                y += rowH;
            }
            y += 2;

            secHeader('PARTIES & TITLE COMPANY');
            row('Agent Name', enrichedTxn.agent_name || '—', 'Agent Email', enrichedTxn.agent_email || '—');
            row('Title Company', enrichedTxn.title_company_name || '—', 'Title Phone', enrichedTxn.title_company_phone || '—');
            row('Title Email', enrichedTxn.title_company_email || '—');
            y += 1;

            secHeader('AUTHORIZATION');
            y += 2;

            const approvedDate = enrichedTxn.approved_date
                ? new Date(enrichedTxn.approved_date + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

            const sigUrl = settings?.signature_url;
            const sigBoxY = y;

            if (sigUrl) {
                try {
                    const res = await fetch(sigUrl);
                    const ab = await res.arrayBuffer();
                    const u8 = new Uint8Array(ab);
                    let bin = ''; for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
                    const b64 = btoa(bin);
                    const ext = sigUrl.toLowerCase().includes('.png') ? 'PNG' : 'JPEG';
                    doc.addImage(`data:image/${ext.toLowerCase()};base64,${b64}`, ext, ML, sigBoxY, 55, 13);
                } catch {
                    if (approvedByName) {
                        doc.setFont('times', 'bolditalic'); doc.setFontSize(15);
                        doc.setTextColor(pc.r, pc.g, pc.b);
                        doc.text(approvedByName, ML, sigBoxY + 10);
                        doc.setFont(undefined, 'normal'); doc.setTextColor(30, 30, 30);
                    }
                }
            } else if (approvedByName) {
                doc.setFont('times', 'bolditalic'); doc.setFontSize(15);
                doc.setTextColor(pc.r, pc.g, pc.b);
                doc.text(approvedByName, ML, sigBoxY + 10);
                doc.setFont(undefined, 'normal'); doc.setTextColor(30, 30, 30);
            }

            doc.setDrawColor(160, 160, 160);
            doc.line(ML, sigBoxY + 14, ML + 80, sigBoxY + 14);
            doc.setFontSize(6.2); doc.setTextColor(100, 100, 100);
            doc.text('Authorized Broker / Admin Signature', ML, sigBoxY + 18);
            doc.setTextColor(30, 30, 30);

            if (approvedByName) {
                doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setTextColor(50, 50, 50);
                doc.text(`Digitally approved by: ${approvedByName}`, ML + 100, sigBoxY + 7);
                doc.setFont(undefined, 'normal'); doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
                doc.text(`Approval Date: ${approvedDate}`, ML + 100, sigBoxY + 13);
                doc.setTextColor(30, 30, 30);
            }

            // Footer
            const footerY = PH - 14;
            doc.setFillColor(245, 245, 245);
            doc.rect(0, footerY, PW, 14, 'F');
            doc.setFillColor(sc.r, sc.g, sc.b);
            doc.rect(0, footerY, PW, 1, 'F');

            const officeParts = [brokerageName];
            if (settings?.address) officeParts.push(settings.address);
            if (settings?.phone) officeParts.push(settings.phone);
            if (settings?.email) officeParts.push(settings.email);
            if (settings?.website) officeParts.push(settings.website);

            doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
            doc.text(officeParts.join('  ·  '), ML, footerY + 6);
            const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            doc.text(`Generated: ${now}`, ML, footerY + 11);
            doc.setTextColor(sc.r, sc.g, sc.b); doc.setFont(undefined, 'bold');
            doc.text('CONFIDENTIAL – FOR REAL ESTATE CLOSING USE ONLY', PW / 2, footerY + 8.5, { align: 'center' });

            const pdfBytes = doc.output('arraybuffer');
            const uint8 = new Uint8Array(pdfBytes);
            let binary = '';
            const chunkSize = 8192;
            for (let i = 0; i < uint8.length; i += chunkSize) {
                binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
            }
            const base64 = btoa(binary);

            const blob = new Blob([uint8], { type: 'application/pdf' });
            const filename = `CDA_${(enrichedTxn.property_address || 'document').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
            const file = new File([blob], filename, { type: 'application/pdf' });
            const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });
            pdfDownloadUrl = uploaded?.file_url || null;
        } catch (e) {
            console.error('[CDA PDF generation error]', e?.message || e);
        }

        // ---- Build email body ----
        // Resolve app URL from SaasCustomer record so the link is always stable
        let appUrl = process.env.APP_URL || settings?.instance_url || '';
        if (!appUrl) {
          try {
            const customers = await base44.asServiceRole.entities.SaasCustomer.list();
            appUrl = customers?.[0]?.instance_url || '';
          } catch {}
        }
        const transactionDeepLink = appUrl
          ? `${appUrl.replace(/\/$/, '')}/MyTransactions?highlight=${transaction.id}`
          : pdfDownloadUrl || '';
        const cdaLinkHtml = transactionDeepLink
          ? `<div style="text-align:center;margin:20px 0;"><a href="${transactionDeepLink}" style="background:${settings?.primary_color||'#1e3a5f'};color:white;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">View & Download Signed CDA</a></div>`
          : '';

        const approvalReplaceVars = (str) => (str || '')
          .replace(/\{\{agent_name\}\}/g, transaction.agent_name || agentProfile?.full_name || 'Agent')
          .replace(/\{\{title_company_name\}\}/g, transaction.title_company_name || 'Title Company')
          .replace(/\{\{property_address\}\}/g, transaction.property_address || '—')
          .replace(/\{\{closing_date\}\}/g, transaction.closing_date || '—')
          .replace(/\{\{sale_price\}\}/g, fmt(transaction.sale_price))
          .replace(/\{\{total_commission\}\}/g, fmt(transaction.total_commission_amount))
          .replace(/\{\{agent_net_commission\}\}/g, fmt(transaction.agent_net_commission))
          .replace(/\{\{office_commission\}\}/g, fmt(transaction.company_gross_commission))
          .replace(/\{\{brokerage_email\}\}/g, brokerageEmail || 'our office')
          .replace(/\{\{brokerage_name\}\}/g, brokerageName)
          .replace(/\{\{cda_link\}\}/g, cdaLinkHtml);

        const approvalSubject = customApprovalTpl
          ? approvalReplaceVars(customApprovalTpl.subject)
          : `Your CDA has been approved – ${transaction.property_address}`;

        const customBodyProcessed = approvalReplaceVars(customApprovalTpl?.body || '');
        const customBodyWithPdf = customApprovalTpl
          ? (customBodyProcessed.includes(cdaLinkHtml) || !pdfDownloadUrl
              ? customBodyProcessed
              : customBodyProcessed + `\n\n${cdaLinkHtml}`)
          : null;

        const body = customApprovalTpl ? `<div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;padding:24px;white-space:pre-wrap;">${customBodyWithPdf}</div>` : `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 650px; margin: 0 auto;">

  <div style="background-color: ${settings?.primary_color || '#1e3a5f'}; padding: 24px 32px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 22px;">${brokerageName}</h1>
    <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 13px;">Commission Disbursement Authorization</p>
  </div>

  <div style="background: #fff; padding: 28px 32px; border: 1px solid #e5e7eb; border-top: none;">
    <p>Dear ${transaction.title_company_name || 'Title Company'},</p>
    <p>Please find the Commission Disbursement Authorization for the following transaction. Kindly disburse commissions at closing as outlined below.</p>

    <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
      <h3 style="margin: 0 0 16px; color: ${settings?.primary_color || '#1e3a5f'}; font-size: 15px;">TRANSACTION DETAILS</h3>
      <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
        <tr><td style="padding: 5px 0; color: #6b7280; width: 50%;">Property Address</td><td style="font-weight: 600;">${transaction.property_address}</td></tr>
        <tr><td style="padding: 5px 0; color: #6b7280;">Closing Date</td><td style="font-weight: 600;">${transaction.closing_date || '—'}</td></tr>
        <tr><td style="padding: 5px 0; color: #6b7280;">Sale Price</td><td style="font-weight: 600;">${fmt(transaction.sale_price)}</td></tr>
        ${transaction.buyer_name ? `<tr><td style="padding: 5px 0; color: #6b7280;">Buyer(s)</td><td style="font-weight: 600;">${transaction.buyer_name}</td></tr>` : ''}
        ${transaction.seller_name ? `<tr><td style="padding: 5px 0; color: #6b7280;">Seller(s)</td><td style="font-weight: 600;">${transaction.seller_name}</td></tr>` : ''}
        ${transaction.title_company_name ? `<tr><td style="padding: 5px 0; color: #6b7280;">Title Representative</td><td style="font-weight: 600;">${transaction.title_company_name}</td></tr>` : ''}
        ${transaction.title_company_email ? `<tr><td style="padding: 5px 0; color: #6b7280;">Title Rep Email</td><td style="font-weight: 600;">${transaction.title_company_email}</td></tr>` : ''}
        ${transaction.title_company_phone ? `<tr><td style="padding: 5px 0; color: #6b7280;">Title Rep Phone</td><td style="font-weight: 600;">${transaction.title_company_phone}</td></tr>` : ''}
      </table>
    </div>

    <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
      <h3 style="margin: 0 0 16px; color: ${settings?.primary_color || '#1e3a5f'}; font-size: 15px;">COMMISSION DISBURSEMENT</h3>
      <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
        <tr><td style="padding: 5px 0; color: #6b7280; width: 50%;">Total Commission</td><td style="font-weight: 600;">${transaction.commission_percentage ? `${transaction.commission_percentage}%` : ''} = ${fmt(transaction.total_commission_amount)}</td></tr>
        <tr style="background: #dbeafe;"><td style="padding: 8px; color: #333; font-weight: 700;">Pay to Agent: ${transaction.commission_check_payable_to || transaction.agent_name || transaction.agent_email}</td><td style="padding: 8px; font-weight: 700; font-size: 15px;">${fmt(transaction.agent_net_commission)}</td></tr>
        <tr style="background: ${settings?.primary_color || '#1e3a5f'}20;"><td style="padding: 8px; color: #333; font-weight: 700;">Pay to ${brokerageName}</td><td style="padding: 8px; font-weight: 700; font-size: 15px;">${fmt(transaction.company_gross_commission)}</td></tr>
        ${[
            { name: transaction.referral_1_name, amount: transaction.referral_1_amount, address: transaction.referral_1_mailing_address },
            { name: transaction.referral_2_name, amount: transaction.referral_2_amount, address: transaction.referral_2_mailing_address },
            { name: transaction.referral_3_name, amount: transaction.referral_3_amount, address: transaction.referral_3_mailing_address },
            { name: transaction.referral_4_name, amount: transaction.referral_4_amount, address: transaction.referral_4_mailing_address },
        ].filter(r => r.name && r.amount > 0).map(r => `
        <tr style="background: #fef9c3;">
          <td style="padding: 8px; color: #333; font-weight: 700;">Pay Referral: ${r.name}${r.address ? `<br><span style="font-weight:400; font-size:11px; color:#6b7280;">Mail to: ${r.address}</span>` : ''}</td>
          <td style="padding: 8px; font-weight: 700; font-size: 15px;">${fmt(r.amount)}</td>
        </tr>`).join('')}
      </table>
    </div>

    ${transactionDeepLink ? `
    <div style="margin: 24px 0; padding: 16px; background: #f0f7ff; border: 1px solid #bfdbfe; border-radius: 8px; text-align: center;">
      <p style="margin: 0 0 12px; font-size: 13px; color: #1e3a5f; font-weight: 600;">📄 Signed CDA Document Ready</p>
      <a href="${transactionDeepLink}" style="display: inline-block; background: ${settings?.primary_color || '#1e3a5f'}; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 13px;">View & Download Signed CDA</a>
    </div>
    ` : ''}

    <p>If you have any questions, please contact us at ${brokerageEmail || 'our office'}${brokeragePhone ? ` or call ${brokeragePhone}` : ''}.</p>
    <p>Thank you,<br><strong>${brokerageName}</strong>${brokerageAddress ? `<br><span style="color: #6b7280; font-size: 12px;">${brokerageAddress}</span>` : ''}</p>
  </div>

  <div style="background: #f3f4f6; padding: 12px 32px; border-radius: 0 0 8px 8px; text-align: center;">
    <p style="font-size: 11px; color: #9ca3af; margin: 0;">Approved by ${approvedByName || 'Broker'} on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.</p>
  </div>

</body>
</html>`;

        await base44.asServiceRole.integrations.Core.SendEmail({
            to: resolvedAgentEmail,
            subject: approvalSubject,
            body,
        });

        const allUsersForAdmin = await base44.asServiceRole.entities.User.list();
        const adminEmails = (allUsersForAdmin || []).filter(u => u.role === 'admin' && u.email !== resolvedAgentEmail).map(u => u.email);
        for (const adminEmail of adminEmails) {
            await base44.asServiceRole.integrations.Core.SendEmail({
                to: adminEmail,
                subject: approvalSubject,
                body,
            }).catch(() => {});
        }

        try {
            const allAgentsForReferral = await base44.asServiceRole.entities.Agent.list();
            const referrals = [
                { name: transaction.referral_1_name, amount: transaction.referral_1_amount },
                { name: transaction.referral_2_name, amount: transaction.referral_2_amount },
                { name: transaction.referral_3_name, amount: transaction.referral_3_amount },
                { name: transaction.referral_4_name, amount: transaction.referral_4_amount },
            ].filter(r => r.name && (r.amount || 0) > 0);

            for (const ref of referrals) {
                const nameLower = ref.name.trim().toLowerCase();
                const refAgent = allAgentsForReferral.find(a =>
                    a.full_name?.toLowerCase() === nameLower ||
                    a.company?.toLowerCase() === nameLower ||
                    (a.companies || []).some(c => c?.toLowerCase() === nameLower)
                );
                if (refAgent?.user_email && refAgent.user_email !== resolvedAgentEmail) {
                    await base44.asServiceRole.integrations.Core.SendEmail({
                        to: refAgent.user_email,
                        subject: approvalSubject,
                        body,
                    }).catch(() => {});
                }
            }
        } catch {}

        if (transaction.title_company_email) {
            await base44.asServiceRole.integrations.Core.SendEmail({
                to: transaction.title_company_email,
                subject: approvalSubject,
                body,
            }).catch(() => {});
        }

        return Response.json({ success: true, pdf_url: pdfDownloadUrl });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
};
