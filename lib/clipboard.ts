// the old selection trick. it has to run inside the click that asked for it, because the
// browser only allows a copy while the gesture is still live.
function copyBySelection(text: string): boolean {
  try {
    const area = document.createElement('textarea')
    area.value = text
    // off screen, and readonly so phones do not pop the keyboard up
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    document.body.appendChild(area)
    area.select()
    const copied = document.execCommand('copy')
    area.remove()
    return copied
  } catch {
    return false
  }
}

// navigator.clipboard only exists on a secure origin, so a plain http deployment or an
// older browser would silently copy nothing. fall back there rather than doing nothing.
export function copyText(text: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return Promise.resolve(copyBySelection(text))

  return navigator.clipboard.writeText(text).then(
    () => true,
    // permission refused or the page was not focused. the gesture has usually expired by
    // now, but the old path still succeeds in some browsers, so it is worth the attempt
    () => copyBySelection(text)
  )
}
