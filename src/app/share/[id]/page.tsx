import { NoteWorkspace } from '@/components/note-workspace'

export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return <NoteWorkspace sharedNoteId={id} />
}
