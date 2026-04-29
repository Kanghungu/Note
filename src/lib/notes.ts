export type BlockType = 'paragraph' | 'heading' | 'todo' | 'quote'

export type NoteBlock = {
  id: string
  type: BlockType
  content: string
  checked?: boolean
}

export type Note = {
  id: string
  title: string
  icon: string
  summary: string
  blocks: NoteBlock[]
  favorited: boolean
  folder: string
  tags: string[]
  isPublic: boolean
  updatedAt: string
}

const starterUpdatedAt = '2026-04-29T05:15:00.000Z'

export const starterNotes: Note[] = [
  {
    id: '4cbe10ba-6500-4cc9-9fa6-9674651c5c56',
    title: 'Product Meeting Notes',
    icon: 'N',
    summary: 'Plan the next release around writing flow, search, and Supabase sync.',
    favorited: true,
    folder: 'Product',
    tags: ['release', 'sync'],
    isPublic: false,
    updatedAt: starterUpdatedAt,
    blocks: [
      {
        id: '5bbb3f58-35a8-4c8f-8614-38d767cf65c5',
        type: 'heading',
        content: 'This week',
      },
      {
        id: '5505366f-a932-45ea-bd1f-c2a598d6fb31',
        type: 'todo',
        content: 'Create pages from the sidebar',
        checked: true,
      },
      {
        id: 'aab1bbd0-2c39-4e78-bcc9-e01f8e01a060',
        type: 'todo',
        content: 'Confirm per-user saving after Supabase login',
      },
      {
        id: '9a44b0c0-3e28-42aa-805c-06e94f247771',
        type: 'quote',
        content: 'Notes should open quickly and make editing feel invisible.',
      },
    ],
  },
  {
    id: '5dd2f86a-b792-4695-96d4-67c9a693a2f6',
    title: 'Content Calendar',
    icon: 'C',
    summary: 'Collect blog posts, release notes, and interview drafts in one workspace.',
    favorited: false,
    folder: 'Marketing',
    tags: ['writing', 'calendar'],
    isPublic: false,
    updatedAt: '2026-04-28T13:10:00.000Z',
    blocks: [
      {
        id: '9914385d-b03c-4b6c-adcb-c1765e886f7e',
        type: 'heading',
        content: 'Late April',
      },
      {
        id: '38d7cf8f-72fd-4122-8b07-758e27427296',
        type: 'paragraph',
        content: 'Write release notes around the new user flow, not just the changelog.',
      },
      {
        id: 'c2305ef5-2846-4ac0-a7c2-d08ff37f40b0',
        type: 'todo',
        content: 'Reduce customer interview prompts to seven questions',
      },
    ],
  },
  {
    id: 'e8adbb51-ef92-411c-bca8-daf504468cc0',
    title: 'Personal Wiki Structure',
    icon: 'W',
    summary: 'Sketch a simple structure for projects, references, and retrospectives.',
    favorited: false,
    folder: 'Wiki',
    tags: ['wiki', 'systems'],
    isPublic: false,
    updatedAt: '2026-04-27T08:24:00.000Z',
    blocks: [
      {
        id: 'd955a53a-c7ed-4b7b-b4af-1bfd21c86468',
        type: 'paragraph',
        content: 'Start with topics that are searched repeatedly instead of over-sorting too early.',
      },
      {
        id: '80d3e8da-86bd-4d7c-b030-1af4bedb7a35',
        type: 'quote',
        content: 'A good personal wiki makes the next action shorter.',
      },
    ],
  },
]

export function createBlankNote(): Note {
  return {
    id: crypto.randomUUID(),
    title: 'Untitled Page',
    icon: 'P',
    summary: '',
    favorited: false,
    folder: 'Inbox',
    tags: [],
    isPublic: false,
    updatedAt: new Date().toISOString(),
    blocks: [
      {
        id: crypto.randomUUID(),
        type: 'paragraph',
        content: '',
      },
    ],
  }
}

export function createBlock(type: BlockType): NoteBlock {
  const defaults: Record<BlockType, string> = {
    paragraph: '',
    heading: 'New section',
    todo: '',
    quote: '',
  }

  const block: NoteBlock = {
    id: crypto.randomUUID(),
    type,
    content: defaults[type],
  }

  if (type === 'todo') {
    block.checked = false
  }

  return block
}

export function countWords(note: Note) {
  const text = [note.title, note.summary, ...note.tags, ...note.blocks.map((block) => block.content)]
    .join(' ')
    .trim()

  return text ? text.split(/\s+/).length : 0
}

export function formatUpdatedAt(value: string) {
  const kst = new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000)
  const month = kst.getUTCMonth() + 1
  const day = kst.getUTCDate()
  const hour = kst.getUTCHours()
  const minute = String(kst.getUTCMinutes()).padStart(2, '0')
  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12

  return `${month}/${day} ${period} ${String(hour12).padStart(2, '0')}:${minute}`
}

export function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean)
  }

  if (typeof value === 'string') {
    return value.split(',').map((tag) => tag.trim()).filter(Boolean)
  }

  return []
}

export function normalizeBlocks(value: unknown): NoteBlock[] {
  if (!Array.isArray(value)) {
    return [createBlock('paragraph')]
  }

  const blocks = value
    .map((item): NoteBlock | null => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const block = item as Partial<NoteBlock>
      const allowedTypes: BlockType[] = ['paragraph', 'heading', 'todo', 'quote']
      const type = allowedTypes.includes(block.type as BlockType)
        ? (block.type as BlockType)
        : 'paragraph'

      const normalized: NoteBlock = {
        id: typeof block.id === 'string' ? block.id : crypto.randomUUID(),
        type,
        content: typeof block.content === 'string' ? block.content : '',
      }

      if (type === 'todo') {
        normalized.checked = Boolean(block.checked)
      }

      return normalized
    })
    .filter((block): block is NoteBlock => block !== null)

  return blocks.length > 0 ? blocks : [createBlock('paragraph')]
}

export function normalizeNote(value: Partial<Note> & { blocks?: unknown; tags?: unknown }): Note {
  return {
    id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
    title: typeof value.title === 'string' && value.title.trim() ? value.title : 'Untitled Page',
    icon: typeof value.icon === 'string' && value.icon.trim() ? value.icon : 'P',
    summary: typeof value.summary === 'string' ? value.summary : '',
    favorited: Boolean(value.favorited),
    folder: typeof value.folder === 'string' && value.folder.trim() ? value.folder : 'Inbox',
    tags: normalizeTags(value.tags),
    isPublic: Boolean(value.isPublic),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
    blocks: normalizeBlocks(value.blocks),
  }
}
