/**
 * Sabit güvenlik soruları (kayıt + şifre unuttum).
 * Cevaplar normalize edilip bcrypt ile saklanır.
 */
const SECURITY_QUESTIONS = [
  { id: 'favorite_color', labelKey: 'auth.securityQ.favoriteColor' },
  { id: 'favorite_food', labelKey: 'auth.securityQ.favoriteFood' },
  { id: 'childhood_city', labelKey: 'auth.securityQ.childhoodCity' },
  { id: 'lucky_number', labelKey: 'auth.securityQ.luckyNumber' },
];

/** Eski hesaplarda kalmış soru id’leri (yeni kayıtta seçilmez) */
const LEGACY_QUESTION_LABELS = {
  first_teacher: 'auth.securityQ.firstTeacher',
};

const SECURITY_QUESTION_IDS = new Set(SECURITY_QUESTIONS.map((q) => q.id));

const isValidSecurityQuestionId = (id) => SECURITY_QUESTION_IDS.has(id);

const labelKeyForQuestionId = (id) => {
  const current = SECURITY_QUESTIONS.find((q) => q.id === id);
  if (current) return current.labelKey;
  return LEGACY_QUESTION_LABELS[id] || null;
};

/**
 * Cevabı karşılaştırma için normalize et.
 * Küçük/büyük harf duyarsız (tr-TR: İ/I doğru işlenir).
 */
const normalizeSecurityAnswer = (answer) =>
  String(answer || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('tr-TR');

const isValidSecurityAnswer = (answer) => {
  const n = normalizeSecurityAnswer(answer);
  // Uğurlu sayı gibi tek karakterli cevaplar da geçerli
  return n.length >= 1 && n.length <= 64;
};

/** Admin'in unutan kullanıcıya ilettiği geçici şifre */
const TEMP_PASSWORD = 'PocaPocket1!';

module.exports = {
  SECURITY_QUESTIONS,
  SECURITY_QUESTION_IDS,
  LEGACY_QUESTION_LABELS,
  isValidSecurityQuestionId,
  labelKeyForQuestionId,
  normalizeSecurityAnswer,
  isValidSecurityAnswer,
  TEMP_PASSWORD,
};
