export const robotEcosystemRankingVersion = 'robot-ecosystem-v1'

export type EcosystemRankingInput = {
  id: string
  lastActivityAt: Date
  githubCheckedAt: Date | null
  stars: number | null
  forks: number | null
  confirmedCount: number
  disputedCount: number
}

export type EcosystemRanking = {
  rank: number
  total: number
  formulaVersion: typeof robotEcosystemRankingVersion
  reasons: string[]
}

function ageInDays(now: Date, then: Date) { return Math.max(0, (now.getTime() - then.getTime()) / 86_400_000) }

// This ranks only projects already verified as compatible with one robot. It
// does not create a global RobotSpace score and does not replace evidence or moderation.
export function rankRobotEcosystemProjects<T extends EcosystemRankingInput>(projects: T[], now = new Date()): Array<T & { ranking: EcosystemRanking }> {
  const ranked = projects.map(project => {
    const reasons = ['Verified compatibility']
    let score = 40
    const activityAge = ageInDays(now, project.lastActivityAt)
    if (activityAge <= 30) { score += 25; reasons.push('GitHub activity in the last 30 days') }
    else if (activityAge <= 90) { score += 15; reasons.push('GitHub activity in the last 90 days') }
    else if (activityAge <= 365) { score += 6; reasons.push('GitHub activity in the last year') }
    if (project.githubCheckedAt) {
      const checkAge = ageInDays(now, project.githubCheckedAt)
      if (checkAge <= 7) { score += 15; reasons.push('GitHub data checked this week') }
      else if (checkAge <= 30) { score += 8; reasons.push('GitHub data checked this month') }
    }
    const signals = Math.min(10, Math.floor(Math.log10((project.stars ?? 0) + 1) * 3)) + Math.min(5, Math.floor(Math.log10((project.forks ?? 0) + 1) * 2))
    if (signals > 0) { score += signals; reasons.push('Repository activity signals') }
    if (project.confirmedCount > 0) { score += Math.min(8, project.confirmedCount * 2); reasons.push(`${project.confirmedCount} accepted community confirmation${project.confirmedCount === 1 ? '' : 's'}`) }
    if (project.disputedCount > 0) { score -= Math.min(8, project.disputedCount * 4); reasons.push(`${project.disputedCount} accepted community dispute${project.disputedCount === 1 ? '' : 's'}`) }
    return { project, score: Math.max(0, score), reasons }
  }).sort((left, right) => right.score - left.score || right.project.lastActivityAt.getTime() - left.project.lastActivityAt.getTime() || left.project.id.localeCompare(right.project.id))
  return ranked.map((project, index) => {
    return { ...project.project, ranking: { rank: index + 1, total: ranked.length, formulaVersion: robotEcosystemRankingVersion, reasons: project.reasons } }
  })
}
