import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Send, Loader2, Trash2, Pin, PinOff, Megaphone, Lightbulb, HelpCircle, Pencil, Check, X, Image, Play } from "lucide-react";
import PostReactions from "@/components/community/PostReactions";
import PostComments from "@/components/community/PostComments";
import LinkPreview from "@/components/community/LinkPreview";
import { format } from "date-fns";

const CATEGORY_CONFIG = {
  general:      { label: "General",      className: "bg-gray-100 text-gray-700",   icon: MessageSquare },
  announcement: { label: "Announcement", className: "bg-blue-100 text-blue-700",   icon: Megaphone },
  tip:          { label: "Tip",          className: "bg-green-100 text-green-700", icon: Lightbulb },
  question:     { label: "Question",     className: "bg-purple-100 text-purple-700", icon: HelpCircle },
};

function MediaGrid({ mediaUrls }) {
  if (!mediaUrls?.length) return null;
  return (
    <div className={`mt-3 grid gap-2 ${mediaUrls.length === 1 ? 'grid-cols-1' : mediaUrls.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
      {mediaUrls.map((m, i) => (
        m.type === 'video' ? (
          <video key={i} src={m.url} controls className="rounded-xl w-full max-h-72 object-cover bg-black" />
        ) : (
          <img key={i} src={m.url} alt="" className={`rounded-xl w-full object-cover ${mediaUrls.length === 1 ? 'max-h-80' : 'h-40'}`} />
        )
      ))}
    </div>
  );
}

function Avatar({ name, photoUrl, size = "md" }) {
  const sizeClass = size === "sm" ? "w-6 h-6 text-[10px]" : "w-9 h-9 text-sm";
  if (photoUrl) {
    return <img src={photoUrl} alt="" className={`${sizeClass} rounded-full object-cover flex-shrink-0`} />;
  }
  return (
    <div className={`${sizeClass} bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-600 flex-shrink-0`}>
      {(name || "?")?.[0]?.toUpperCase()}
    </div>
  );
}

function PostCard({ post, isAdmin, isOwn, onDelete, onTogglePin, onEdit, user, onUpdate, agentPhotoMap }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.content);
  const [saving, setSaving] = useState(false);
  const cfg = CATEGORY_CONFIG[post.category] || CATEGORY_CONFIG.general;
  const Icon = cfg.icon;

  const handleSave = async () => {
    if (!editText.trim()) return;
    setSaving(true);
    await onEdit(post, editText.trim());
    setSaving(false);
    setEditing(false);
  };

  return (
    <Card className={`${post.pinned ? "border-amber-300 bg-amber-50/30" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar name={post.author_name} photoUrl={agentPhotoMap?.[post.author_email]} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-gray-900">{post.author_name || "Agent"}</span>
              <span className="text-xs text-gray-400">{post.created_date ? format(new Date(post.created_date), "MMM d, h:mm a") : ""}</span>
              <Badge className={`text-xs flex items-center gap-1 ${cfg.className}`}>
                <Icon className="w-3 h-3" />{cfg.label}
              </Badge>
              {post.pinned && <Badge className="bg-amber-100 text-amber-700 text-xs flex items-center gap-1"><Pin className="w-3 h-3" />Pinned</Badge>}
            </div>
            {editing ? (
              <div className="mt-2 space-y-2">
                <Textarea
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  rows={3}
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave} disabled={saving || !editText.trim()} className="gap-1.5 h-7 text-xs">
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditText(post.content); }} className="h-7 text-xs gap-1.5">
                    <X className="w-3 h-3" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-700 mt-1.5 whitespace-pre-line">{post.content}</p>
                <LinkPreview content={post.content} />
                <MediaGrid mediaUrls={post.media_urls} />
                <PostReactions post={post} userEmail={user?.email} onUpdate={onUpdate} />
                <PostComments post={post} user={user} isAdmin={isAdmin} onUpdate={onUpdate} agentPhotoMap={agentPhotoMap} />
              </>
            )}
          </div>
          {(isAdmin || isOwn) && !editing && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {isAdmin && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-500 hover:text-amber-700" onClick={() => onTogglePin(post)} title={post.pinned ? "Unpin" : "Pin"}>
                  {post.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                </Button>
              )}
              {isOwn && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-600" onClick={() => setEditing(true)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => onDelete(post)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Community() {
  const [posts, setPosts] = useState([]);
  const [user, setUser] = useState(null);
  const [agentPhotoMap, setAgentPhotoMap] = useState({});
  const [newPost, setNewPost] = useState("");
  const [category, setCategory] = useState("general");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const load = async () => {
    const me = await base44.auth.me();
    setUser(me);
    base44.entities.Agent.list("-created_date", 500).then(agents => {
      const map = {};
      (agents || []).forEach(a => { if (a.user_email && a.photo_url) map[a.user_email] = a.photo_url; });
      setAgentPhotoMap(map);
    }).catch(() => {});
    const data = await base44.entities.CommunityPost.list("-created_date", 200);
    // Pinned posts first
    const sorted = [...(data || [])].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.created_date) - new Date(a.created_date);
    });
    setPosts(sorted);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const isAdmin = user?.role === "admin" || user?.role === "staff";

  const handlePost = async () => {
    if (!newPost.trim() && mediaFiles.length === 0) return;
    setPosting(true);
    let media_urls = [];
    if (mediaFiles.length > 0) {
      setUploadingMedia(true);
      media_urls = await Promise.all(mediaFiles.map(async (f) => {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
        return { url: file_url, type: f.type.startsWith('video') ? 'video' : 'image' };
      }));
      setUploadingMedia(false);
    }
    await base44.entities.CommunityPost.create({
      author_name: user?.full_name || "Agent",
      author_email: user?.email,
      content: newPost.trim(),
      category,
      pinned: false,
      media_urls,
    });
    setNewPost("");
    setCategory("general");
    setMediaFiles([]);
    await load();
    setPosting(false);
  };

  const handleDelete = async (post) => {
    await base44.entities.CommunityPost.delete(post.id);
    await load();
  };

  const handleTogglePin = async (post) => {
    await base44.entities.CommunityPost.update(post.id, { pinned: !post.pinned });
    await load();
  };

  const handleEdit = async (post, newContent) => {
    await base44.entities.CommunityPost.update(post.id, { content: newContent });
    await load();
  };

  if (loading) return <div className="flex items-center justify-center h-full p-12"><div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Agent Talk</h1>
        <p className="text-gray-500 text-sm mt-1">Share updates, tips, and announcements with your team</p>
      </div>

      {/* Compose */}
      <Card className="mb-6">
        <CardContent className="p-4 space-y-3">
          <Textarea
            placeholder="Share something with the team..."
            value={newPost}
            onChange={e => setNewPost(e.target.value)}
            rows={3}
          />
          {/* Media previews */}
          {mediaFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {mediaFiles.map((f, i) => (
                <div key={i} className="relative group">
                  {f.type.startsWith('video') ? (
                    <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center border">
                      <Play className="w-6 h-6 text-gray-500" />
                      <span className="absolute bottom-1 left-1 right-1 text-[9px] text-center text-gray-500 truncate">{f.name}</span>
                    </div>
                  ) : (
                    <img src={URL.createObjectURL(f)} alt="" className="w-20 h-20 object-cover rounded-lg border" />
                  )}
                  <button onClick={() => setMediaFiles(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs hidden group-hover:flex items-center justify-center">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-44 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_CONFIG).map(([val, cfg]) => (
                    <SelectItem key={val} value={val}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="cursor-pointer flex items-center gap-1.5 px-3 h-8 rounded-md border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                <Image className="w-4 h-4" />
                <span>Photo/Video</span>
                <input type="file" accept="image/*,video/*" multiple className="hidden"
                  onChange={e => setMediaFiles(prev => [...prev, ...Array.from(e.target.files)])} />
              </label>
            </div>
            <Button onClick={handlePost} disabled={posting || (!newPost.trim() && mediaFiles.length === 0)} className="gap-2">
              {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {uploadingMedia ? 'Uploading...' : 'Post'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {posts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No posts yet. Be the first to share something!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              isAdmin={isAdmin}
              isOwn={post.author_email === user?.email}
              onDelete={handleDelete}
              onTogglePin={handleTogglePin}
              onEdit={handleEdit}
              user={user}
              onUpdate={load}
              agentPhotoMap={agentPhotoMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}