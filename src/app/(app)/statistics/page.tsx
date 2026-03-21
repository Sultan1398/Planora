import { redirect } from 'next/navigation'

/** إحصاءات العام مدمجة في المحفظة — تبويب «إحصاءات العام» */
export default function StatisticsPage() {
  redirect('/hub?tab=year')
}
