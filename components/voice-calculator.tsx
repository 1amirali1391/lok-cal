"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Mic, Delete, Volume2, VolumeX, Languages } from "lucide-react"
import { parseSpeechToResult, evaluateExpressionString, formatNumber } from "@/lib/parse-expression"
import { numberToPersianWords } from "@/lib/persian-numbers"
import { cn } from "@/lib/utils"

type Lang = "fa" | "en"

interface HistoryItem {
  id: number
  expression: string
  result: string
  heard?: string
}

// Minimal typing for the vendor-prefixed Web Speech API.
type SpeechRecognitionInstance = {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((event: any) => void) | null
  onerror: ((event: any) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

export function VoiceCalculator() {
  const [expression, setExpression] = useState("")
  const [result, setResult] = useState<string | null>(null)
  const [heard, setHeard] = useState("")
  const [status, setStatus] = useState<"idle" | "listening" | "error">("idle")
  const [statusText, setStatusText] = useState("")
  const [lang, setLang] = useState<Lang>("fa")
  const [muted, setMuted] = useState(false)
  const [supported, setSupported] = useState(true)
  const [history, setHistory] = useState<HistoryItem[]>([])

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const mutedRef = useRef(muted)
  const historyId = useRef(0)

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  useEffect(() => {
    const w = window as any
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SR) {
      setSupported(false)
      return
    }
    // Warm up speech synthesis voices.
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices()
    }
  }, [])

  const speak = useCallback((value: number) => {
    if (mutedRef.current) return
    if (!("speechSynthesis" in window)) return
    const text = numberToPersianWords(value)
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = "fa-IR"
    utter.rate = 0.95
    const voices = window.speechSynthesis.getVoices()
    const faVoice = voices.find((v) => v.lang?.toLowerCase().startsWith("fa"))
    if (faVoice) utter.voice = faVoice
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utter)
  }, [])

  const applyResult = useCallback(
    (res: ReturnType<typeof parseSpeechToResult>, heardText?: string) => {
      if (res.ok && res.result !== undefined) {
        const formatted = formatNumber(res.result)
        setExpression(res.display ?? "")
        setResult(formatted)
        setStatus("idle")
        setStatusText("")
        setHistory((prev) =>
          [
            {
              id: historyId.current++,
              expression: res.display ?? "",
              result: formatted,
              heard: heardText,
            },
            ...prev,
          ].slice(0, 20),
        )
        speak(res.result)
      } else {
        setStatus("error")
        setStatusText(res.error ?? "خطا")
      }
    },
    [speak],
  )

  const startListening = useCallback(() => {
    const w = window as any
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SR) {
      setSupported(false)
      return
    }
    // Stop any ongoing session first.
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
      setStatus("idle")
      return
    }

    const recognition: SpeechRecognitionInstance = new SR()
    recognition.lang = lang === "fa" ? "fa-IR" : "en-US"
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1

    setHeard("")
    setStatus("listening")
    setStatusText(lang === "fa" ? "در حال گوش دادن..." : "Listening...")

    recognition.onresult = (event: any) => {
      let transcript = ""
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      setHeard(transcript)
      const last = event.results[event.results.length - 1]
      if (last.isFinal) {
        const res = parseSpeechToResult(transcript)
        applyResult(res, transcript)
      }
    }

    recognition.onerror = (event: any) => {
      setStatus("error")
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setStatusText("دسترسی به میکروفون داده نشد")
      } else if (event.error === "no-speech") {
        setStatusText("صدایی شنیده نشد، دوباره تلاش کنید")
      } else {
        setStatusText("خطا در تشخیص گفتار")
      }
    }

    recognition.onend = () => {
      recognitionRef.current = null
      setStatus((s) => (s === "listening" ? "idle" : s))
      setStatusText((t) => (t === "در حال گوش دادن..." || t === "Listening..." ? "" : t))
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [lang, applyResult])

  // Keypad handling ---------------------------------------------------------
  const handleKey = useCallback(
    (key: string) => {
      if (key === "C") {
        setExpression("")
        setResult(null)
        setStatusText("")
        setStatus("idle")
        return
      }
      if (key === "back") {
        setExpression((e) => e.slice(0, -1))
        return
      }
      if (key === "=") {
        if (!expression) return
        const res = evaluateExpressionString(expression)
        applyResult(res)
        return
      }
      // If a result is showing and user types a digit, start fresh.
      setResult(null)
      setStatus("idle")
      setStatusText("")
      setExpression((e) => e + key)
    },
    [expression, applyResult],
  )

  const keys: { label: string; value: string; variant?: "op" | "fn" | "eq" }[] = [
    { label: "C", value: "C", variant: "fn" },
    { label: "^", value: "^", variant: "fn" },
    { label: "%", value: "%", variant: "fn" },
    { label: "÷", value: "/", variant: "op" },
    { label: "7", value: "7" },
    { label: "8", value: "8" },
    { label: "9", value: "9" },
    { label: "×", value: "*", variant: "op" },
    { label: "4", value: "4" },
    { label: "5", value: "5" },
    { label: "6", value: "6" },
    { label: "−", value: "-", variant: "op" },
    { label: "1", value: "1" },
    { label: "2", value: "2" },
    { label: "3", value: "3" },
    { label: "+", value: "+", variant: "op" },
    { label: "0", value: "0" },
    { label: ".", value: "." },
    { label: "⌫", value: "back", variant: "fn" },
    { label: "=", value: "=", variant: "eq" },
  ]

  const isListening = status === "listening"

  return (
    <div className="w-full max-w-md" dir="rtl">
      <div className="rounded-3xl border border-white/10 bg-neutral-900/60 p-5 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-bold text-white">
              لاک
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-white">ماشین‌حساب صوتی</p>
              <p className="text-[11px] text-neutral-400">با صدا حساب کن</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLang((l) => (l === "fa" ? "en" : "fa"))}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-neutral-200 transition hover:bg-white/10"
              aria-label="تغییر زبان"
            >
              <Languages className="h-3.5 w-3.5" />
              {lang === "fa" ? "فارسی" : "English"}
            </button>
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-neutral-200 transition hover:bg-white/10"
              aria-label={muted ? "روشن کردن صدا" : "خاموش کردن صدا"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Display */}
        <div className="mb-4 rounded-2xl bg-black/40 p-4 text-left" dir="ltr">
          <div className="min-h-5 text-sm text-neutral-400 break-all">
            {expression || (result === null ? "\u00A0" : "")}
          </div>
          <div className="mt-1 text-4xl font-semibold tracking-tight text-white tabular-nums break-all">
            {result ?? (expression || "0")}
          </div>
        </div>

        {/* Voice status */}
        <div className="mb-4 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={startListening}
            disabled={!supported}
            className={cn(
              "relative flex h-16 w-16 items-center justify-center rounded-full text-white transition disabled:opacity-40",
              isListening
                ? "bg-gradient-to-br from-rose-500 to-red-500"
                : "bg-gradient-to-br from-violet-500 to-fuchsia-500 hover:brightness-110",
            )}
            aria-label={isListening ? "توقف ضبط" : "شروع صحبت"}
          >
            {isListening && (
              <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/40" />
            )}
            <Mic className="relative h-6 w-6" />
          </button>
          <div className="h-9 text-center">
            {!supported ? (
              <p className="text-xs text-rose-400">
                مرورگر شما از تشخیص گفتار پشتیبانی نمی‌کند (کروم را امتحان کنید)
              </p>
            ) : status === "error" ? (
              <p className="text-xs text-rose-400">{statusText}</p>
            ) : isListening ? (
              <p className="text-xs text-violet-300">{statusText}</p>
            ) : heard ? (
              <p className="text-xs text-neutral-400">
                شنیدم: <span className="text-neutral-200">{heard}</span>
              </p>
            ) : (
              <p className="text-xs text-neutral-500">
                دکمه میکروفون را بزن و بگو: «پنج به علاوه سه»
              </p>
            )}
          </div>
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-4 gap-2">
          {keys.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => handleKey(k.value)}
              className={cn(
                "flex h-14 items-center justify-center rounded-xl text-lg font-medium transition active:scale-95",
                k.variant === "op" &&
                  "bg-violet-500/20 text-violet-200 hover:bg-violet-500/30",
                k.variant === "fn" && "bg-white/5 text-neutral-300 hover:bg-white/10",
                k.variant === "eq" &&
                  "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white hover:brightness-110",
                !k.variant && "bg-white/10 text-white hover:bg-white/15",
              )}
            >
              {k.value === "back" ? <Delete className="h-5 w-5" /> : k.label}
            </button>
          ))}
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-neutral-900/40 p-4">
          <p className="mb-2 text-xs font-medium text-neutral-400">تاریخچه</p>
          <ul className="flex flex-col gap-2">
            {history.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2 text-sm"
                dir="ltr"
              >
                <span className="truncate text-neutral-400">{item.expression}</span>
                <span className="font-semibold text-white tabular-nums">= {item.result}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
