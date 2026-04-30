'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react'
import { useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import {
  BookOpen,
  ArchiveRestore,
  Check,
  Clock3,
  Copy,
  Database,
  Download,
  FileText,
  FileUp,
  Folder,
  GripVertical,
  Hash,
  Heading2,
  Link2,
  ListTodo,
  Lock,
  LogIn,
  LogOut,
  Menu,
  PanelLeftClose,
  Plus,
  Quote,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tags,
  Trash2,
  Type,
  Unlock,
  UploadCloud,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import {
  countWords,
  createBlankNote,
  createBlock,
  formatUpdatedAt,
  normalizeBlocks,
  normalizeNote,
  normalizeTags,
  starterNotes,
  type BlockType,
  type Note,
  type NoteBlock,
} from '@/lib/notes'
import { getSupabaseClient, isSupabaseConfigured, type RemoteNoteRow } from '@/lib/supabase'

const STORAGE_KEY = 'note-atelier-documents-v2'
const RECENT_KEY = 'note-atelier-recent-v1'
const DEFAULT_APP_ORIGIN = 'https://note-sigma-jet.vercel.app'
const TRASH_TAG = '__note_atelier_trash'
const IMPORT_INPUT_ID = 'markdown-import-input'

type SyncState = 'local' | 'ready' | 'syncing' | 'synced' | 'error'

const blockLabels: Record<BlockType, string> = {
  paragraph: 'Text',
  heading: 'Heading',
  todo: 'Todo',
  quote: 'Quote',
}

const blockIcons: Record<BlockType, React.ReactNode> = {
  paragraph: <Type size={15} />,
  heading: <Heading2 size={15} />,
  todo: <ListTodo size={15} />,
  quote: <Quote size={15} />,
}

function loadLocalNotes() {
  if (typeof window === 'undefined') {
    return starterNotes
  }

  const saved = window.localStorage.getItem(STORAGE_KEY)
  const legacy = window.localStorage.getItem('note-atelier-documents-v1')

  if (!saved && !legacy) {
    return starterNotes
  }

  try {
    const parsed = JSON.parse(saved || legacy || '[]') as Array<Partial<Note> & { blocks?: unknown }>
    return parsed.length > 0 ? parsed.map((note) => normalizeNote(note)) : starterNotes
  } catch {
    return starterNotes
  }
}

function sameNoteSet(a: Note[], b: Note[]) {
  return JSON.stringify(a.map((note) => note.id).sort()) === JSON.stringify(b.map((note) => note.id).sort())
}

function isTrashed(note: Note) {
  return note.tags.includes(TRASH_TAG)
}

function visibleTags(note: Note) {
  return note.tags.filter((tag) => tag !== TRASH_TAG)
}

function withoutTrashTag(tags: string[]) {
  return tags.filter((tag) => tag !== TRASH_TAG)
}

function mapRemoteNote(row: RemoteNoteRow): Note {
  return normalizeNote({
    id: row.id,
    title: row.title,
    icon: row.icon,
    summary: row.summary ?? '',
    favorited: Boolean(row.favorited),
    folder: row.folder ?? 'Inbox',
    tags: normalizeTags(row.tags),
    isPublic: Boolean(row.is_public),
    updatedAt: row.updated_at,
    blocks: normalizeBlocks(row.blocks),
  })
}

function makeSearchBlob(note: Note) {
  return [
    note.title,
    note.summary,
    note.folder,
    ...visibleTags(note),
    ...note.blocks.map((block) => block.content),
  ]
    .join(' ')
    .toLowerCase()
}

function firstKeywords(note: Note) {
  return [note.title, note.summary, note.folder, ...visibleTags(note), ...note.blocks.map((block) => block.content)]
    .join(' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1)
    .slice(0, 8)
}

function markdownTransform(content: string, currentType: BlockType): Partial<NoteBlock> | null {
  if (currentType !== 'paragraph') {
    return null
  }

  if (content.startsWith('# ')) {
    return { type: 'heading', content: content.slice(2) }
  }

  if (content.startsWith('- [ ] ')) {
    return { type: 'todo', content: content.slice(6), checked: false }
  }

  if (content.startsWith('- [x] ') || content.startsWith('- [X] ')) {
    return { type: 'todo', content: content.slice(6), checked: true }
  }

  if (content.startsWith('- ')) {
    return { type: 'todo', content: content.slice(2), checked: false }
  }

  if (content.startsWith('> ')) {
    return { type: 'quote', content: content.slice(2) }
  }

  return null
}

function shareUrlFor(noteId: string) {
  if (typeof window === 'undefined') {
    return `/share/${noteId}`
  }

  return `${window.location.origin}/share/${noteId}`
}

function normalizeOrigin(value: string | undefined) {
  if (!value?.trim()) {
    return null
  }

  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function getLoginRedirectTo() {
  const configuredOrigin = normalizeOrigin(
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL,
  )

  if (configuredOrigin) {
    return configuredOrigin
  }

  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location
    const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0'])

    if (!localHosts.has(hostname)) {
      return origin
    }
  }

  return DEFAULT_APP_ORIGIN
}

function escapeMarkdown(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('\n', ' ')
}

function noteToMarkdown(note: Note) {
  const metadata = [
    `<!-- folder: ${escapeMarkdown(note.folder)} -->`,
    `<!-- tags: ${visibleTags(note).join(', ')} -->`,
    '',
  ].join('\n')

  const body = note.blocks
    .map((block) => {
      if (block.type === 'heading') {
        return `## ${block.content}`
      }

      if (block.type === 'todo') {
        return `- [${block.checked ? 'x' : ' '}] ${block.content}`
      }

      if (block.type === 'quote') {
        return block.content
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n')
      }

      return block.content
    })
    .join('\n\n')

  return `# ${note.title}\n\n${metadata}${note.summary ? `${note.summary}\n\n` : ''}${body}\n`
}

function markdownToNote(markdown: string): Note {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const titleLine = lines.find((line) => line.trim().startsWith('# '))
  const folderMatch = markdown.match(/<!--\s*folder:\s*(.*?)\s*-->/i)
  const tagsMatch = markdown.match(/<!--\s*tags:\s*(.*?)\s*-->/i)
  const title = titleLine?.replace(/^#\s+/, '').trim() || 'Imported Page'
  const blocks: NoteBlock[] = []

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    if (!line.trim() || line.startsWith('<!--') || line.startsWith('# ')) {
      continue
    }

    if (line.startsWith('## ')) {
      blocks.push({ id: crypto.randomUUID(), type: 'heading', content: line.slice(3).trim() })
    } else if (/^-\s+\[[ xX]\]\s+/.test(line)) {
      blocks.push({
        id: crypto.randomUUID(),
        type: 'todo',
        content: line.replace(/^-\s+\[[ xX]\]\s+/, '').trim(),
        checked: /^-\s+\[[xX]\]/.test(line),
      })
    } else if (line.startsWith('> ')) {
      blocks.push({ id: crypto.randomUUID(), type: 'quote', content: line.slice(2).trim() })
    } else {
      blocks.push({ id: crypto.randomUUID(), type: 'paragraph', content: line.trim() })
    }
  }

  return normalizeNote({
    id: crypto.randomUUID(),
    title,
    icon: 'M',
    summary: '',
    favorited: false,
    folder: folderMatch?.[1]?.trim() || 'Imports',
    tags: normalizeTags(tagsMatch?.[1] || 'imported'),
    isPublic: false,
    updatedAt: new Date().toISOString(),
    blocks: blocks.length ? blocks : [createBlock('paragraph')],
  })
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function NoteWorkspace({
  initialNoteId,
  sharedNoteId,
}: {
  initialNoteId?: string
  sharedNoteId?: string
}) {
  const router = useRouter()
  const [notes, setNotes] = useState<Note[]>(starterNotes)
  const [activeId, setActiveId] = useState(initialNoteId ?? starterNotes[0].id)
  const [query, setQuery] = useState('')
  const [selectedFolder, setSelectedFolder] = useState('All')
  const [selectedTag, setSelectedTag] = useState('All')
  const [email, setEmail] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [remoteReady, setRemoteReady] = useState(false)
  const [mergePrompt, setMergePrompt] = useState<{ local: Note[]; remote: Note[] } | null>(null)
  const [syncState, setSyncState] = useState<SyncState>(() =>
    isSupabaseConfigured() ? 'ready' : 'local',
  )
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null)
  const [copiedShare, setCopiedShare] = useState(false)
  const [recentIds, setRecentIds] = useState<string[]>([])
  const [showTrash, setShowTrash] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [slashBlockId, setSlashBlockId] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const supabaseReady = isSupabaseConfigured()
  const isShareMode = Boolean(sharedNoteId)
  const activeNote = notes.find((note) => note.id === activeId) ?? notes[0]

  const folders = useMemo(
    () => ['All', ...Array.from(new Set(notes.filter((note) => !isTrashed(note)).map((note) => note.folder || 'Inbox'))).sort()],
    [notes],
  )
  const tags = useMemo(
    () => ['All', ...Array.from(new Set(notes.filter((note) => !isTrashed(note)).flatMap((note) => visibleTags(note)))).sort()],
    [notes],
  )
  const trashedNotes = useMemo(() => notes.filter((note) => isTrashed(note)), [notes])
  const liveNotes = useMemo(() => notes.filter((note) => !isTrashed(note)), [notes])
  const recentNotes = useMemo(
    () =>
      recentIds
        .map((id) => notes.find((note) => note.id === id && !isTrashed(note)))
        .filter((note): note is Note => Boolean(note))
        .slice(0, 4),
    [notes, recentIds],
  )

  const filteredNotes = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const pool = showTrash ? trashedNotes : liveNotes
    const sorted = [...pool].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )

    return sorted.filter((note) => {
      const matchesQuery = !needle || makeSearchBlob(note).includes(needle)
      const matchesFolder = selectedFolder === 'All' || note.folder === selectedFolder
      const matchesTag = selectedTag === 'All' || visibleTags(note).includes(selectedTag)
      return matchesQuery && matchesFolder && matchesTag
    })
  }, [liveNotes, query, selectedFolder, selectedTag, showTrash, trashedNotes])

  const favoriteNotes = filteredNotes.filter((note) => note.favorited)
  const regularNotes = filteredNotes.filter((note) => !note.favorited)

  const setActiveNoteId = useCallback(
    (id: string) => {
      setActiveId(id)
      setSidebarOpen(false)

      if (typeof window !== 'undefined' && !isShareMode) {
        setRecentIds((current) => {
          const next = [id, ...current.filter((recentId) => recentId !== id)].slice(0, 8)
          window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
          return next
        })
      }

      if (!isShareMode) {
        router.push(`/note/${id}`, { scroll: false })
      }
    },
    [isShareMode, router],
  )

  const loadRemoteNotes = useCallback(
    async (userId: string, localSnapshot: Note[]) => {
      const client = getSupabaseClient()

      if (!client) {
        return
      }

      setSyncState('syncing')
      const { data, error } = await client
        .from('notes')
        .select('id,user_id,title,icon,summary,blocks,favorited,folder,tags,is_public,updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (error) {
        setSyncState('error')
        setRemoteReady(true)
        return
      }

      const remoteNotes = (data ?? []).map((row) => mapRemoteNote(row as RemoteNoteRow))

      if (remoteNotes.length > 0 && !sameNoteSet(localSnapshot, remoteNotes)) {
        setMergePrompt({ local: localSnapshot, remote: remoteNotes })
        setNotes(remoteNotes)
        setActiveNoteId(initialNoteId && remoteNotes.some((note) => note.id === initialNoteId) ? initialNoteId : remoteNotes[0].id)
      } else if (remoteNotes.length > 0) {
        setNotes(remoteNotes)
        setActiveNoteId(initialNoteId && remoteNotes.some((note) => note.id === initialNoteId) ? initialNoteId : remoteNotes[0].id)
      } else if (localSnapshot.length > 0) {
        setNotes(localSnapshot)
        setRemoteReady(true)
      }

      setRemoteReady(true)
      setSyncState('synced')
    },
    [initialNoteId, setActiveNoteId],
  )

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      if (isShareMode && sharedNoteId) {
        const client = getSupabaseClient()
        const { data } = client
          ? await client
              .from('notes')
              .select('id,user_id,title,icon,summary,blocks,favorited,folder,tags,is_public,updated_at')
              .eq('id', sharedNoteId)
              .eq('is_public', true)
              .maybeSingle()
          : { data: null }

        if (data) {
          const shared = mapRemoteNote(data as RemoteNoteRow)
          setNotes([shared])
          setActiveId(shared.id)
        } else {
          setNotes([])
        }

        setHydrated(true)
        return
      }

      const localNotes = loadLocalNotes()
      const firstVisibleNote = localNotes.find((note) => !isTrashed(note)) ?? localNotes[0]
      setNotes(localNotes)
      setActiveId(
        initialNoteId && localNotes.some((note) => note.id === initialNoteId)
          ? initialNoteId
          : firstVisibleNote?.id ?? starterNotes[0].id,
      )
      try {
        setRecentIds(JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]') as string[])
      } catch {
        setRecentIds([])
      }
      setHydrated(true)
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [initialNoteId, isShareMode, sharedNoteId])

  useEffect(() => {
    if (!supabaseReady || isShareMode) {
      return
    }

    const client = getSupabaseClient()

    if (!client) {
      return
    }

    client.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) {
        void loadRemoteNotes(data.session.user.id, loadLocalNotes())
      } else {
        setSyncState('ready')
      }
    })

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setRemoteReady(false)

      if (nextSession) {
        void loadRemoteNotes(nextSession.user.id, loadLocalNotes())
      } else {
        setSyncState('ready')
      }
    })

    return () => subscription.unsubscribe()
  }, [isShareMode, loadRemoteNotes, supabaseReady])

  useEffect(() => {
    if (!hydrated || isShareMode) {
      return
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
  }, [hydrated, isShareMode, notes])

  useEffect(() => {
    if (!session || !remoteReady || !supabaseReady || isShareMode) {
      return
    }

    const client = getSupabaseClient()

    if (!client) {
      return
    }

    const timeout = window.setTimeout(async () => {
      setSyncState('syncing')

      const payload = notes.map((note) => ({
        id: note.id,
        user_id: session.user.id,
        title: note.title,
        icon: note.icon,
        summary: note.summary,
        blocks: note.blocks,
        favorited: note.favorited,
        folder: note.folder,
        tags: note.tags,
        is_public: note.isPublic,
        updated_at: note.updatedAt,
      }))

      const { error } = await client.from('notes').upsert(payload, { onConflict: 'id' })
      setSyncState(error ? 'error' : 'synced')
    }, 700)

    return () => window.clearTimeout(timeout)
  }, [isShareMode, notes, remoteReady, session, supabaseReady])

  const updateNote = useCallback((id: string, updater: (note: Note) => Note) => {
    setNotes((current) =>
      current.map((note) => {
        if (note.id !== id) {
          return note
        }

        return {
          ...updater(note),
          updatedAt: new Date().toISOString(),
        }
      }),
    )
  }, [])

  const addNote = () => {
    const next = createBlankNote()
    setNotes((current) => [next, ...current])
    setShowTrash(false)
    setActiveNoteId(next.id)
  }

  const deleteActiveNote = () => {
    if (!activeNote || isShareMode) {
      return
    }

    updateNote(activeNote.id, (note) => ({
      ...note,
      favorited: false,
      tags: Array.from(new Set([...note.tags, TRASH_TAG])),
    }))

    const nextNote = liveNotes.find((note) => note.id !== activeNote.id) ?? notes.find((note) => note.id !== activeNote.id)
    if (nextNote) {
      setActiveNoteId(nextNote.id)
    }
  }

  const restoreNote = (noteId: string) => {
    updateNote(noteId, (note) => ({
      ...note,
      tags: withoutTrashTag(note.tags),
    }))
    setShowTrash(false)
    setActiveNoteId(noteId)
  }

  const permanentlyDeleteNote = async (noteId: string) => {
    const nextNotes = notes.filter((note) => note.id !== noteId)
    const fallbackNote = nextNotes.find((note) => !isTrashed(note)) ?? nextNotes[0] ?? createBlankNote()
    setNotes(nextNotes.length ? nextNotes : [fallbackNote])
    setActiveNoteId(fallbackNote.id)

    if (session && supabaseReady) {
      const client = getSupabaseClient()
      await client?.from('notes').delete().eq('id', noteId).eq('user_id', session.user.id)
    }
  }

  const updateActiveNote = (updater: (note: Note) => Note) => {
    if (!activeNote || isShareMode) {
      return
    }

    updateNote(activeNote.id, updater)
  }

  const updateBlock = (blockId: string, patch: Partial<NoteBlock>) => {
    updateActiveNote((note) => ({
      ...note,
      blocks: note.blocks.map((block) =>
        block.id === blockId ? { ...block, ...patch } : block,
      ),
    }))
  }

  const updateBlockContent = (block: NoteBlock, content: string) => {
    const transformed = markdownTransform(content, block.type)
    setSlashBlockId(content === '/' && block.type === 'paragraph' ? block.id : null)
    updateBlock(block.id, transformed ?? { content })
  }

  const appendBlock = (type: BlockType) => {
    updateActiveNote((note) => ({
      ...note,
      blocks: [...note.blocks, createBlock(type)],
    }))
  }

  const convertBlock = (blockId: string, type: BlockType) => {
    updateBlock(blockId, {
      type,
      content: type === 'heading' ? 'New section' : '',
      checked: type === 'todo' ? false : undefined,
    })
    setSlashBlockId(null)
  }

  const moveBlock = (targetId: string) => {
    if (!draggedBlockId || draggedBlockId === targetId) {
      return
    }

    updateActiveNote((note) => {
      const from = note.blocks.findIndex((block) => block.id === draggedBlockId)
      const to = note.blocks.findIndex((block) => block.id === targetId)

      if (from < 0 || to < 0) {
        return note
      }

      const blocks = [...note.blocks]
      const [moved] = blocks.splice(from, 1)
      blocks.splice(to, 0, moved)
      return { ...note, blocks }
    })
  }

  const deleteBlock = (blockId: string) => {
    updateActiveNote((note) => {
      const nextBlocks = note.blocks.filter((block) => block.id !== blockId)
      return {
        ...note,
        blocks: nextBlocks.length > 0 ? nextBlocks : [createBlock('paragraph')],
      }
    })
  }

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const client = getSupabaseClient()

    if (!client || !email.trim()) {
      return
    }

    setAuthMessage('Sending login link...')
    const { error } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: getLoginRedirectTo(),
      },
    })

    setAuthMessage(error ? error.message : 'Login link sent. Check your email.')
  }

  const handleSignOut = async () => {
    const client = getSupabaseClient()
    await client?.auth.signOut()
    setSession(null)
    setRemoteReady(false)
    setSyncState(supabaseReady ? 'ready' : 'local')
  }

  const importLocalNotes = () => {
    if (!mergePrompt) {
      return
    }

    const merged = [...mergePrompt.remote]
    for (const local of mergePrompt.local) {
      const existing = merged.findIndex((note) => note.id === local.id)
      if (existing >= 0) {
        if (new Date(local.updatedAt) > new Date(merged[existing].updatedAt)) {
          merged[existing] = local
        }
      } else {
        merged.push(local)
      }
    }

    setNotes(merged)
    setMergePrompt(null)
    setRemoteReady(true)
    setSyncState('syncing')
  }

  const keepServerNotes = () => {
    if (!mergePrompt) {
      return
    }

    setNotes(mergePrompt.remote)
    setMergePrompt(null)
    setRemoteReady(true)
  }

  const exportActiveNote = () => {
    if (!activeNote || typeof window === 'undefined') {
      return
    }

    const filename = `${activeNote.title || 'note'}`.replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '') || 'note'
    downloadText(`${filename}.md`, noteToMarkdown(activeNote))
  }

  const importMarkdown = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const content = await file.text()
    const next = markdownToNote(content)
    setNotes((current) => [next, ...current])
    setShowTrash(false)
    setActiveNoteId(next.id)
    event.target.value = ''
  }

  const renameFolder = (folder: string) => {
    const nextName = window.prompt('Rename folder', folder)?.trim()

    if (!nextName || nextName === folder) {
      return
    }

    setNotes((current) =>
      current.map((note) =>
        note.folder === folder
          ? { ...note, folder: nextName, updatedAt: new Date().toISOString() }
          : note,
      ),
    )
    setSelectedFolder(nextName)
  }

  const renameTag = (tag: string) => {
    const nextName = window.prompt('Rename tag', tag)?.trim()

    if (!nextName || nextName === tag) {
      return
    }

    setNotes((current) =>
      current.map((note) =>
        note.tags.includes(tag)
          ? {
              ...note,
              tags: Array.from(new Set(note.tags.map((item) => (item === tag ? nextName : item)))),
              updatedAt: new Date().toISOString(),
            }
          : note,
      ),
    )
    setSelectedTag(nextName)
  }

  const syncCopy = {
    local: {
      label: 'Local only',
      detail: 'Connect Supabase envs to sync across devices.',
      icon: <WifiOff size={13} />,
    },
    ready: {
      label: 'Ready',
      detail: 'Use email login to save notes to Supabase.',
      icon: <Database size={13} />,
    },
    syncing: {
      label: 'Syncing',
      detail: 'Saving the latest workspace changes.',
      icon: <Wifi size={13} />,
    },
    synced: {
      label: 'Synced',
      detail: 'The workspace is reflected in Supabase.',
      icon: <Check size={13} />,
    },
    error: {
      label: 'Check setup',
      detail: 'Review Supabase table, policies, or env vars.',
      icon: <X size={13} />,
    },
  } satisfies Record<SyncState, { label: string; detail: string; icon: React.ReactNode }>

  if (!activeNote) {
    return (
      <main className="empty-state">
        <div>
          <h1>Shared note not available</h1>
          <p>This page is private or no longer exists.</p>
        </div>
      </main>
    )
  }

  const keywords = firstKeywords(activeNote)
  const activeIsTrashed = isTrashed(activeNote)
  const wordCount = countWords(activeNote)
  const todoCount = activeNote.blocks.filter((block) => block.type === 'todo').length
  const doneCount = activeNote.blocks.filter((block) => block.type === 'todo' && block.checked).length

  return (
    <main className={`workspace-shell ${sidebarOpen ? 'sidebar-open' : ''} ${isShareMode ? 'share-mode' : ''} ${showTrash ? 'trash-open' : ''}`}>
      <div className="mobile-topbar">
        <button
          type="button"
          className="icon-button"
          title="Toggle sidebar"
          onClick={() => setSidebarOpen((open) => !open)}
        >
          {sidebarOpen ? <PanelLeftClose size={18} /> : <Menu size={18} />}
        </button>
        <strong>Note Atelier</strong>
        {!isShareMode && (
          <button type="button" className="icon-button" title="New page" onClick={addNote}>
            <Plus size={18} />
          </button>
        )}
      </div>

      <aside className="sidebar" aria-label="Workspace sidebar">
        <div className="brand-row">
          <div className="brand-mark">N</div>
          <div className="brand-copy">
            <strong>Note Atelier</strong>
            <span>{isShareMode ? 'Shared page' : 'Personal knowledge studio'}</span>
          </div>
          <button
            type="button"
            className="icon-button"
            title="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          >
            <PanelLeftClose size={17} />
          </button>
        </div>

        {!isShareMode && (
          <>
            <label className="search-box">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                aria-label="Search notes"
              />
            </label>

            <div className="filter-grid">
              <label>
                <Folder size={14} />
                <select value={selectedFolder} onChange={(event) => setSelectedFolder(event.target.value)}>
                  {folders.map((folder) => (
                    <option key={folder} value={folder}>
                      {folder}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Tags size={14} />
                <select value={selectedTag} onChange={(event) => setSelectedTag(event.target.value)}>
                  {tags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button type="button" className="new-doc-button" onClick={addNote}>
              <Plus size={16} />
              New page
            </button>

            <div className="quick-rail">
              <button type="button" className={showTrash ? 'active' : ''} onClick={() => setShowTrash((open) => !open)}>
                <Trash2 size={14} />
                Trash
                <span>{trashedNotes.length}</span>
              </button>
              <button type="button" onClick={() => setLibraryOpen((open) => !open)}>
                <SlidersHorizontal size={14} />
                Library
              </button>
            </div>
          </>
        )}

        {mergePrompt && (
          <div className="merge-card">
            <strong>Merge local notes?</strong>
            <p>You have browser notes and Supabase notes. Import local notes or keep the server version.</p>
            <button type="button" className="plain-button" onClick={importLocalNotes}>
              <UploadCloud size={14} />
              Import local
            </button>
            <button type="button" className="plain-button secondary" onClick={keepServerNotes}>
              Keep server
            </button>
          </div>
        )}

        <section className="rail-section">
          <div className="rail-section-title">
            <span>{isShareMode ? 'Shared' : showTrash ? 'Trash' : 'Favorites'}</span>
            {showTrash ? <Trash2 size={13} /> : <Star size={13} />}
          </div>
          <div className="doc-list">
            {(isShareMode ? notes : showTrash ? trashedNotes : favoriteNotes).map((note) => (
              <DocumentRow
                key={note.id}
                note={note}
                active={note.id === activeNote.id}
                query={query}
                onClick={() => setActiveNoteId(note.id)}
              />
            ))}
          </div>
        </section>

        {!isShareMode && !showTrash && !query.trim() && selectedFolder === 'All' && selectedTag === 'All' && recentNotes.length > 0 && (
          <section className="rail-section">
            <div className="rail-section-title">
              <span>Recent</span>
              <Clock3 size={13} />
            </div>
            <div className="doc-list">
              {recentNotes.map((note) => (
                <DocumentRow
                  key={note.id}
                  note={note}
                  active={note.id === activeNote.id}
                  query={query}
                  onClick={() => setActiveNoteId(note.id)}
                />
              ))}
            </div>
          </section>
        )}

        {!isShareMode && !showTrash && (
          <section className="rail-section">
            <div className="rail-section-title">
              <span>Workspace</span>
              <BookOpen size={13} />
            </div>
            <div className="doc-list">
              {regularNotes.map((note) => (
                <DocumentRow
                  key={note.id}
                  note={note}
                  active={note.id === activeNote.id}
                  query={query}
                  onClick={() => setActiveNoteId(note.id)}
                />
              ))}
            </div>
          </section>
        )}

        {!isShareMode && (
          <div className="sidebar-footer">
            <div className="sync-card">
              <div className="status-pill">
                {syncCopy[syncState].icon}
                {syncCopy[syncState].label}
              </div>
              <p>{syncCopy[syncState].detail}</p>
            </div>

            {supabaseReady ? (
              <div className="auth-card">
                {session ? (
                  <>
                    <div className="auth-line">
                      <Database size={14} />
                      <span>{session.user.email}</span>
                    </div>
                    <button type="button" className="plain-button" onClick={handleSignOut}>
                      <LogOut size={14} />
                      Sign out
                    </button>
                  </>
                ) : (
                  <form onSubmit={handleSignIn}>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="email@example.com"
                      aria-label="Login email"
                    />
                    <button type="submit" className="plain-button">
                      <LogIn size={14} />
                      Email login
                    </button>
                    {authMessage && <p>{authMessage}</p>}
                  </form>
                )}
              </div>
            ) : null}
          </div>
        )}
      </aside>

      <section className="editor-pane" aria-label="Note editor">
        <article className="editor-surface">
          <div className="editor-topline">
            <div className="meta-stack">
              <span className="meta-pill">
                <Clock3 size={14} />
                {formatUpdatedAt(activeNote.updatedAt)}
              </span>
              <span className="meta-pill">
                <FileText size={14} />
                {activeNote.blocks.length} blocks
              </span>
              <span className="meta-pill">
                <Hash size={14} />
                {wordCount} words
              </span>
              <span className="meta-pill">
                <Folder size={14} />
                {activeNote.folder}
              </span>
            </div>

            {!isShareMode && (
              <div className="editor-actions">
                <button
                  type="button"
                  className={`editor-action ${activeNote.favorited ? 'active' : ''}`}
                  title="Favorite"
                  onClick={() =>
                    updateActiveNote((note) => ({ ...note, favorited: !note.favorited }))
                  }
                >
                  <Star size={17} />
                </button>
                <button
                  type="button"
                  className="editor-action"
                  title={activeNote.isPublic ? 'Make private' : 'Create share link'}
                  onClick={() =>
                    updateActiveNote((note) => ({ ...note, isPublic: !note.isPublic }))
                  }
                >
                  {activeNote.isPublic ? <Unlock size={17} /> : <Lock size={17} />}
                </button>
                <button type="button" className="editor-action" title="New page" onClick={addNote}>
                  <Plus size={17} />
                </button>
                <button type="button" className="editor-action" title="Import markdown" onClick={() => importInputRef.current?.click()}>
                  <FileUp size={17} />
                </button>
                <button type="button" className="editor-action" title="Export markdown" onClick={exportActiveNote}>
                  <Download size={17} />
                </button>
              </div>
            )}
          </div>

          <input
            ref={importInputRef}
            id={IMPORT_INPUT_ID}
            className="hidden-file-input"
            type="file"
            accept=".md,.markdown,text/markdown,text/plain"
            onChange={importMarkdown}
          />

          {activeNote.isPublic && !isShareMode && (
            <div className="share-strip">
              <Share2 size={16} />
              <input value={shareUrlFor(activeNote.id)} readOnly aria-label="Share URL" />
              <button
                type="button"
                className="plain-button compact"
                onClick={async () => {
                  await navigator.clipboard.writeText(shareUrlFor(activeNote.id))
                  setCopiedShare(true)
                  window.setTimeout(() => setCopiedShare(false), 1400)
                }}
              >
                <Copy size={14} />
                {copiedShare ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}

          <div className="title-row">
            <input
              className="emoji-input"
              value={activeNote.icon}
              maxLength={2}
              aria-label="Page icon"
              readOnly={isShareMode || activeIsTrashed}
              onChange={(event) =>
                updateActiveNote((note) => ({ ...note, icon: event.target.value || 'P' }))
              }
            />
            <input
              className="title-input"
              value={activeNote.title}
              aria-label="Page title"
              readOnly={isShareMode || activeIsTrashed}
              onChange={(event) =>
                updateActiveNote((note) => ({ ...note, title: event.target.value }))
              }
            />
          </div>

          <textarea
            className="summary-input"
            value={activeNote.summary}
            aria-label="Page summary"
            placeholder="Summary"
            readOnly={isShareMode || activeIsTrashed}
            onChange={(event) =>
              updateActiveNote((note) => ({ ...note, summary: event.target.value }))
            }
          />

          {!isShareMode && !activeIsTrashed && (
            <div className="property-grid">
              <label>
                <span>Folder</span>
                <input
                  value={activeNote.folder}
                  onChange={(event) =>
                    updateActiveNote((note) => ({ ...note, folder: event.target.value || 'Inbox' }))
                  }
                />
              </label>
              <label>
                <span>Tags</span>
                <input
                  value={visibleTags(activeNote).join(', ')}
                  placeholder="design, release"
                  onChange={(event) =>
                      updateActiveNote((note) => ({ ...note, tags: normalizeTags(event.target.value) }))
                  }
                />
              </label>
            </div>
          )}

          {!isShareMode && !activeIsTrashed && (
            <div className="toolbar" aria-label="Add block">
              {(['paragraph', 'heading', 'todo', 'quote'] as BlockType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  className="toolbar-button"
                  title={`Add ${blockLabels[type]}`}
                  onClick={() => appendBlock(type)}
                >
                  {blockIcons[type]}
                  {blockLabels[type]}
                </button>
              ))}
            </div>
          )}

          <div className="blocks">
            {activeNote.blocks.map((block) => (
              <BlockEditor
                key={block.id}
                block={block}
                readonly={isShareMode || activeIsTrashed}
                dragged={draggedBlockId === block.id}
                showSlashMenu={slashBlockId === block.id}
                onDragStart={() => setDraggedBlockId(block.id)}
                onDragOver={(event) => {
                  event.preventDefault()
                  moveBlock(block.id)
                }}
                onDragEnd={() => setDraggedBlockId(null)}
                onChange={(patch) => updateBlock(block.id, patch)}
                onContentChange={(content) => updateBlockContent(block, content)}
                onConvert={(type) => convertBlock(block.id, type)}
                onDelete={() => deleteBlock(block.id)}
              />
            ))}
          </div>
        </article>
      </section>

      {!isShareMode && !activeIsTrashed && (
        <div className="mobile-commandbar" aria-label="Mobile actions">
          <button type="button" title="Text" onClick={() => appendBlock('paragraph')}>
            <Type size={18} />
          </button>
          <button type="button" title="Todo" onClick={() => appendBlock('todo')}>
            <ListTodo size={18} />
          </button>
          <button type="button" title="Import" onClick={() => importInputRef.current?.click()}>
            <FileUp size={18} />
          </button>
          <button type="button" title="Export" onClick={exportActiveNote}>
            <Download size={18} />
          </button>
        </div>
      )}

      <aside className="inspector" aria-label="Document info">
        <section className="right-card">
          <div className="right-title">
            <strong>Document</strong>
            <Sparkles size={16} />
          </div>
          <div className="stat-grid">
            <div className="stat-box">
              <span>Blocks</span>
              <strong>{activeNote.blocks.length}</strong>
            </div>
            <div className="stat-box">
              <span>Todos</span>
              <strong>
                {doneCount}/{todoCount}
              </strong>
            </div>
          </div>
          <p className="right-subtitle">Updated {formatUpdatedAt(activeNote.updatedAt)}</p>
        </section>

        <section className="right-card">
          <div className="right-title">
            <strong>Tags</strong>
            <Tags size={16} />
          </div>
          <div className="keyword-list">
            {visibleTags(activeNote).length > 0 ? (
              visibleTags(activeNote).map((tag, index) => <span key={`${tag}-${index}`}>{tag}</span>)
            ) : (
              <span>untagged</span>
            )}
          </div>
        </section>

        <section className="right-card">
          <div className="right-title">
            <strong>Keywords</strong>
            <Hash size={16} />
          </div>
          <div className="keyword-list">
            {keywords.length > 0 ? (
              keywords.map((word, index) => <span key={`${word}-${index}`}>{word}</span>)
            ) : (
              <span>draft</span>
            )}
          </div>
        </section>

        {!isShareMode && libraryOpen && (
          <section className="right-card library-card">
            <div className="right-title">
              <strong>Library</strong>
              <SlidersHorizontal size={16} />
            </div>
            <div className="library-group">
              <span>Folders</span>
              <div className="keyword-list">
                {folders.filter((folder) => folder !== 'All').map((folder) => (
                  <button key={folder} type="button" onClick={() => setSelectedFolder(folder)} onDoubleClick={() => renameFolder(folder)}>
                    <Folder size={13} />
                    {folder}
                  </button>
                ))}
              </div>
            </div>
            <div className="library-group">
              <span>Tags</span>
              <div className="keyword-list">
                {tags.filter((tag) => tag !== 'All').map((tag) => (
                  <button key={tag} type="button" onClick={() => setSelectedTag(tag)} onDoubleClick={() => renameTag(tag)}>
                    <Tags size={13} />
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {!isShareMode && (
          <section className="right-card">
            <div className="right-title">
              <strong>Actions</strong>
              <Link2 size={16} />
            </div>
            {activeIsTrashed ? (
              <>
                <button type="button" className="plain-button restore-button" onClick={() => restoreNote(activeNote.id)}>
                  <ArchiveRestore size={15} />
                  Restore page
                </button>
                <button type="button" className="danger-button" onClick={() => permanentlyDeleteNote(activeNote.id)}>
                  <Trash2 size={15} />
                  Delete forever
                </button>
              </>
            ) : (
              <>
                <button type="button" className="plain-button" onClick={exportActiveNote}>
                  <Download size={15} />
                  Export markdown
                </button>
                <button type="button" className="plain-button secondary-light" onClick={() => importInputRef.current?.click()}>
                  <FileUp size={15} />
                  Import markdown
                </button>
                <button type="button" className="danger-button" disabled={liveNotes.length === 1} onClick={deleteActiveNote}>
                  <Trash2 size={15} />
                  Move to trash
                </button>
              </>
            )}
          </section>
        )}
      </aside>
    </main>
  )
}

function DocumentRow({
  note,
  active,
  query,
  onClick,
}: {
  note: Note
  active: boolean
  query: string
  onClick: () => void
}) {
  const tags = visibleTags(note)

  return (
    <button type="button" className={`doc-row ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="doc-icon">{note.icon}</span>
      <span>
        <strong>
          <HighlightText value={note.title || 'Untitled Page'} query={query} />
        </strong>
        <span className="doc-meta">
          <HighlightText value={`${note.folder}${tags.length ? ` - ${tags.join(', ')}` : ''}`} query={query} />
        </span>
      </span>
    </button>
  )
}

function HighlightText({ value, query }: { value: string; query: string }) {
  const needle = query.trim()

  if (!needle) {
    return value
  }

  const index = value.toLowerCase().indexOf(needle.toLowerCase())

  if (index < 0) {
    return value
  }

  return (
    <>
      {value.slice(0, index)}
      <mark>{value.slice(index, index + needle.length)}</mark>
      {value.slice(index + needle.length)}
    </>
  )
}

function BlockEditor({
  block,
  readonly,
  dragged,
  showSlashMenu,
  onDragStart,
  onDragOver,
  onDragEnd,
  onChange,
  onContentChange,
  onConvert,
  onDelete,
}: {
  block: NoteBlock
  readonly: boolean
  dragged: boolean
  showSlashMenu: boolean
  onDragStart: () => void
  onDragOver: (event: DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
  onChange: (patch: Partial<NoteBlock>) => void
  onContentChange: (content: string) => void
  onConvert: (type: BlockType) => void
  onDelete: () => void
}) {
  const contentField = (
    <textarea
      value={block.content}
      aria-label={`${blockLabels[block.type]} block`}
      placeholder={block.type === 'heading' ? 'Section title' : 'Type #, >, -, or - [ ] for shortcuts'}
      readOnly={readonly}
      onChange={(event) => onContentChange(event.target.value)}
    />
  )

  return (
    <div
      className={`block ${block.type} ${block.checked ? 'is-checked' : ''} ${dragged ? 'is-dragged' : ''}`}
      draggable={!readonly}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="block-type">
        {!readonly && <GripVertical size={14} />}
        {blockIcons[block.type]}
        {blockLabels[block.type]}
      </div>

      {block.type === 'todo' ? (
        <label className="todo-field">
          <input
            type="checkbox"
            checked={Boolean(block.checked)}
            aria-label="Done"
            disabled={readonly}
            onChange={(event) => onChange({ checked: event.target.checked })}
          />
          {contentField}
        </label>
      ) : (
        contentField
      )}

      {showSlashMenu && !readonly && (
        <div className="slash-menu">
          {(['paragraph', 'heading', 'todo', 'quote'] as BlockType[]).map((type) => (
            <button key={type} type="button" onClick={() => onConvert(type)}>
              {blockIcons[type]}
              <span>{blockLabels[type]}</span>
            </button>
          ))}
        </div>
      )}

      {!readonly && (
        <button type="button" className="delete-block" title="Delete block" onClick={onDelete}>
          <Trash2 size={15} />
        </button>
      )}
    </div>
  )
}
