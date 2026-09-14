'use client'

import { useState, useCallback, useSyncExternalStore } from 'react'

const noopSubscribe = () => () => {}

export function useSpeechSynthesis() {
  const [speakingId, setSpeakingId] = useState<string | null>(null)

  // false on the server, real value in the browser
  const isSupported = useSyncExternalStore(noopSubscribe, () => 'speechSynthesis' in window, () => false)

  const speak = useCallback(
    (text: string, id: string) => {
      if (!isSupported) return
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.onend = () => setSpeakingId(null)
      utterance.onerror = () => setSpeakingId(null)
      setSpeakingId(id)
      window.speechSynthesis.speak(utterance)
    },
    [isSupported]
  )

  const stop = useCallback(() => {
    if (!isSupported) return
    window.speechSynthesis.cancel()
    setSpeakingId(null)
  }, [isSupported])

  return { speak, stop, speakingId, isSupported }
}
