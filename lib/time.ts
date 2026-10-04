const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// a stamp short enough to sit beside the message buttons: the time for something asked
// today, the date for anything older, and the year as well once it is not this year
export function shortTimestamp(iso: string, now: Date = new Date()): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''

  const sameDay =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate()

  if (sameDay) {
    const hours = at.getHours()
    const minutes = at.getMinutes().toString().padStart(2, '0')
    return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? 'am' : 'pm'}`
  }

  const day = `${at.getDate()} ${MONTHS[at.getMonth()]}`
  return at.getFullYear() === now.getFullYear() ? day : `${day} ${at.getFullYear()}`
}
