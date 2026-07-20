import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // RLS ensures this only finds the document if it belongs to the
  // caller's own tenant — a stranger's document ID just returns nothing.
  const { data: document, error: fetchError } = await supabase
    .from('documents')
    .select('id, storage_path')
    .eq('id', id)
    .single()

  if (fetchError || !document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const { error: storageError } = await supabase.storage
    .from('documents')
    .remove([document.storage_path])

  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 500 })
  }

  // Cascade delete in the schema handles document_chunks automatically.
  const { error: deleteError } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}