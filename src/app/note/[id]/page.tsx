import { NoteWorkspace } from '@/components/note-workspace'

export default async function NotePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return <NoteWorkspace initialNoteId={id} />
}
