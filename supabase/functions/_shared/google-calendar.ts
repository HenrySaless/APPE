function pad(value: number) {
  return String(value).padStart(2, "0")
}

function toGoogleDate(date: Date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
}

function extractYear(label?: string) {
  if (!label) return null
  const match = label.match(/(20\d{2})/)
  return match ? Number(match[1]) : null
}

function extractMonth(courseDate?: string) {
  if (!courseDate) return null
  const match = courseDate.match(/\/(\d{2})/)
  return match ? Number(match[1]) : null
}

function extractDays(courseDate?: string) {
  if (!courseDate) return []
  return [...courseDate.matchAll(/(\d{2})/g)].map((item) => Number(item[1]))
}

export function buildGoogleCalendarUrl(course: {
  title: string
  data: string
  label?: string | null
  local?: string | null
  modalidade: string
}) {
  const year = extractYear(course.label ?? undefined)
  const month = extractMonth(course.data)
  const days = extractDays(course.data)

  const details = [
    `Curso: ${course.title}`,
    `Modalidade: ${course.modalidade}`,
    `Data: ${course.data}`,
  ]

  if (course.local) {
    details.push(`Local: ${course.local}`)
  }

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `APPE - ${course.title}`,
    details: details.join("\n"),
  })

  if (course.local) {
    params.set("location", course.local)
  }

  if (year && month && days.length >= 2) {
    const start = new Date(Date.UTC(year, month - 1, days[0]))
    const end = new Date(Date.UTC(year, month - 1, days[1] + 1))
    params.set("dates", `${toGoogleDate(start)}/${toGoogleDate(end)}`)
  } else if (year && month && days.length >= 1) {
    const start = new Date(Date.UTC(year, month - 1, days[0]))
    const end = new Date(Date.UTC(year, month - 1, days[0] + 1))
    params.set("dates", `${toGoogleDate(start)}/${toGoogleDate(end)}`)
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
