/**
 * تنسيق أرقام بأرقام لاتينية 0–9 دائماً (عربي/إنجليزي في الواجهة).
 * يستخدم locale إنجليزي للأرقام لتفادي الأرقام الهندية الشرقية في ar-SA.
 */
export const westernDecimal2 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
