// Ported from base44/functions/generateCDA/entry.ts
import { jsPDF } from 'jspdf';

export default async (req, base44) => {
    try {
        const { transaction, settings, agentProfile } = await req.json();

        const doc = new jsPDF({ unit: 'mm', format: 'letter' }); // 215.9 x 279.4mm
        const PW = 215.9, PH = 279.4;
        const ML = 10, MR = 10, contentW = PW - ML - MR;
        const brokerageName = settings?.brokerage_name || 'Signature Real Estate';

        const hexToRgb = (hex) => {
            const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
            return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : { r: 30, g: 58, b: 95 };
        };
        const pc = hexToRgb(settings?.primary_color || '#1e3a5f');
        const sc = hexToRgb(settings?.secondary_color || '#c9a84c');
        const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // ---- HEADER (30mm) ----
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
            } catch (e) { /* skip */ }
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

        // Helpers
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

        // ---- PROPERTY ----
        secHeader('PROPERTY INFORMATION');
        row('Property Address', transaction.property_address);
        row('Transaction Type', transaction.working_with || '—', 'Closing Date', transaction.closing_date || '—');
        row('Sale Price', fmt(transaction.sale_price), 'Buyer(s)', transaction.buyer_name || '—');
        row('Seller(s)', transaction.seller_name || '—', 'Co-Op Agent', transaction.coop_agent || '—');
        y += 1;

        // ---- COMMISSION ----
        secHeader('COMMISSION BREAKDOWN');
        row('Agent Gross Comm.', fmt(transaction.agent_gross_commission), 'Office Gross Comm.', fmt(transaction.company_gross_commission));
        row('Commission %', transaction.commission_percentage ? `${transaction.commission_percentage}%` : '—', 'Total Commission', fmt(transaction.total_commission_amount));
        if (transaction.office_split_percentage || transaction.office_split_flat) {
            row('Office Split %', transaction.office_split_percentage ? `${transaction.office_split_percentage}%` : '—', 'Office Split $ (Flat)', fmt(transaction.office_split_flat));
        }
        if (transaction.total_referral_amount > 0) row('Total Referral Fees', fmt(transaction.total_referral_amount));
        if (transaction.admin_fee_amount > 0) row('Admin Fee $', fmt(transaction.admin_fee_amount), 'Admin Fee Payable To', transaction.admin_fee_payable_to || '—');
        if (transaction.client_concession > 0) row('Client Concession $', fmt(transaction.client_concession));

        // Net highlight bar
        y += 1;
        doc.setFillColor(pc.r, pc.g, pc.b);
        doc.rect(ML, y - 2, contentW, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7.5); doc.setFont(undefined, 'bold');
        doc.text('AGENT NET COMMISSION:', ML + 2, y + 3.5);
        doc.setFontSize(9);
        doc.text(fmt(transaction.agent_net_commission), ML + 148, y + 3.8);
        doc.setTextColor(30, 30, 30); doc.setFont(undefined, 'normal');
        y += 10;

        // ---- CHECK DISBURSEMENT ----
        secHeader('CHECK DISBURSEMENT INSTRUCTIONS');
        const agentMailingAddress = transaction.agent_mailing_address || agentProfile?.mailing_address || '(No address on file)';
        const officeAddress = settings?.address || '(See brokerage settings)';
        const allChecks = [
            { label: 'Agent Commission', payable: transaction.commission_check_payable_to || transaction.agent_name || '', address: agentMailingAddress, amount: transaction.agent_net_commission || 0, color: [220, 233, 255] },
            { label: 'Office / Brokerage', payable: settings?.brokerage_name || brokerageName, address: officeAddress, amount: transaction.company_gross_commission || 0, color: [218, 245, 228] },
            ...[
                { name: transaction.referral_1_name, amount: transaction.referral_1_amount, address: transaction.referral_1_mailing_address },
                { name: transaction.referral_2_name, amount: transaction.referral_2_amount, address: transaction.referral_2_mailing_address },
                { name: transaction.referral_3_name, amount: transaction.referral_3_amount, address: transaction.referral_3_mailing_address },
                { name: transaction.referral_4_name, amount: transaction.referral_4_amount, address: transaction.referral_4_mailing_address },
            ].filter(r => r.name).map(r => ({ label: 'Referral / Split', payable: r.name, address: r.address || '(No address)', amount: r.amount || 0, color: [255, 248, 220] }))
        ];

        // Table header
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

        // ---- TITLE & PARTIES ----
        secHeader('PARTIES & TITLE COMPANY');
        row('Agent Name', transaction.agent_name || '—', 'Agent Email', transaction.agent_email || '—');
        row('Title Company', transaction.title_company_name || '—', 'Title Phone', transaction.title_company_phone || '—');
        row('Title Email', transaction.title_company_email || '—');
        y += 1;

        // ---- ADMIN SIGNATURE ONLY ----
        secHeader('AUTHORIZATION');
        y += 2;

        const approvedByName = transaction.approved_by_name || transaction.approved_by || '';
        const approvedDate = transaction.approved_date
            ? new Date(transaction.approved_date + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
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
            } catch (e) {
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

        // ---- FOOTER ----
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
        doc.setFont(undefined, 'normal'); doc.setTextColor(30, 30, 30);

        const pdfBytes = doc.output('arraybuffer');
        const uint8 = new Uint8Array(pdfBytes);
        let binary = '';
        for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
        const base64 = btoa(binary);

        return Response.json({ pdf_base64: base64, filename: `CDA_${(transaction.property_address || 'document').replace(/[^a-zA-Z0-9]/g, '_')}.pdf` });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
};
