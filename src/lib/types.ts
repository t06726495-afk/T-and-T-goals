export interface Profile {
  id: string
  display_name: string
  avatar_emoji: string
  accent_color: string | null
  timezone: string
  points_total: number
  current_level: number
  created_at: string
}

export interface CoupleInfo {
  couple_id: string
  invite_code: string
  member_count: number
}
