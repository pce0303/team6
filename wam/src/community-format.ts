export const emoji: Record<string, string> = {
  밥: '🍚',
  카페: '☕',
  노래방: '🎤',
  공부: '📚',
  축제: '🎪',
  기타: '✨',
}
export const shiftDate = (date: string, offset: number) => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}
export const prettyDate = (date: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
export const clock = (value: number) =>
  new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(value)
