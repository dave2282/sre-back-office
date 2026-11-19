import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, ListChecks, CheckCircle2, XCircle, Eye } from "lucide-react";

export default function FolderAuditPanel({ recordId, recordDocs, requiredDocs, useFileTypeDocs, onResults, onReload }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);

  const handleAudit = async () => {
    setLoading(true);
    try {
      // Fetch learning feedback to improve matching
      const feedback = await base44.entities.DocumentFeedback.list("-created_date", 100);
      const feedbackContext = feedback?.length > 0
        ? `\n\nLearning from past admin approvals:\n${feedback.map(f => `- Document "${f.document_name}" was categorized as "${f.document_category}"`).join('\n')}`
        : '';
      
      const docList = recordDocs.map(d => ({ id: d.id, name: d.name, category: d.category }));
      const checklistItems = requiredDocs.map(r => useFileTypeDocs ? r : r.replace(/_/g, ' '));

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are auditing a real estate transaction file. Match each checklist item to the best uploaded document using SEMANTIC and FUZZY matching.

MATCHING RULES:
- Ignore parenthetical qualifiers like "(If Applicable)", "(If Built Prior 1978)", "(If Required)", etc. — only match on the core concept.
- Match by MEANING, not exact wording. Examples:
  * "Lead-Based Paint Disclosure" matches "Lead Based Paint (If Built Prior 1978)"
  * "Purchase Agreement" matches "Contract to Buy and Sell" or "Sales Contract"
  * "Earnest Money" matches "EMD Receipt" or "Earnest Money Receipt"
  * "HOA" matches "Homeowners Association Disclosure"
  * "Property Disclosure" matches "Seller's Property Disclosure"
- Be VERY generous — if a document is clearly the same type of form, mark it as matched.
- Partial keyword overlap is sufficient for a match.

Checklist items:
${checklistItems.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Uploaded documents:
${docList.map((d, i) => `${i + 1}. id="${d.id}" name="${d.name}" category="${d.category || 'other'}"`).join('\n')}

For each checklist item, return matched=true and the best matching doc_id if ANY reasonable match exists.${feedbackContext}`,
        response_json_schema: {
          type: 'object',
          properties: {
            matches: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  checklist_item: { type: 'string' },
                  matched: { type: 'boolean' },
                  doc_id: { type: 'string' }
                }
              }
            }
          }
        }
      });

      const auditResults = (result?.matches || []).map(m => ({
        checklistItem: m.checklist_item,
        matched: m.matched,
        matchedDoc: recordDocs.find(d => d.id === m.doc_id) || null,
      }));

      // Auto-mark matched documents as AI Approved (unless already manually approved) and rename to match checklist item
      await Promise.all(
        auditResults
          .filter(r => r.matched && r.matchedDoc)
          .map(r => {
            const newStatus = r.matchedDoc.file_status === 'approved' ? 'approved' : 'ai_approved';
            return base44.entities.Document.update(r.matchedDoc.id, {
              file_status: newStatus,
              name: r.checklistItem,
            });
          })
      );

      setResults(auditResults);
      onResults(auditResults);
      if (onReload) await onReload();
    } catch (err) {
      console.error('Audit failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs gap-1.5 text-indigo-700 border-indigo-300 hover:bg-indigo-50"
        disabled={loading}
        onClick={async (e) => {
          e.stopPropagation();
          await handleAudit();
          setOpen(true);
        }}
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ListChecks className="w-3.5 h-3.5" />}
        Audit
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ListChecks className="w-5 h-5 text-indigo-600" /> Audit Results</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2 max-h-96 overflow-y-auto">
            {(results || []).map((r, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${r.matched ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                {r.matched
                  ? <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  : <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{r.checklistItem}</p>
                  {r.matched && r.matchedDoc && (
                    <p className="text-xs text-green-700 mt-0.5 truncate">→ {r.matchedDoc.name}</p>
                  )}
                  {!r.matched && <p className="text-xs text-red-500 mt-0.5">No matching document found</p>}
                </div>
                {r.matched && r.matchedDoc && (
                  <a href={r.matchedDoc.file_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500 hover:text-blue-700 flex-shrink-0"><Eye className="w-3.5 h-3.5" /></Button>
                  </a>
                )}
              </div>
            ))}
          </div>
          <div className="pt-2 border-t">
            <p className="text-xs text-gray-500">
              ✓ {(results || []).filter(r => r.matched).length} of {(results || []).length} checklist items matched.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}