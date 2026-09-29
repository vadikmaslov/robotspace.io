// Preserve existing robot name routes, but encode reserved URL characters.
export const robotSlug = (name: string) => name.trim().toLowerCase().replace(/\s+/g, '-')
export const robotUrl = (name: string) => `/robots/${encodeURIComponent(robotSlug(name))}`
export const articleSlug = (title: string) => title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 80)
export const companyUrl = (slug: string) => `/companies/${encodeURIComponent(slug)}`
