export type Track = {
  id: number;
  title: string;
  artist: string;
  albumTitle?: string;
  description?: string;
  lyrics?: string;
  durationSeconds: number | null;
  artworkUrl: string;
  language?: string;
  genre?: string;
  releaseYear?: number | null;
  visibility?: "public" | "private";
  ownerId?: number;
  channelId?: number;
  channelName?: string;
  channelHandle?: string;
  ownerUsername?: string;
  positionSeconds?: number;
  playedAt?: string | null;
  sha256?: string;
  objectKey?: string;
};

export type Playlist = {
  id: number;
  ownerId: number;
  title: string;
  description: string;
  artworkUrl: string;
  visibility: "public" | "private";
};

export type Album = {
  id: number;
  ownerId: number;
  channelId: number;
  title: string;
  description: string;
  artworkUrl: string;
  releaseDate: string | null;
  genre: string;
  language: string;
  visibility: "public" | "private";
};

export type UserProfile = {
  id: number;
  email: string;
  username: string;
  displayName: string;
  birthDate: string;
  gender: string;
  avatarUrl: string;
  bio: string;
  emailVerified: boolean;
  isPrivate: boolean;
  recommendationsEnabled: boolean;
  historyEnabled: boolean;
  createdAt: string | null;
};

export type Channel = {
  id: number;
  ownerId: number;
  name: string;
  handle: string;
  imageUrl: string;
  bannerUrl: string;
  description: string;
  links: string[];
  language: string;
  genre: string;
  visibility: "public" | "private";
  subscribers?: number;
  publishedTracks?: number;
};
