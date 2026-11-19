import { useState } from "react";
import { base44 } from "@/api/base44Client";

const EMOJI_OPTIONS = ["👍", "❤️", "🔥", "🎉", "😂", "👏", "💯", "🙌"];

export default function PostReactions({ post, userEmail, onUpdate }) {
  const [showPicker, setShowPicker] = useState(false);

  const reactions = post.reactions || [];

  const handleReact = async (emoji) => {
    setShowPicker(false);
    const existing = reactions.find(r => r.emoji === emoji);
    let updated;
    if (existing) {
      const hasReacted = existing.user_emails.includes(userEmail);
      updated = reactions.map(r =>
        r.emoji === emoji
          ? { ...r, user_emails: hasReacted ? r.user_emails.filter(e => e !== userEmail) : [...r.user_emails, userEmail] }
          : r
      ).filter(r => r.user_emails.length > 0);
    } else {
      updated = [...reactions, { emoji, user_emails: [userEmail] }];
    }
    await base44.entities.CommunityPost.update(post.id, { reactions: updated });
    onUpdate();
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-2">
      {reactions.map(r => (
        <button
          key={r.emoji}
          onClick={() => handleReact(r.emoji)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
            r.user_emails.includes(userEmail)
              ? "bg-blue-100 border-blue-300 text-blue-700"
              : "bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200"
          }`}
        >
          {r.emoji} <span>{r.user_emails.length}</span>
        </button>
      ))}
      <div className="relative">
        <button
          onClick={() => setShowPicker(p => !p)}
          className="flex items-center px-2 py-0.5 rounded-full text-xs border border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors"
        >
          + 😊
        </button>
        {showPicker && (
          <div className="absolute bottom-7 left-0 z-20 bg-white border rounded-xl shadow-lg p-2 flex gap-1 flex-wrap w-44">
            {EMOJI_OPTIONS.map(e => (
              <button key={e} onClick={() => handleReact(e)} className="text-xl hover:scale-125 transition-transform p-1">
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}