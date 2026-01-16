export const getAvatarUrl = (seed: string) => {
  const safeSeed = encodeURIComponent(seed.trim() || 'user');
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeSeed}`;
};

export const AVATAR_LIBRARY = Array.from({ length: 10 }, (_, index) =>
  getAvatarUrl(`orbit-${index + 1}`)
);

export const resolveAvatarUrl = (seed: string, avatarUrl?: string | null) => {
  if (avatarUrl && avatarUrl.trim()) return avatarUrl;
  return getAvatarUrl(seed);
};
