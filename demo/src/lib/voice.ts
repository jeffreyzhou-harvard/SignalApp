// Voice harness — stands in for Grok Voice. Real speech synthesis + speech
// recognition where the browser supports it, deterministic fallbacks where
// it doesn't (captions always render, Space/click advances, autopilot types
// the scripted line). The demo can never stall on a flaky mic.

type Interim = (text: string) => void

const SR: any =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null

export const voiceSupport = {
  tts: typeof window !== 'undefined' && 'speechSynthesis' in window,
  stt: !!SR,
}

let chosenVoice: SpeechSynthesisVoice | null = null
function pickVoice() {
  if (!voiceSupport.tts || chosenVoice) return chosenVoice
  const voices = window.speechSynthesis.getVoices()
  const prefs = ['Samantha', 'Google US English', 'Karen', 'Daniel']
  for (const p of prefs) {
    const v = voices.find((v) => v.name.includes(p))
    if (v) return (chosenVoice = v)
  }
  return (chosenVoice = voices.find((v) => v.lang.startsWith('en')) ?? null)
}
if (voiceSupport.tts) window.speechSynthesis.onvoiceschanged = pickVoice

/** Speak a line. Resolves when audio ends (or after a reading-time fallback). */
export function speak(text: string, muted: boolean): Promise<void> {
  const readingMs = Math.max(1400, (text.split(/\s+/).length / 3.1) * 1000)
  if (muted || !voiceSupport.tts) {
    return new Promise((res) => setTimeout(res, readingMs))
  }
  return new Promise((res) => {
    const u = new SpeechSynthesisUtterance(text)
    const v = pickVoice()
    if (v) u.voice = v
    u.rate = 1.04
    u.pitch = 1.0
    let done = false
    const finish = () => {
      if (!done) {
        done = true
        res()
      }
    }
    u.onend = finish
    u.onerror = finish
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
    // belt-and-braces: some browsers never fire onend
    setTimeout(finish, readingMs * 2.2)
  })
}

export function stopSpeaking() {
  if (voiceSupport.tts) window.speechSynthesis.cancel()
}

export interface ListenHandle {
  result: Promise<string | null>
  stop: () => void
}

/** One-shot recognition. Resolves with a transcript, or null on error/timeout. */
export function listen(onInterim: Interim, timeoutMs = 20000): ListenHandle {
  if (!voiceSupport.stt) {
    return { result: Promise.resolve(null), stop: () => {} }
  }
  const rec = new SR()
  rec.lang = 'en-US'
  rec.interimResults = true
  rec.continuous = false
  let stopped = false
  const result = new Promise<string | null>((res) => {
    const timer = setTimeout(() => {
      stopped = true
      try {
        rec.stop()
      } catch {}
      res(null)
    }, timeoutMs)
    rec.onresult = (e: any) => {
      let interim = ''
      let final = ''
      for (const r of e.results) {
        if (r.isFinal) final += r[0].transcript
        else interim += r[0].transcript
      }
      if (interim) onInterim(interim)
      if (final) {
        clearTimeout(timer)
        try {
          rec.stop()
        } catch {}
        res(final.trim())
      }
    }
    rec.onerror = () => {
      clearTimeout(timer)
      if (!stopped) res(null)
    }
    rec.onend = () => {
      clearTimeout(timer)
      if (!stopped) res(null)
    }
    try {
      rec.start()
    } catch {
      res(null)
    }
  })
  return {
    result,
    stop: () => {
      stopped = true
      try {
        rec.abort()
      } catch {}
    },
  }
}
