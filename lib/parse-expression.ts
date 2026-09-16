import { normalizeDigits, WORD_VALUES, combineNumberWords } from "./persian-numbers"

// Words that map to arithmetic operators (Persian + English).
const OP_WORDS: Record<string, string> = {
  // raw symbols (keypad + recognized digits)
  "+": "+",
  "-": "-",
  "*": "*",
  "/": "/",
  // plus
  جمع: "+",
  بعلاوه: "+",
  علاوه: "+",
  اضافه: "+",
  بعلاوهٔ: "+",
  plus: "+",
  add: "+",
  // minus
  منها: "-",
  منهای: "-",
  منهی: "-",
  تفریق: "-",
  کم: "-",
  minus: "-",
  subtract: "-",
  // multiply
  ضرب: "*",
  ضربدر: "*",
  در: "*",
  times: "*",
  multiply: "*",
  multiplied: "*",
  x: "*",
  "×": "*",
  // divide
  تقسیم: "/",
  بخش: "/",
  بر: "/",
  divide: "/",
  divided: "/",
  over: "/",
  "÷": "/",
  // power
  توان: "^",
  power: "^",
  "^": "^",
}

// Words to completely ignore (fillers / connectors handled elsewhere).
const IGNORE_WORDS = new Set([
  "به",
  "را",
  "رو",
  "چند",
  "چنده",
  "چقدر",
  "چقدره",
  "میشه",
  "می‌شه",
  "بشه",
  "مساوی",
  "برابر",
  "حساب",
  "کن",
  "بگو",
  "لطفا",
  "لطفاً",
  "the",
  "is",
  "what",
  "equals",
  "equal",
  "calculate",
  "please",
])

const NEGATIVE_WORDS = new Set(["منفی", "negative"])
const PERCENT_WORDS = new Set(["درصد", "percent", "%"])
const OF_WORDS = new Set(["از", "of"])
const DECIMAL_WORDS = new Set(["ممیز", "نقطه", "point", "dot", "."])

type Token =
  | { type: "num"; value: number }
  | { type: "op"; value: string }
  | { type: "percent" }
  | { type: "of" }

export interface ParseResult {
  ok: boolean
  result?: number
  display?: string
  error?: string
}

// Split spoken text into recognized tokens.
function tokenize(text: string): Token[] {
  let normalized = normalizeDigits(text.toLowerCase())
  // Add spaces around standalone symbols so they tokenize cleanly.
  normalized = normalized.replace(/([+\-*/^×÷%])/g, " $1 ")
  const rawTokens = normalized
    .replace(/[,،؟?!]/g, " ")
    .split(/\s+/)
    .filter(Boolean)

  const tokens: Token[] = []
  let numberWords: number[] = []
  let decimalMode = false
  let decimalWords: number[] = []
  let pendingSign = 1

  const flushNumber = () => {
    if (numberWords.length === 0 && decimalWords.length === 0 && !decimalMode) return
    let value = combineNumberWords(numberWords)
    if (decimalMode && decimalWords.length > 0) {
      const decInt = combineNumberWords(decimalWords)
      value = Number(`${value}.${decInt}`)
    }
    tokens.push({ type: "num", value: value * pendingSign })
    numberWords = []
    decimalWords = []
    decimalMode = false
    pendingSign = 1
  }

  const pushOp = (op: string) => {
    flushNumber()
    // Replace a trailing operator instead of stacking (handles "تقسیم بر").
    const last = tokens[tokens.length - 1]
    if (last && last.type === "op") {
      last.value = op
    } else {
      tokens.push({ type: "op", value: op })
    }
  }

  for (const tok of rawTokens) {
    // Direct numeric literal (possibly decimal).
    if (/^\d+(\.\d+)?$/.test(tok)) {
      const num = Number(tok)
      if (decimalMode) {
        decimalWords.push(num)
      } else {
        numberWords.push(num)
      }
      continue
    }

    if (tok === "و" || tok === "and") {
      // Connector inside a number; ignore.
      continue
    }

    if (NEGATIVE_WORDS.has(tok)) {
      flushNumber()
      pendingSign = -1
      continue
    }

    if (DECIMAL_WORDS.has(tok)) {
      decimalMode = true
      continue
    }

    if (PERCENT_WORDS.has(tok)) {
      flushNumber()
      tokens.push({ type: "percent" })
      continue
    }

    if (OF_WORDS.has(tok)) {
      flushNumber()
      tokens.push({ type: "of" })
      continue
    }

    if (tok in OP_WORDS) {
      pushOp(OP_WORDS[tok])
      continue
    }

    const value = WORD_VALUES[tok]
    if (value !== undefined) {
      if (decimalMode) {
        decimalWords.push(value)
      } else {
        numberWords.push(value)
      }
      continue
    }

    // Unknown word (filler / connector) -> ignore.
    if (IGNORE_WORDS.has(tok)) continue
  }

  flushNumber()
  return tokens
}

// Resolve percent tokens into numeric values.
function resolvePercent(tokens: Token[]): Token[] {
  const out: Token[] = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.type === "num" && tokens[i + 1]?.type === "percent") {
      const next2 = tokens[i + 2]
      const next3 = tokens[i + 3]
      if (next2?.type === "of" && next3?.type === "num") {
        // "X درصد از Y" => X/100 * Y
        out.push({ type: "num", value: (t.value / 100) * next3.value })
        i += 3
      } else {
        // "X درصد" => X/100
        out.push({ type: "num", value: t.value / 100 })
        i += 1
      }
    } else if (t.type === "percent" || t.type === "of") {
      // stray, ignore
    } else {
      out.push(t)
    }
  }
  return out
}

const PRECEDENCE: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 }

// Evaluate a flat number/operator token stream with a shunting-yard algorithm.
function evaluate(tokens: Token[]): number {
  const values: number[] = []
  const ops: string[] = []

  const applyOp = () => {
    const op = ops.pop()!
    const b = values.pop()
    const a = values.pop()
    if (a === undefined || b === undefined) throw new Error("عبارت ناقص است")
    switch (op) {
      case "+":
        values.push(a + b)
        break
      case "-":
        values.push(a - b)
        break
      case "*":
        values.push(a * b)
        break
      case "/":
        if (b === 0) throw new Error("تقسیم بر صفر ممکن نیست")
        values.push(a / b)
        break
      case "^":
        values.push(Math.pow(a, b))
        break
    }
  }

  for (const t of tokens) {
    if (t.type === "num") {
      values.push(t.value)
    } else if (t.type === "op") {
      while (
        ops.length > 0 &&
        ((t.value !== "^" && PRECEDENCE[ops[ops.length - 1]] >= PRECEDENCE[t.value]) ||
          (t.value === "^" && PRECEDENCE[ops[ops.length - 1]] > PRECEDENCE[t.value]))
      ) {
        applyOp()
      }
      ops.push(t.value)
    }
  }

  while (ops.length > 0) applyOp()

  if (values.length !== 1) throw new Error("عبارت نامعتبر است")
  return values[0]
}

const DISPLAY_SYMBOL: Record<string, string> = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
  "^": "^",
}

function buildDisplay(tokens: Token[]): string {
  return tokens
    .map((t) => {
      if (t.type === "num") return formatNumber(t.value)
      if (t.type === "op") return DISPLAY_SYMBOL[t.value] ?? t.value
      return ""
    })
    .filter(Boolean)
    .join(" ")
}

export function formatNumber(value: number): string {
  if (!isFinite(value)) return "∞"
  const rounded = Number(value.toPrecision(12))
  return String(rounded)
}

// Evaluate a symbolic expression string typed via the keypad (e.g. "12+3*4").
export function evaluateExpressionString(expr: string): ParseResult {
  try {
    const tokens = tokenize(expr)
    if (tokens.length === 0) return { ok: false, error: "عبارت خالی است" }
    const resolved = resolvePercent(tokens)
    const result = evaluate(resolved)
    return { ok: true, result, display: buildDisplay(resolved) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "خطا در محاسبه" }
  }
}

// Main entry: turn recognized speech into a computed result.
export function parseSpeechToResult(text: string): ParseResult {
  try {
    const tokens = tokenize(text)
    if (tokens.length === 0) {
      return { ok: false, error: "چیزی برای محاسبه پیدا نشد" }
    }
    const resolved = resolvePercent(tokens)
    const hasNumber = resolved.some((t) => t.type === "num")
    if (!hasNumber) {
      return { ok: false, error: "عددی در گفته‌ی شما پیدا نشد" }
    }
    const result = evaluate(resolved)
    return {
      ok: true,
      result,
      display: buildDisplay(resolved),
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "خطا در محاسبه" }
  }
}
