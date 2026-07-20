import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardShell from './dashboard-shell'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, tenants(name)')
    .eq('id', user.id)
    .single()

  const { data: documents } = await supabase
    .from('documents')
    .select('id, filename, status, created_at')
    .order('created_at', { ascending: false })

  return (
    <DashboardShell
      workspaceName={(profile?.tenants as any)?.name ?? 'Your workspace'}
      documents={documents ?? []}
    />
  )
}