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

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const { data: document } = await supabase
    .from('documents')
    .select('id, storage_path, uploaded_by')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .single()

  if (!document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // documents are shared, so only the uploader or an owner/admin can remove one
  const isAdmin = profile.role === 'owner' || profile.role === 'admin'
  if (!isAdmin && document.uploaded_by !== user.id) {
    return NextResponse.json(
      { error: 'You can only delete documents you uploaded' },
      { status: 403 }
    )
  }

  // checked before touching storage, so a refused delete leaves the file in place
  const { error: storageError } = await supabase.storage
    .from('documents')
    .remove([document.storage_path])

  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 500 })
  }

  // chunks are removed by cascade
  const { error: deleteError } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
