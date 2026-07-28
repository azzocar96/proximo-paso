const COLORS: Record<string, string> = {
  // genéricos
  valid: 'bg-green-100 text-green-800', completed: 'bg-green-100 text-green-800',
  certified: 'bg-emerald-100 text-emerald-800', issued: 'bg-green-100 text-green-800',
  delivered: 'bg-emerald-100 text-emerald-800', active: 'bg-green-100 text-green-800',
  assigned: 'bg-green-100 text-green-800',
  in_progress: 'bg-blue-100 text-blue-800', enrolled: 'bg-blue-100 text-blue-800',
  registered: 'bg-blue-100 text-blue-800', registration_open: 'bg-blue-100 text-blue-800',
  open: 'bg-blue-100 text-blue-800', interested: 'bg-blue-100 text-blue-800',
  contacted: 'bg-blue-100 text-blue-800', interview_scheduled: 'bg-indigo-100 text-indigo-800',
  requirements_pending: 'bg-amber-100 text-amber-800', pending_approval: 'bg-amber-100 text-amber-800',
  eligible: 'bg-amber-100 text-amber-800', physical_pending: 'bg-amber-100 text-amber-800',
  ready_for_pickup: 'bg-amber-100 text-amber-800', pending_contact: 'bg-amber-100 text-amber-800',
  suggested: 'bg-purple-100 text-purple-800', scheduled: 'bg-gray-100 text-gray-700',
  draft: 'bg-gray-100 text-gray-700', new: 'bg-blue-100 text-blue-800',
  withdrawn: 'bg-gray-100 text-gray-500', cancelled: 'bg-red-100 text-red-700',
  revoked: 'bg-red-100 text-red-700', declined: 'bg-red-100 text-red-700',
  inactive: 'bg-gray-100 text-gray-500', closed: 'bg-gray-100 text-gray-700',
  archived: 'bg-gray-100 text-gray-500', resolved: 'bg-green-100 text-green-800',
};
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <span className={`badge ${COLORS[status] ?? 'bg-gray-100 text-gray-700'}`}>{label ?? status}</span>;
}
