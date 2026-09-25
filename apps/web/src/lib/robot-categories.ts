export const ROBOT_CATEGORIES = [
  'Industrial', 'Humanoid', 'Service', 'Logistics', 'Medical',
  'Agriculture', 'Defense', 'Education', 'Inspection', 'Consumer',
] as const

export type RobotCategory = typeof ROBOT_CATEGORIES[number]
