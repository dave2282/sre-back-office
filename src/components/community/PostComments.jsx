import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Trash2, MessageCircle } from "lucide-react";
import { format } from "date-fns";

function Avatar({ name, photoUrl }) {
  if (photoUrl) return <img src={photoUrl} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />;
  return (
    <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">
      {(name || "?")?.[0]?.toUpperCase()}
    </div>
  );
}

export default function PostComments({ post, user, isAdmin, onUpdate, agentPhotoMap = {} }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  const comments = post.comments || [];

  const handleComment = async () => {
    if (!text.trim()) return;
    setPosting(true);
    const newComment = {
      id: Date.now().toString(),
      author_name: user?.full_name || "Agent",
      author_email: user?.email,
      content: text.trim(),
      created_date: new Date().toISOString(),
    };
    await base44.entities.CommunityPost.update(post.id, {
      comments: [...comments, newComment],
    });
    setText("");
    setPosting(false);
    onUpdate();
  };

  const handleDeleteComment = async (commentId) => {
    await base44.entities.CommunityPost.update(post.id, {
      comments: comments.filter(c => c.id !== commentId),
    });
    onUpdate();
  };

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        <MessageCircle className="w-3.5 h-3.5" />
        {comments.length > 0 ? `${comments.length} comment${comments.length !== 1 ? "s" : ""}` : "Add a comment"}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {comments.map(c => (
            <div key={c.id} className="flex items-start gap-2">
              <Avatar name={c.author_name} photoUrl={agentPhotoMap[c.author_email]} />
              <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-800">{c.author_name}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-400">{c.created_date ? format(new Date(c.created_date), "MMM d, h:mm a") : ""}</span>
                    {(isAdmin || c.author_email === user?.email) && (
                      <button onClick={() => handleDeleteComment(c.id)} className="text-gray-300 hover:text-red-400 transition-colors ml-1">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-700 mt-0.5">{c.content}</p>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2">
            <Avatar name={user?.full_name} photoUrl={agentPhotoMap[user?.email]} />
            <input
              type="text"
              placeholder="Write a comment..."
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleComment()}
              className="flex-1 text-xs rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-300"
            />
            <Button size="icon" className="w-7 h-7" disabled={posting || !text.trim()} onClick={handleComment}>
              {posting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}