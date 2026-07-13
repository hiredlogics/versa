/** User-scoped Prisma filters for lead search records. */
export function scopedLeadSearchWhere(userId: string, searchId?: string) {
  return {
    userId,
    deletedAt: null as null,
    ...(searchId ? { id: searchId } : {}),
  };
}

export function scopedLeadWhere(userId: string) {
  return {
    userId,
    deletedAt: null as null,
  };
}
