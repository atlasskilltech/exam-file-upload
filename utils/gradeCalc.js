// Grade calculator based on percentage
function calcGrade(obtained, total) {
  if (!total || total <= 0) return 'N/A';
  const pct = (obtained / total) * 100;
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 50) return 'D';
  return 'F';
}

module.exports = calcGrade;
