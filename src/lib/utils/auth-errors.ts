export function mapAuthError(message: string): string {
  const m = (message || '').toLowerCase()

  if (m.includes('invalid email')) {
    return 'يرجى إدخال بريد إلكتروني صالح.'
  }

  if (m.includes('invalid login credentials')) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
  }

  if (m.includes('password should be at least')) {
    return 'كلمة المرور ضعيفة، يجب أن تحتوي على 6 أحرف على الأقل.'
  }

  if (m.includes('user already registered')) {
    return 'هذا البريد الإلكتروني مسجل لدينا بالفعل.'
  }

  if (m.includes('expired') || m.includes('invalid_recovery_code')) {
    return 'الرابط غير صالح أو منتهي الصلاحية. الرجاء طلب رابط جديد.'
  }

  return 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى لاحقاً.'
}
