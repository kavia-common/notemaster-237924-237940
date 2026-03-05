"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, Note, NoteListResponse, Tag } from "./lib/api";
import { useAuth } from "./state/auth";

type Filters = {
  q: string;
  tag: string | null;
  pinned: boolean | null;
  favorite: boolean | null;
};

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

function parseTags(input: string): string[] {
  return input
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export default function Home() {
  const { token, me, loading, login, register, logout, refreshMe } = useAuth();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [tags, setTags] = useState<Tag[]>([]);
  const [filters, setFilters] = useState<Filters>({ q: "", tag: null, pinned: null, favorite: null });
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selected = useMemo(() => notes.find((n) => n.id === selectedId) ?? null, [notes, selectedId]);

  const [editorTitle, setEditorTitle] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [editorTags, setEditorTags] = useState("");
  const [editorPinned, setEditorPinned] = useState(false);
  const [editorFavorite, setEditorFavorite] = useState(false);

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const autosaveTimer = useRef<number | null>(null);

  const isAuthed = Boolean(token);

  async function loadTags() {
    if (!token) return;
    const t = await apiFetch<Tag[]>("/tags", { token });
    setTags(t);
  }

  async function loadNotes() {
    if (!token) return;
    const params = new URLSearchParams();
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.tag) params.set("tag", filters.tag);
    if (filters.pinned !== null) params.set("pinned", String(filters.pinned));
    if (filters.favorite !== null) params.set("favorite", String(filters.favorite));
    const resp = await apiFetch<NoteListResponse>(`/notes?${params.toString()}`, { token });
    setNotes(resp.items);
    if (selectedId && !resp.items.some((n) => n.id === selectedId)) setSelectedId(null);
  }

  useEffect(() => {
    if (!token) return;
    loadTags().catch(() => setTags([]));
    loadNotes().catch(() => setNotes([]));
    refreshMe().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    loadNotes().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q, filters.tag, filters.pinned, filters.favorite, token]);

  // Load selected note into editor
  useEffect(() => {
    if (!selected) {
      setEditorTitle("");
      setEditorContent("");
      setEditorTags("");
      setEditorPinned(false);
      setEditorFavorite(false);
      return;
    }
    setEditorTitle(selected.title);
    setEditorContent(selected.content_md);
    setEditorTags(selected.tags.map((t) => t.name).join(", "));
    setEditorPinned(selected.pinned);
    setEditorFavorite(selected.favorite);
  }, [selected]);

  async function handleAuthSubmit() {
    setStatusMsg(null);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password);
      await refreshMe();
      setEmail("");
      setPassword("");
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "Auth failed");
    }
  }

  async function createNewNote() {
    if (!token) return;
    setStatusMsg(null);
    try {
      const created = await apiFetch<Note>("/notes", {
        method: "POST",
        token,
        body: { title: "Untitled", content_md: "", pinned: false, favorite: false, tags: [] },
      });
      setNotes((prev) => [created, ...prev]);
      setSelectedId(created.id);
      await loadTags();
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "Failed to create");
    }
  }

  async function deleteSelected() {
    if (!token || !selected) return;
    setStatusMsg(null);
    try {
      await apiFetch<void>(`/notes/${selected.id}`, { method: "DELETE", token });
      setNotes((prev) => prev.filter((n) => n.id !== selected.id));
      setSelectedId(null);
      await loadTags();
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  function scheduleAutosave() {
    if (!token || !selected) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      void autosaveNow();
    }, 700);
  }

  async function autosaveNow() {
    if (!token || !selected) return;
    setStatusMsg("Saving…");
    try {
      const updated = await apiFetch<Note>(`/notes/${selected.id}`, {
        method: "PUT",
        token,
        body: {
          title: editorTitle,
          content_md: editorContent,
          pinned: editorPinned,
          favorite: editorFavorite,
          tags: parseTags(editorTags),
        },
      });
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      await loadTags();
      setStatusMsg("Saved");
      window.setTimeout(() => setStatusMsg(null), 800);
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function quickToggle(note: Note, patch: Partial<Pick<Note, "pinned" | "favorite">>) {
    if (!token) return;
    const updated = await apiFetch<Note>(`/notes/${note.id}`, {
      method: "PUT",
      token,
      body: patch,
    });
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="nm-card p-6">Loading…</div>
      </main>
    );
  }

  if (!isAuthed) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="nm-card w-full max-w-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-extrabold tracking-tight">NoteMaster</h1>
            <span className="text-sm text-[var(--nm-muted)]">
              Retro UI • Markdown • Autosave
            </span>
          </div>

          <div className="flex gap-2 mb-4">
            <button
              className={`nm-btn ${mode === "login" ? "nm-btn-primary" : ""}`}
              onClick={() => setMode("login")}
            >
              Login
            </button>
            <button
              className={`nm-btn ${mode === "register" ? "nm-btn-primary" : ""}`}
              onClick={() => setMode("register")}
            >
              Register
            </button>
          </div>

          <div className="space-y-3">
            <input
              className="nm-input w-full"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <input
              className="nm-input w-full"
              placeholder="Password (min 8 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
            <button className="nm-btn nm-btn-primary w-full" onClick={() => void handleAuthSubmit()}>
              {mode === "login" ? "Enter vault" : "Create account"}
            </button>
            {statusMsg && <div className="text-sm text-[var(--nm-danger)]">{statusMsg}</div>}
          </div>

          <div className="text-xs text-[var(--nm-muted)] mt-4">
            Tip: use <span className="nm-kbd">#</span> headings and <span className="nm-kbd">-</span> lists in Markdown.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
        {/* Sidebar */}
        <aside className="nm-card p-4 h-fit md:sticky md:top-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-extrabold">NoteMaster</div>
              <div className="text-xs text-[var(--nm-muted)]">{me?.email ?? "Signed in"}</div>
            </div>
            <button className="nm-btn" onClick={logout}>
              Logout
            </button>
          </div>

          <div className="mt-4 flex gap-2">
            <button className="nm-btn nm-btn-primary w-full" onClick={() => void createNewNote()}>
              + New
            </button>
            <button className="nm-btn" disabled={!selected} onClick={() => void deleteSelected()}>
              Delete
            </button>
          </div>

          <div className="mt-4 space-y-2">
            <input
              className="nm-input w-full"
              placeholder="Search…"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            />

            <div className="flex gap-2 flex-wrap">
              <button
                className={`nm-btn ${filters.pinned === true ? "nm-btn-primary" : ""}`}
                onClick={() => setFilters((f) => ({ ...f, pinned: f.pinned === true ? null : true }))}
                title="Filter pinned"
              >
                Pinned
              </button>
              <button
                className={`nm-btn ${filters.favorite === true ? "nm-btn-primary" : ""}`}
                onClick={() => setFilters((f) => ({ ...f, favorite: f.favorite === true ? null : true }))}
                title="Filter favorites"
              >
                Fav
              </button>
              <button className="nm-btn" onClick={() => setFilters({ q: "", tag: null, pinned: null, favorite: null })}>
                Clear
              </button>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs uppercase tracking-wider text-[var(--nm-muted)] mb-2">Tags</div>
            <div className="flex flex-wrap gap-2">
              <button
                className={`nm-btn ${filters.tag === null ? "nm-btn-primary" : ""}`}
                onClick={() => setFilters((f) => ({ ...f, tag: null }))}
              >
                All
              </button>
              {tags.map((t) => (
                <button
                  key={t.id}
                  className={`nm-btn ${filters.tag === t.name ? "nm-btn-primary" : ""}`}
                  onClick={() => setFilters((f) => ({ ...f, tag: t.name }))}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 text-xs text-[var(--nm-muted)]">
            Autosave: <span className="nm-kbd">700ms</span> debounce
          </div>
        </aside>

        {/* Main */}
        <section className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          {/* Notes list */}
          <div className="nm-card p-3">
            <div className="flex items-center justify-between px-1 pb-2">
              <div className="text-sm text-[var(--nm-muted)]">
                {notes.length} note{notes.length === 1 ? "" : "s"}
              </div>
              {statusMsg && <div className="text-xs text-[var(--nm-muted)]">{statusMsg}</div>}
            </div>

            <div className="space-y-2 max-h-[72vh] overflow-auto pr-1">
              {notes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setSelectedId(n.id)}
                  className={`w-full text-left nm-card p-3 hover:border-[rgba(59,130,246,0.45)] transition ${
                    selectedId === n.id ? "border-[rgba(59,130,246,0.55)]" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold line-clamp-1">{n.title || "Untitled"}</div>
                    <div className="flex gap-1">
                      <span title="Pinned">{n.pinned ? "📌" : ""}</span>
                      <span title="Favorite">{n.favorite ? "★" : ""}</span>
                    </div>
                  </div>
                  <div className="text-xs text-[var(--nm-muted)] mt-1">Updated {formatUpdatedAt(n.updated_at)}</div>
                  <div className="text-xs text-[var(--nm-muted)] mt-2 line-clamp-2">
                    {n.content_md.slice(0, 120) || "—"}
                  </div>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {n.tags.slice(0, 4).map((t) => (
                      <span
                        key={t.id}
                        className="text-xs px-2 py-1 rounded-full border border-[var(--nm-border)] bg-white/60"
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>

                  <div className="mt-2 flex gap-2">
                    <span
                      className="text-xs underline"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void quickToggle(n, { pinned: !n.pinned });
                      }}
                    >
                      toggle pin
                    </span>
                    <span
                      className="text-xs underline"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void quickToggle(n, { favorite: !n.favorite });
                      }}
                    >
                      toggle fav
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Editor */}
          <div className="nm-card p-4">
            {!selected ? (
              <div className="h-full flex items-center justify-center text-[var(--nm-muted)]">
                Select a note or create a new one.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    className="nm-input flex-1 min-w-[220px]"
                    value={editorTitle}
                    onChange={(e) => {
                      setEditorTitle(e.target.value);
                      scheduleAutosave();
                    }}
                    placeholder="Title"
                  />
                  <button
                    className={`nm-btn ${editorPinned ? "nm-btn-primary" : ""}`}
                    onClick={() => {
                      setEditorPinned((v) => !v);
                      scheduleAutosave();
                    }}
                  >
                    📌
                  </button>
                  <button
                    className={`nm-btn ${editorFavorite ? "nm-btn-primary" : ""}`}
                    onClick={() => {
                      setEditorFavorite((v) => !v);
                      scheduleAutosave();
                    }}
                  >
                    ★
                  </button>
                  <button className="nm-btn" onClick={() => void autosaveNow()}>
                    Save now
                  </button>
                </div>

                <input
                  className="nm-input w-full"
                  value={editorTags}
                  onChange={(e) => {
                    setEditorTags(e.target.value);
                    scheduleAutosave();
                  }}
                  placeholder="Tags (comma-separated)"
                />

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <textarea
                    className="w-full min-h-[55vh] p-3 rounded-[var(--nm-radius-sm)] border border-[var(--nm-border)] bg-white/80 font-mono text-sm"
                    value={editorContent}
                    onChange={(e) => {
                      setEditorContent(e.target.value);
                      scheduleAutosave();
                    }}
                    placeholder={"Write Markdown here...\n\n# Heading\n- List item\n**bold** _italic_ `code`"}
                  />
                  <div className="w-full min-h-[55vh] p-3 rounded-[var(--nm-radius-sm)] border border-[var(--nm-border)] bg-white/60 overflow-auto">
                    <div className="text-xs text-[var(--nm-muted)] mb-2">Preview (basic)</div>
                    <MarkdownPreview markdown={editorContent} />
                  </div>
                </div>

                <div className="text-xs text-[var(--nm-muted)]">
                  Updated: {formatUpdatedAt(selected.updated_at)}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function MarkdownPreview({ markdown }: { markdown: string }) {
  // Minimal preview to avoid additional dependencies.
  // Supports headings, bold/italic, inline code, and paragraphs.
  const lines = markdown.split("\n");

  const html = lines
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("### ")) return `<h3>${escapeHtml(trimmed.slice(4))}</h3>`;
      if (trimmed.startsWith("## ")) return `<h2>${escapeHtml(trimmed.slice(3))}</h2>`;
      if (trimmed.startsWith("# ")) return `<h1>${escapeHtml(trimmed.slice(2))}</h1>`;
      if (trimmed.startsWith("- ")) return `<li>${escapeInline(trimmed.slice(2))}</li>`;
      if (!trimmed) return "";
      return `<p>${escapeInline(trimmed)}</p>`;
    })
    .join("\n");

  const wrapped = html.includes("<li>") ? html.replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>") : html;

  return (
    <div
      className="prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: wrapped }}
    />
  );
}

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeInline(s: string): string {
  // Very small subset: **bold**, _italic_, `code`
  let out = escapeHtml(s);
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/_(.+?)_/g, "<em>$1</em>");
  out = out.replace(/`(.+?)`/g, "<code>$1</code>");
  return out;
}
