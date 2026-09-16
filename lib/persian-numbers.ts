// Utilities for converting between Persian/English number words, digits, and Persian speech text.

const ONES = ["صفر", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"]
const TEENS = [
  "ده",
  "یازده",
  "دوازده",
  "سیزده",
  "چهارده",
  "پانزده",
  "شانزده",
  "هفده",
  "هجده",
  "نوزده",
]
const TENS = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"]
const HUNDREDS = [
  "",
  "صد",
  "دویست",
  "سیصد",
  "چهارصد",
  "پانصد",
  "ششصد",
  "هفتصد",
  "هشتصد",
  "نهصد",
]
const SCALES = ["", "هزار", "میلیون", "میلیارد", "بیلیون"]

// Convert English/Persian digit characters to plain Latin digits.
export function normalizeDigits(input: string): string {
  const persian = "۰۱۲۳۴۵۶۷۸۹"
  const arabic = "٠١٢٣٤٥٦٧٨٩"
  return input.replace(/[۰-۹٠-٩]/g, (ch) => {
    const p = persian.indexOf(ch)
    if (p > -1) return String(p)
    const a = arabic.indexOf(ch)
    if (a > -1) return String(a)
    return ch
  })
}

// Map a single spoken word to its numeric value (returns null if not a number word).
export const WORD_VALUES: Record<string, number> = {
  صفر: 0,
  زیرو: 0,
  zero: 0,
  یک: 1,
  یه: 1,
  one: 1,
  دو: 2,
  two: 2,
  سه: 3,
  three: 3,
  چهار: 4,
  four: 4,
  پنج: 5,
  five: 5,
  شش: 6,
  شیش: 6,
  six: 6,
  هفت: 7,
  seven: 7,
  هشت: 8,
  eight: 8,
  نه: 9,
  nine: 9,
  ده: 10,
  ten: 10,
  یازده: 11,
  eleven: 11,
  دوازده: 12,
  twelve: 12,
  سیزده: 13,
  thirteen: 13,
  چهارده: 14,
  fourteen: 14,
  پانزده: 15,
  پونزده: 15,
  fifteen: 15,
  شانزده: 16,
  شونزده: 16,
  sixteen: 16,
  هفده: 17,
  هیفده: 17,
  seventeen: 17,
  هجده: 18,
  هیجده: 18,
  eighteen: 18,
  نوزده: 19,
  nineteen: 19,
  بیست: 20,
  twenty: 20,
  سی: 30,
  thirty: 30,
  چهل: 40,
  forty: 40,
  پنجاه: 50,
  fifty: 50,
  شصت: 60,
  sixty: 60,
  هفتاد: 70,
  seventy: 70,
  هشتاد: 80,
  eighty: 80,
  نود: 90,
  ninety: 90,
  صد: 100,
  یکصد: 100,
  hundred: 100,
  دویست: 200,
  سیصد: 300,
  چهارصد: 400,
  پانصد: 500,
  پونصد: 500,
  ششصد: 600,
  هفتصد: 700,
  هشتصد: 800,
  نهصد: 900,
  هزار: 1000,
  thousand: 1000,
  میلیون: 1_000_000,
  million: 1_000_000,
  میلیارد: 1_000_000_000,
  billion: 1_000_000_000,
}

// Combine a sequence of number-word values into a single number.
// e.g. [20, 5] -> 25 ; [100, 20, 3] -> 123 ; [2, 1000] -> 2000
export function combineNumberWords(values: number[]): number {
  let result = 0
  let current = 0
  for (const v of values) {
    if (v === 100) {
      current = (current === 0 ? 1 : current) * 100
    } else if (v >= 1000) {
      result += (current === 0 ? 1 : current) * v
      current = 0
    } else {
      current += v
    }
  }
  return result + current
}

// Convert a number into Persian words for speech output.
export function numberToPersianWords(value: number): string {
  if (!isFinite(value)) return "تعریف نشده"
  if (Number.isNaN(value)) return "نامشخص"

  let sign = ""
  if (value < 0) {
    sign = "منفی "
    value = Math.abs(value)
  }

  const rounded = Number(value.toPrecision(12))
  const [intPartRaw, decPartRaw] = String(rounded).split(".")
  const intPart = Number(intPartRaw)

  let words = sign + integerToPersianWords(intPart)

  if (decPartRaw) {
    words += " ممیز " + decimalDigitsToWords(decPartRaw)
  }

  return words.trim()
}

function integerToPersianWords(n: number): string {
  if (n === 0) return "صفر"

  const groups: number[] = []
  let remaining = n
  while (remaining > 0) {
    groups.push(remaining % 1000)
    remaining = Math.floor(remaining / 1000)
  }

  const parts: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i]
    if (group === 0) continue
    const groupWords = threeDigitToWords(group)
    const scale = SCALES[i]
    parts.push(scale ? `${groupWords} ${scale}` : groupWords)
  }

  return parts.join(" و ")
}

function threeDigitToWords(n: number): string {
  const parts: string[] = []
  const h = Math.floor(n / 100)
  const rest = n % 100

  if (h > 0) parts.push(HUNDREDS[h])

  if (rest > 0) {
    if (rest < 10) {
      parts.push(ONES[rest])
    } else if (rest < 20) {
      parts.push(TEENS[rest - 10])
    } else {
      const t = Math.floor(rest / 10)
      const o = rest % 10
      if (o > 0) {
        parts.push(`${TENS[t]} و ${ONES[o]}`)
      } else {
        parts.push(TENS[t])
      }
    }
  }

  return parts.join(" و ")
}

function decimalDigitsToWords(decStr: string): string {
  return decStr
    .split("")
    .map((d) => ONES[Number(d)] ?? "")
    .join(" ")
    .trim()
}
