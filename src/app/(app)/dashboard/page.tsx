import { redirect } from 'next/navigation'

/** التحليل مدمج في المحفظة — تبويب «التحليل» */
export default function DashboardPage() {
  redirect('/hub?tab=analytics')
}
